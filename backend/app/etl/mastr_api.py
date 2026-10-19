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
# How a detail call says the unit is gone: "Objekt nicht gefunden", "Die Einheit kann nicht abgerufen werden, die Einheit
# wurde gelöscht / deaktiviert." Any other fault (e.g. quota used up) stops the run instead of passing as a gone unit.
GONE = ("nicht gefunden", "kann nicht abgerufen werden")
# How GetMarktakteur refuses a market actor it no longer hands out (deactivated ones, which old Netzanschlusspunkte still
# name): "… da der Marktakteur nicht gültig ist oder dafür nicht verwendet werden kann"
INVALID_ACTOR = "der Marktakteur nicht gültig ist"
ACTIVE = "Aktiv"  # EinheitSystemstatus of the units the register hands out (and the export contains)


class MastrApi:
    def __init__(self):
        self.client = Client(WSDL, transport=Transport(session=_retrying_session(), operation_timeout=TIMEOUT))
        self.anlage = self.client.bind("Marktstammdatenregister", "Anlage")
        self.allgemein = self.client.bind("Marktstammdatenregister", "Allgemein")
        self.akteur = self.client.bind("Marktstammdatenregister", "Akteur")
        self.netzanschlusspunkt = self.client.bind("Marktstammdatenregister", "Netzanschlusspunkt")
        self.auth = {
            "apiKey": os.environ["webservice_key"],  # noqa: SIM112 (name as in the .env files)
            "marktakteurMastrNummer": os.getenv("mastr_nummer", "SOM922653610750"),  # noqa: SIM112
        }
        self._enum_fields: dict[str, frozenset[str]] = {}  # detail call -> its enum fields

    def quota(self) -> tuple[int, int]:
        """(calls used today, daily limit)."""
        answer = self.allgemein.GetAktuellerStandTageskontingent(**self.auth)
        return answer.AktuellerStandTageskontingent, answer.AktuellesLimitTageskontingent

    def server_time(self) -> datetime:
        """The register's clock, in local time like every date it stores."""
        return self.allgemein.GetLokaleUhrzeit().LokaleUhrzeit.replace(tzinfo=None)

    def changed_units(
        self,
        einheittyp: str,
        since: datetime,
        list_call: str = "GetGefilterteListeStromErzeuger",
        energietraeger: str | None = None,
    ) -> dict[str, datetime]:
        """EinheitMastrNummer -> date of the latest change, for every active unit of one type changed since `since`.

        Two lists: units with a newer DatumLetzteAktualisierung, and units whose grid operator check changed.
        The check doesn't touch the unit's own date, so the first list alone would miss it. The second list also
        names units that were deactivated or deleted since: the register refuses their details, they are skipped.
        Power units are listed by their Energieträger (list_call GetGefilterteListeStromErzeuger). Gas units have one list
        for producers and storage units (GetGefilterteListeGasErzeuger), which keeps the units of the type asked for.
        The types of many Energieträger (biomass, combustion, nuclear, geothermal) are listed by their type
        (GetListeLetzteAktualisierung, by their own date: no linked object).
        """
        by_type = list_call == "GetListeLetzteAktualisierung"
        if by_type:
            filters = {"Einheittyp": einheittyp, "VerknuepftesObjektArt": "None"}
        else:
            filters = {"energietraeger": energietraeger} if energietraeger else {}
        listed = self._list(getattr(self.anlage, list_call), **filters, datumAb=since)
        checked = self._list(
            self.anlage.GetListeLetzteAktualisierung,
            Einheittyp=einheittyp,
            VerknuepftesObjektArt="Netzbetreiberpruefungsprozess",
            VerknuepftesObjektDatumAb=since,
        )
        units, inactive = {}, set()
        for unit in listed:
            if not energietraeger and unit.Einheittyp != einheittyp:  # the other gas unit type
                continue
            if unit.EinheitSystemstatus != ACTIVE:
                inactive.add(unit.EinheitMastrNummer)
                continue
            # sic, the lists by Energieträger drop the "t"
            units[unit.EinheitMastrNummer] = (
                unit.EinheitDatumLetzteAktualisierung if by_type else unit.DatumLetzeAktualisierung
            )
        for unit in checked:
            if unit.EinheitSystemstatus != ACTIVE:
                inactive.add(unit.EinheitMastrNummer)
                continue
            processes = unit.Netzbetreiberpruefungsprozesse or []
            check = max(
                (process.DatumLetzteAktualisierung for process in processes),
                default=unit.EinheitDatumLetzteAktualisierung,
            )
            units[unit.EinheitMastrNummer] = max(units.get(unit.EinheitMastrNummer, check), check)
        if inactive:
            log.info(f"{einheittyp}: {len(inactive):,} units were deactivated or deleted in the register, skipped")
        return units

    def changed_points(self, since: datetime) -> Iterator[dict]:
        """Every Netzanschlusspunkt changed since `since`, of every Lokationtyp, as the export's fields would come from the
        API (encode with codes.GRID_CONNECTION_POINT_LIST): the list has all of them, no detail calls. Its
        Bilanzierungsgebiet is an object, the export keeps its Id and its Regelzone."""
        for point in self._list(
            self.netzanschlusspunkt.GetListeAlleNetzanschlusspunkte, "ListeNetzanschlusspunkte", datumAb=since
        ):
            point = serialize_object(point, dict)
            point.pop("EinheitMitOrtUndPlz", None)  # the units of its Lokation, which the export doesn't list here
            area = point.pop("Bilanzierungsgebiet", None) or {}
            point["BilanzierungsgebietNetzanschlusspunktId"] = area.get("Id")
            point["RegelzoneNetzanschlusspunkt"] = area.get("Regelzone")
            yield point

    def grid_operator(self, mastr_nummer: str) -> dict | None:
        """A grid operator (Marktakteur) as the export's fields would come from the API (encode with
        codes.GRID_OPERATOR), or None if the register doesn't know it or doesn't hand it out (any more). Its market roles and grid come as objects, the
        export keeps their numbers: "SNB…AN, SNB…BV" and "SNE…"."""
        try:
            answer = self.akteur.GetMarktakteur(**self.auth, mastrNummer=mastr_nummer)
        except Fault as error:
            if not any(reason in error.message for reason in (*GONE, INVALID_ACTOR)):
                raise
            log.info(f"GetMarktakteur {mastr_nummer}: {error.message}")
            return None
        actor = serialize_object(answer, dict)
        for field in HEADER:
            del actor[field]
        roles = actor.pop("Marktrollen") or []
        actor["Marktrollen"] = ", ".join(role["MarktrolleMastrNummerId"] for role in roles) or None
        grid = actor.pop("Netz") or {}
        actor["Netz"] = grid.get("MastrNummer")
        actor["Nuts2"] = (actor.pop("Nuts2") or {}).get("nuts2Id")
        for field, value in list(actor.items()):
            if isinstance(value, list) or (isinstance(value, dict) and "Wert" not in value):
                del actor[field]  # details the export doesn't have (Marktakteursvertreter, …)
            elif isinstance(value, str) and value.startswith("<![CData[") and value.endswith("]]>"):
                actor[field] = value[len("<![CData[") : -len("]]>")]  # how the API wraps some links
        return actor

    def changed_grid_operators(self, since: datetime, functions: Iterable[str]) -> dict[str, datetime]:
        """MaStR number -> date of the latest change, for every market actor of these Marktfunktionen (e.g.
        "Stromnetzbetreiber") changed since `since`."""
        actors = {}
        for function in functions:
            for actor in self._list(
                self.akteur.GetGefilterteListeMarktakteure, "Marktakteure", marktfunktion=function, datumAb=since
            ):
                actors[actor.MarktakteurMastrNummer] = actor.DatumLetzeAktualisierung  # sic
        return actors

    def _list(self, call: Callable, field: str = "Einheiten", **filters) -> Iterator:
        """All entries of a list call, page by page. field: the answer's list (most calls: Einheiten)."""
        for start in count(1, PAGE_SIZE):  # startAb counts from 1
            answer = call(**self.auth, **filters, startAb=start, limit=PAGE_SIZE)
            yield from getattr(answer, field) or []
            if answer.Ergebniscode != "OkWeitereDatenVorhanden":
                return

    def details(self, method: str, ids: Iterable[str], id_field: str = "einheitMastrNummer") -> Iterator[dict | None]:
        """All fields of each unit (e.g. method="GetEinheitSolar"), in the order of `ids`, several calls at a time.
        Storage plants: method="GetStromSpeicher" (gas: "GetGasSpeicher"), id_field="speMastrNummer"."""
        with ThreadPoolExecutor(WORKERS) as pool:
            yield from pool.map(partial(self.detail, method, id_field=id_field), ids)

    def detail(self, method: str, mastr_nummer: str, id_field: str = "einheitMastrNummer") -> dict | None:
        """All fields of one unit (or plant), or None if the register doesn't know it (anymore)."""
        try:
            answer = getattr(self.anlage, method)(**self.auth, **{id_field: mastr_nummer})
        except Fault as error:
            if not any(reason in error.message for reason in GONE):
                raise
            log.info(f"{method} {mastr_nummer}: {error.message}")
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
