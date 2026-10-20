CREATE SCHEMA IF NOT EXISTS mrt;

DROP MATERIALIZED VIEW IF EXISTS mrt.solar_units_bundesland_agg;

CREATE MATERIALIZED VIEW mrt.solar_units_bundesland_agg AS
-- TODO: Aggregation of population per bundesland
-- TODO: Size of each bundesland in qkm
SELECT 
    COALESCE("Bundesland", 'Unbekannt') AS "Bundesland",
    CAST(SUM("Bruttoleistung")  / 1000 AS NUMERIC(10,0)) AS total_power,
    CAST(SUM("Bruttoleistung") / 1 AS NUMERIC(10,0)) AS relative_area_power, --NULLIF(SUM(area."qkm"), 0) AS NUMERIC(10,0))
    CAST(SUM("Bruttoleistung") / 1 AS NUMERIC(10,0)) AS relative_population_power, --NULLIF(SUM(pop."einwohner"), 0) AS NUMERIC(10,2))
    COUNT("EinheitMastrNummer") AS total_units
FROM raw.solar_units
WHERE "Postleitzahl" IS NOT NULL
GROUP BY "Bundesland";