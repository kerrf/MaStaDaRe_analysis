"""codes.encode: a unit from the API has to become exactly the row the raw tables have for it from the bulk export –
the export's row, with the texts of its codes (codes.to_texts)."""

from datetime import date, datetime
from decimal import Decimal

import pandas as pd
from app.codes import (
    COMBUSTION,
    GAS_PRODUCER,
    GAS_STORAGE,
    GRID,
    GRID_CONNECTION_POINT_LIST,
    GRID_OPERATOR,
    KWK_PLANT,
    STORAGE,
    WIND,
    decode,
    encode,
    to_texts,
)


def wind_unit(**fields) -> dict:
    """A detail answer of GetEinheitWind, shaped like the API's (only the fields a test needs)."""
    return {
        "EinheitMastrNummer": "SEE900019954427",
        "DatumLetzteAktualisierung": datetime.fromisoformat("2026-06-18T11:33:19.174853"),  # local time, no zone
        "EinheitBetriebsstatus": "InBetrieb",
        "Laengengrad": Decimal("9.081272"),
        **fields,
    }


def test_values_become_the_texts_of_their_codes():
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
    assert row["EinheitBetriebsstatus"] == "In Betrieb"  # code 35
    assert row["Registrierungsdatum"] == "2019-02-27"
    assert row["Bruttoleistung"] == "2000.000"
    assert (row["FernsteuerbarkeitNb"], row["Buergerenergie"]) == ("1", "0")
    assert row["Hersteller"] == "ENERCON GmbH"  # code 1586


def test_fields_get_the_export_names():
    row = encode(wind_unit(LokationMastrNummer="SEL919773458102", WindAnLandOderSee="WindAnLand"), WIND)
    assert row["LokationMaStRNummer"] == "SEL919773458102"
    assert row["WindAnLandOderAufSee"] == "Windkraft an Land"  # code 888
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
    assert row["Speicherart"] == "Kavernenspeicher"
    assert row["SpeicherMaStRNummer"] == "GSE917820127322"
    assert (row["Weic"], row["Weic_Na"]) == (None, "0")  # the export's flag column for Weic, not Weic_nv


def test_gas_producers_keep_their_own_number_apart():
    row = encode({"Technologie": "LiquifidNaturalGas", "MastrNummer": "GEE929621070042"}, GAS_PRODUCER)
    assert row["Technologie"] == "Liquefied Natural Gas"  # the API's spelling: LiquifidNaturalGas
    assert "SpeicherMaStRNummer" not in row  # the API's MastrNummer only repeats the unit's number


def test_fuels_of_combustion_units_become_texts():
    """The further fuels come like a Hausnummer ({"Wert": …, "NichtVorhanden": …}), their values from the catalog."""
    row = encode(
        {
            "Hauptbrennstoff": "Steinkohlen",
            "WeitererHauptbrennstoff": {"Wert": "ErdgasErdoelgas", "NichtVorhanden": False},
            "WeitereBrennstoffe": {"Wert": ["HeizoelLeicht", "Biogas"], "NichtVorhanden": False},
            "Technologie": "KalinaCycle",
            "AnschlussAnHoechstOderHochSpannung": None,
        },
        COMBUSTION,
    )
    assert row["Hauptbrennstoff"] == "Steinkohlen"
    assert row["WeitererHauptbrennstoff"] == "Erdgas, Erdölgas"
    assert row["WeitereBrennstoffe"] == "Heizöl, leicht; Biogas"  # texts with commas: "; " between them
    assert row["Technologie"] == "Kalina-Cycle"
    assert "AnschlussAnHoechstOderHochSpannung" not in row  # not in the API's answers


def test_no_further_fuel_stays_empty():
    row = encode(
        {
            "WeitererHauptbrennstoff": {"Wert": "None", "NichtVorhanden": True},  # the API's empty enum value
            "WeitereBrennstoffe": {"Wert": [], "NichtVorhanden": True},
        },
        COMBUSTION,
    )
    assert row["WeitererHauptbrennstoff"] is None
    assert row["WeitereBrennstoffe"] is None


def test_grid_operators_get_texts_and_export_names():
    row = encode(
        {
            "Rechtsform": {"Id": 429, "Wert": "GmbH"},
            "Bundesland": "Bayern",
            "ZustellLand": "Schweden",
            "Marktfunktion": "Stromnetzbetreiber",
        },
        GRID_OPERATOR,
    )
    assert (row["Rechtsform"], row["Bundesland"], row["LandAnZustelladresse"]) == ("GmbH", "Bayern", "Schweden")
    assert row["Marktfunktion"] == "Stromnetzbetreiber"  # Marktfunktionen.xml, not Katalogwerte.xml (code 1)


def test_a_code_newer_than_the_catalogs_keeps_the_apis_text():
    row = encode({"Hersteller": {"Id": 9_999_999, "Wert": "Neuer Hersteller GmbH"}}, WIND)
    assert row["Hersteller"] == "Neuer Hersteller GmbH"


def test_lists_of_codes_with_a_trailing_comma():
    grids = decode(pd.DataFrame({"Bundesland": ["337, 342", "332, 333, 345, "], "Sparte": ["21", "20"]}), GRID)
    assert grids["Bundesland"].tolist() == ["Hessen; Rheinland-Pfalz", "Brandenburg; Berlin; Sachsen"]
    assert grids["Sparte"].tolist() == ["Gas", "Strom"]


