"""
Client for the MaStR SOAP API (the web service of the Marktstammdatenregister).

The API works in two steps: a list call finds units (at most 2,000 per call), then one detail call per unit
returns all of its fields. Every call counts against the daily quota of 100,000 calls.
All dates in the register are German local time without a time zone, and so are the dates this client returns.

Credentials come from backend/.env: `webservice_key` and, optionally, `mastr_nummer`.
"""

import logging
import os
from collections.abc import Callable, Iterable, Iterator
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime
from functools import cached_property, partial
from itertools import count

from dotenv import load_dotenv
from lxml import etree
from requests import Session
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry
from zeep import Client
from zeep.exceptions import Fault
from zeep.helpers import serialize_object
from zeep.transports import Transport

load_dotenv()

log = logging.getLogger(__name__)

WSDL = "https://www.marktstammdatenregister.de/MaStRAPI/wsdl/mastr.wsdl"
XSD = "https://www.marktstammdatenregister.de/MaStRAPI/xsd/mastrbasetypes.xsd"
PAGE_SIZE = 2000  # the most a list call returns
WORKERS = 4  # parallel detail calls
TIMEOUT = 60  # seconds per call; normal: 0.2 s for details, 4 s for a list page. The API sometimes hangs, then we retry
HEADER = ("Ergebniscode", "AufrufVeraltet", "AufrufLebenszeitEnde", "AufrufVersion")  # in every answer, not data


class MastrApi:
    def __init__(self):
        self.client = Client(WSDL, transport=Transport(session=_retrying_session(), operation_timeout=TIMEOUT))
        self.anlage = self.client.bind("Marktstammdatenregister", "Anlage")
        self.allgemein = self.client.bind("Marktstammdatenregister", "Allgemein")
        self.auth = {
            "apiKey": os.environ["webservice_key"],
            "marktakteurMastrNummer": os.getenv("mastr_nummer", "SOM922653610750"),
        }
        self._enum_fields: dict[str, frozenset[str]] = {}  # detail call -> its enum fields

    def quota(self) -> tuple[int, int]:
        """(calls used today, daily limit)."""
        answer = self.allgemein.GetAktuellerStandTageskontingent(**self.auth)
        return answer.AktuellerStandTageskontingent, answer.AktuellesLimitTageskontingent

    def server_time(self) -> datetime:
        """The register's clock, in local time like every date it stores."""
        return self.allgemein.GetLokaleUhrzeit().LokaleUhrzeit.replace(tzinfo=None)

    def changed_units(self, energietraeger: str, einheittyp: str, since: datetime) -> dict[str, datetime]:
        """EinheitMastrNummer -> date of the latest change, for every unit of one type changed since `since`.

        Two lists: units with a newer DatumLetzteAktualisierung, and units whose grid operator check changed.
        The check doesn't touch the unit's own date, so the first list alone would miss it.
        """
        units = {
            unit.EinheitMastrNummer: unit.DatumLetzeAktualisierung  # sic, this list drops the "t"
            for unit in self._list(self.anlage.GetGefilterteListeStromErzeuger, energietraeger=energietraeger, datumAb=since)
        }
        checked = self._list(
            self.anlage.GetListeLetzteAktualisierung,
            Einheittyp=einheittyp,
            VerknuepftesObjektArt="Netzbetreiberpruefungsprozess",
            VerknuepftesObjektDatumAb=since,
        )
        for unit in checked:
            processes = unit.Netzbetreiberpruefungsprozesse or []
            check = max((process.DatumLetzteAktualisierung for process in processes), default=unit.EinheitDatumLetzteAktualisierung)
            units[unit.EinheitMastrNummer] = max(units.get(unit.EinheitMastrNummer, check), check)
        return units

    def _list(self, call: Callable, **filters) -> Iterator:
        """All entries of a list call, page by page."""
        for start in count(1, PAGE_SIZE):  # startAb counts from 1
            answer = call(**self.auth, **filters, startAb=start, limit=PAGE_SIZE)
            yield from answer.Einheiten or []
            if answer.Ergebniscode != "OkWeitereDatenVorhanden":
                return

    def details(self, method: str, ids: Iterable[str]) -> Iterator[dict | None]:
        """All fields of each unit (e.g. method="GetEinheitSolar"), in the order of `ids`, several calls at a time."""
        with ThreadPoolExecutor(WORKERS) as pool:
            yield from pool.map(partial(self.detail, method), ids)

    def detail(self, method: str, einheit_mastr_nummer: str) -> dict | None:
        """All fields of one unit, or None if the register doesn't know it (anymore)."""
        try:
            answer = getattr(self.anlage, method)(**self.auth, einheitMastrNummer=einheit_mastr_nummer)
        except Fault as error:
            if error.message != "Objekt nicht gefunden":  # anything else (e.g. quota used up) must not look like a gap
                raise
            log.debug(f"{method} {einheit_mastr_nummer}: not in the register")
            return None
        if answer.Ergebniscode == "KeineDatenVorhanden":
            return None
        unit = serialize_object(answer, dict)
        for field in HEADER:
            del unit[field]
        for field in self._enum_fields.setdefault(method, frozenset(self.enum_types(method))):
            if unit[field] == "None":  # how the API says an enum field is empty
                unit[field] = None
        return unit

    def enum_types(self, method: str) -> dict[str, str]:
        """Field -> name of its enum type, for the enum fields a method returns."""
        operation = self.client.wsdl.services["Marktstammdatenregister"].ports["Anlage"].binding.all()[method]
        return {
            name: element.type.name
            for name, element in operation.output.body.type.elements
            if (element.type.name or "").endswith("Enum")
        }

    @cached_property
    def schema(self):
        return etree.fromstring(self.client.transport.load(XSD))

    def enum_labels(self, enum_name: str) -> dict[str, str]:
        """Enum value -> German label, from the documentation in the XSD (zeep drops enum values)."""
        ns = {"xs": "http://www.w3.org/2001/XMLSchema"}
        nodes = self.schema.xpath(f'//xs:simpleType[@name="{enum_name}"]//xs:enumeration', namespaces=ns)
        return {n.get("value"): " ".join(n.xpath("string(.//xs:documentation)", namespaces=ns).split()) for n in nodes}


def _retrying_session() -> Session:
    """HTTP session that retries network errors and overloaded servers, pausing 2, 4, 8, ... s in between.

    SOAP faults (HTTP 500, e.g. an unknown unit) are answers, not failures, so they are not retried.
    All calls are read-only, which makes retrying the POSTs safe.
    """
    retry = Retry(total=5, backoff_factor=2, status_forcelist=(502, 503, 504), allowed_methods=None)
    session = Session()
    session.mount("https://", HTTPAdapter(max_retries=retry, pool_maxsize=WORKERS))
    return session
