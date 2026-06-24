CREATE SCHEMA IF NOT EXISTS stg;

DROP TABLE IF EXISTS stg.solar_units_plz_agg;

CREATE TABLE stg.solar_units_plz_agg AS
SELECT 
    "Postleitzahl",
    SUM("Bruttoleistung") AS total_power,
    COUNT("EinheitMastrNummer") AS unit_count
FROM raw.solar_units
WHERE "Postleitzahl" IS NOT NULL
GROUP BY "Postleitzahl";

CREATE INDEX idx_stg_solar_plz ON stg.solar_units_plz_agg ("Postleitzahl");