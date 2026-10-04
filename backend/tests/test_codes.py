"""codes.encode: a unit from the API has to become exactly the row the bulk export has for it."""

from datetime import date, datetime
from decimal import Decimal

from app.codes import GAS_PRODUCER, GAS_STORAGE, STORAGE, WIND, encode


def wind_unit(**fields) -> dict:
    """A detail answer of GetEinheitWind, shaped like the API's (only the fields a test needs)."""
    return {
        "EinheitMastrNummer": "SEE900019954427",
        "DatumLetzteAktualisierung": datetime.fromisoformat("2026-06-18T11:33:19.174853"),  # local time, no zone
        "EinheitBetriebsstatus": "InBetrieb",
        "Laengengrad": Decimal("9.081272"),
        **fields,
    }


def test_values_become_export_codes_and_text():
    row = encode(
        wind_unit(
            Registrierungsdatum=date(2019, 2, 27),
            Bruttoleistung=Decimal("2000.000"),
            FernsteuerbarkeitNb=True,
            Buergerenergie=False,
            Hersteller={"Id": 1586, "Wert": "ENERCON GmbH"},
        ),
        WIND,
    )
    assert row["DatumLetzteAktualisierung"] == "2026-06-18T11:33:19.174853"
    assert row["EinheitBetriebsstatus"] == "35"
    assert row["Registrierungsdatum"] == "2019-02-27"
    assert row["Bruttoleistung"] == "2000.000"
    assert (row["FernsteuerbarkeitNb"], row["Buergerenergie"]) == ("1", "0")
    assert row["Hersteller"] == "1586"


def test_fields_get_the_export_names():
    row = encode(wind_unit(LokationMastrNummer="SEL919773458102", WindAnLandOderSee="WindAnLand"), WIND)
    assert row["LokationMaStRNummer"] == "SEL919773458102"
    assert row["WindAnLandOderAufSee"] == "888"
    assert "LokationMastrNummer" not in row


def test_value_with_not_available_flag_becomes_two_columns():
    row = encode(
        wind_unit(Hausnummer={"Wert": "12a", "NichtVorhanden": False}, Weic={"Wert": None, "NichtVorhanden": True}),
        WIND,
    )
    assert (row["Hausnummer"], row["Hausnummer_nv"]) == ("12a", "0")
    assert (row["Weic"], row["Weic_nv"]) == (None, "1")


def test_address_flags_only_for_units_with_a_public_location():
    fields = {"StrasseNichtGefunden": False, "Hausnummer": {"Wert": None, "NichtVorhanden": False}}
    public = encode(wind_unit(**fields), WIND)
    private = encode(wind_unit(**fields, Laengengrad=None), WIND)
    assert (public["StrasseNichtGefunden"], public["Hausnummer_nv"]) == ("0", "0")
    assert (private["StrasseNichtGefunden"], private["Hausnummer_nv"]) == (None, None)


def test_empty_values_stay_empty():
    row = encode(wind_unit(Seelage=None, Hersteller={"Id": 1, "Wert": None}, Netzbetreiberzuordnungen=[{"a": 1}]), WIND)
    assert row["Seelage"] is None
    assert row["Hersteller"] is None
    assert row["Netzbetreiberzuordnungen"] is None


def test_columns_the_api_returns_empty_are_left_out():
    row = encode(wind_unit(NichtVorhandenInMigriertenEinheiten=None, Rotorblattenteisungssystem=None), WIND)
    assert "NichtVorhandenInMigriertenEinheiten" not in row
    assert "Rotorblattenteisungssystem" not in row


def test_dates_the_export_writes_with_a_time():
    row = encode(
        {"DatumKapazitaetsreserve": date(2026, 11, 2), "InbetriebnahmedatumAmAktuellenOrt": date(2024, 6, 1)}, STORAGE
    )
    assert row["DatumKapazitaetsreserve"] == "2026-11-02T00:00:00"
    assert row["InbetriebnahmedatumAmAktuellenStandort"] == "2024-06-01T00:00:00"


def test_unknown_values_become_null():
    assert encode(wind_unit(EinheitBetriebsstatus="GibtEsNicht"), WIND)["EinheitBetriebsstatus"] is None


def test_gas_storage_units_get_the_export_names():
    row = encode(
        {
            "EinheitMastrNummer": "GEE995046355477",
            "Speicherart": "Kavernenspeicher",
            "SpeMastrNummer": "GSE917820127322",
            "Weic": {"Wert": None, "NichtVorhanden": False},
            "Laengengrad": Decimal("6.992085"),
        },
        GAS_STORAGE,
    )
    assert row["Speicherart"] == "658"
    assert row["SpeicherMaStRNummer"] == "GSE917820127322"
    assert (row["Weic"], row["Weic_Na"]) == (None, "0")  # the export's flag column for Weic, not Weic_nv


def test_gas_producers_keep_their_own_number_apart():
    row = encode({"Technologie": "LiquifidNaturalGas", "MastrNummer": "GEE929621070042"}, GAS_PRODUCER)
    assert row["Technologie"] == "829"
    assert "SpeicherMaStRNummer" not in row  # the API's MastrNummer only repeats the unit's number