def test_export_rows_get_texts_in_place():
    """db_migrate: a row of the export, as extract.read_units yields it"""
    row = to_texts(
        {"EinheitMastrNummer": "SEE900019954427", "EinheitBetriebsstatus": "35", "Hersteller": "1586", "Seelage": None},
        WIND,
    )
    assert row == {
        "EinheitMastrNummer": "SEE900019954427",
        "EinheitBetriebsstatus": "In Betrieb",
        "Hersteller": "ENERCON GmbH",
        "Seelage": None,
    }


def test_texts_stay_texts_and_unknown_codes_codes():
    """to_texts can run over a row twice; a code the catalogs don't have stays (logged)"""
    row = to_texts({"EinheitBetriebsstatus": "In Betrieb", "Technologie": "1", "AcDcKoppelung": "999999"}, STORAGE)
    assert row["EinheitBetriebsstatus"] == "In Betrieb"
    assert row["AcDcKoppelung"] == "999999"


def test_storage_units_name_their_eeg_type_by_the_list_of_its_own_file():
    assert to_texts({"EegAnlagentyp": "8"}, STORAGE)["EegAnlagentyp"] == "Stromspeichereinheit"  # Einheitentypen.xml


def test_kwk_plants_from_the_api():
    """GetAnlageKwk, after update.fetch_plants turned its units into the export's list"""
    row = encode(
        {
            "KwkMastrNummer": "KWK941886928838",
            "ThermischeNutzleistung": Decimal("100.700"),
            "ElektrischeKwkLeistung": Decimal("50.000"),
            "AnlageBetriebsstatus": "InBetrieb",
            "AusschreibungZuschlag": False,
            "VerknuepfteEinheitenMaStRNummern": "SEE901400041030, SEE904354457438",
        },
        KWK_PLANT,
    )
    assert row["AnlageBetriebsstatus"] == "In Betrieb"
    assert row["VerknuepfteEinheitenMaStRNummern"] == "SEE901400041030, SEE904354457438"  # numbers, not codes
    assert (row["ElektrischeKwkLeistung"], row["AusschreibungZuschlag"]) == ("50.000", "0")


def test_listed_netzanschlusspunkte_become_export_rows():
    """GetListeAlleNetzanschlusspunkte, after mastr_api.changed_points took the Bilanzierungsgebiet apart"""
    row = encode(
        {
            "NetzanschlusspunktMastrNummer": "SAN998216990188",
            "LetzteAenderung": datetime.fromisoformat("2026-09-26T00:01:56.103680"),
            "LokationMastrNummer": "SEL967838825079",
            "Lokationtyp": "Stromerzeugungslokation",
            "Spannungsebene": "Niederspannung",
            "Nettoengpassleistung": Decimal("8.550"),
            "GeplanterNetzanschlusspunkt": False,
            "NetzbetreiberMastrNummer": "SNB926394308747",
            "BilanzierungsgebietNetzanschlusspunktId": 8,
            "RegelzoneNetzanschlusspunkt": "Amprion",
        },
        GRID_CONNECTION_POINT_LIST,
    )
    assert row["LokationMaStRNummer"] == "SEL967838825079"
    assert row["NetzbetreiberMaStRNummer"] == "SNB926394308747"
    assert row["Lokationtyp"] == "Stromerzeugungslokation"  # Lokationstypen.xml: code 1
    assert row["Spannungsebene"] == "Niederspannung (= Hausanschluss/Haushaltsstrom)"  # code 354
    assert row["RegelzoneNetzanschlusspunkt"] == "Amprion"  # code 1000010
    assert (row["NochInPlanung"], row["BilanzierungsgebietNetzanschlusspunktId"]) == ("0", "8")
    assert row["LetzteAenderung"] == "2026-09-26T00:01:56.103680"


def test_address_flags_stay_for_what_has_no_coordinates_at_all():
    """Units without public coordinates have no address flags in the export; grid operators have no coordinates"""
    unit = encode(wind_unit(Laengengrad=None, Hausnummer={"Wert": "7", "NichtVorhanden": False}), WIND)
    actor = encode({"Hausnummer": {"Wert": "7", "NichtVorhanden": False}}, GRID_OPERATOR)
    assert unit["Hausnummer_nv"] is None
    assert actor["Hausnummer_nv"] == "0"


def test_every_raw_table_has_its_export_file_and_spec():
    """db_migrate loads by EXPORT_FILES, decode_codes and the JSON of the website go by TABLE_SPECS, the nightly update
    by its own types: a table missing in one of them would keep its codes or lose its file."""
    from app.codes import TABLE_SPECS
    from app.etl.db_migrate import EXPORT_FILES
    from app.etl.update import PLANT_TYPES, UNIT_TYPES

    assert set(TABLE_SPECS) == set(EXPORT_FILES)
    for unit_type in UNIT_TYPES:
        assert TABLE_SPECS[unit_type.table] is unit_type.spec
    for kinds in PLANT_TYPES.values():
        for plants in kinds:
            assert TABLE_SPECS[plants.table] is plants.spec


def test_every_code_of_every_column_has_a_text():
    """Except the code the register replaced (3195 by 3247, no unit has it any more)"""
    from app.codes import TABLE_SPECS

    missing = {
        (table, column, code)
        for table, spec in TABLE_SPECS.items()
        for column, catalog in spec.columns.items()
        for code in catalog
        if spec.text_of(column, code) is None
    }
    assert {code for *_, code in missing} <= {3195}
