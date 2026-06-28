CREATE SCHEMA IF NOT EXISTS stg;

DROP TABLE IF EXISTS stg.solar_units;

CREATE TABLE stg.solar_units AS
    SELECT
        "EinheitMastrNummer",
        "Bundesland",
        "Gemeinde",
        "Postleitzahl",
        "Ort",
        "Registrierungsdatum",
        "Inbetriebnahmedatum",
        "EinheitBetriebsstatus",
        "NameStromerzeugungseinheit",
        "Energietraeger",
        "Bruttoleistung",
        "Nettonennleistung",
        "Einspeisungsart",
        "ArtDerSolaranlage",
        "Hauptausrichtung",
        "HauptausrichtungNeigungswinkel",
    FROM raw.solar_units;

    ALTER TABLE stg.solar_units ADD PRIMARY KEY ("EinheitMastrNummer");

    CREATE INDEX idx_stg_solar_plz ON stg.solar_units ("Postleitzahl");
    CREATE INDEX idx_stg_solar_inbetriebnahme ON stg.solar_units ("Inbetriebnahmedatum");