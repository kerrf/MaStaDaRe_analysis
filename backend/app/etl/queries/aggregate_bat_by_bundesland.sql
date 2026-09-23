CREATE SCHEMA IF NOT EXISTS mrt;

DROP MATERIALIZED VIEW IF EXISTS mrt.solar_units_bundesland_agg;

CREATE MATERIALIZED VIEW mrt.solar_units_bundesland_agg AS
-- TODO: Aggregation of population per bundesland
-- TODO: Size of each bundesland in qkm
SELECT 
    CASE "Bundesland"
        WHEN '1400' THEN 'Brandenburg' WHEN '1401' THEN 'Berlin' WHEN '1402' THEN 'Baden-Württemberg'
        WHEN '1403' THEN 'Bayern' WHEN '1404' THEN 'Bremen' WHEN '1405' THEN 'Hessen'
        WHEN '1406' THEN 'Hamburg' WHEN '1407' THEN 'Mecklenburg-Vorpommern' WHEN '1408' THEN 'Niedersachsen'
        WHEN '1409' THEN 'Nordrhein-Westfalen' WHEN '1410' THEN 'Rheinland-Pfalz' WHEN '1411' THEN 'Schleswig-Holstein'
        WHEN '1412' THEN 'Saarland' WHEN '1413' THEN 'Sachsen' WHEN '1414' THEN 'Sachsen-Anhalt'
        WHEN '1415' THEN 'Thüringen' ELSE 'Unbekannt'
    END AS "Bundesland",
    CAST(SUM("")  / 1000 AS NUMERIC(10,0)) AS total_power,
    CAST(SUM("") / 1 AS NUMERIC(10,0)) AS relative_area_power, --NULLIF(SUM(area."qkm"), 0) AS NUMERIC(10,0))
    CAST(SUM("") / 1 AS NUMERIC(10,0)) AS relative_population_power, --NULLIF(SUM(pop."einwohner"), 0) AS NUMERIC(10,2))
    COUNT("EinheitMastrNummer") AS total_units
FROM raw.battery_units
WHERE "Postleitzahl" IS NOT NULL
GROUP BY "Bundesland";