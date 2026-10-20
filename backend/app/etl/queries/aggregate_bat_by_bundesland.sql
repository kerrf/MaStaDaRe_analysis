CREATE SCHEMA IF NOT EXISTS mrt;

DROP MATERIALIZED VIEW IF EXISTS mrt.battery_units_bundesland_agg;

CREATE MATERIALIZED VIEW mrt.battery_units_bundesland_agg AS
-- TODO: Aggregation of population per bundesland
-- TODO: Size of each bundesland in qkm
SELECT 
    COALESCE("Bundesland", 'Unbekannt') AS "Bundesland",
    CAST(SUM("Bruttoleistung")  / 1000 AS NUMERIC(10,0)) AS total_power,
    CAST(SUM("Bruttoleistung") / 1 AS NUMERIC(10,0)) AS relative_area_power, --NULLIF(SUM(area."qkm"), 0) AS NUMERIC(10,0))
    CAST(SUM("Bruttoleistung") / 1 AS NUMERIC(10,0)) AS relative_population_power, --NULLIF(SUM(pop."einwohner"), 0) AS NUMERIC(10,2))
    COUNT("EinheitMastrNummer") AS total_units
FROM raw.storage_units
WHERE "Technologie" = 'Batterie'  -- the only storage technology that counts as a battery
  AND "Postleitzahl" IS NOT NULL
GROUP BY "Bundesland";