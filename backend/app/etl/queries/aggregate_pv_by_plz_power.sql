CREATE SCHEMA IF NOT EXISTS mrt;

DROP MATERIALIZED VIEW IF EXISTS mrt.solar_rollup_stats;

-- Like aggregate_pv_by_region_power.sql, by postcode: one row per Anlagenart ('gebaeude', 'freiflaeche') and PLZ, the
-- API sums the chosen ones. Units in operation only, Brutto (DC) and Netto (AC) power.
CREATE MATERIALIZED VIEW mrt.solar_rollup_stats AS
WITH plz5_solar_agg AS (
    -- 1. Pre-aggregate to 1 row per PLZ5 and Anlagenart to prevent JOIN explosions
    SELECT
        "Postleitzahl" AS plz5,
        CASE WHEN "ArtDerSolaranlage" = '852' THEN 'freiflaeche' ELSE 'gebaeude' END AS anlagenart,
        COUNT("EinheitMastrNummer") AS total_units,
        SUM("Bruttoleistung") AS total_power,
        SUM("Nettonennleistung") AS total_power_net
    FROM raw.solar_units
    WHERE "EinheitBetriebsstatus" = '35'  -- InBetrieb, like the region rollups
    GROUP BY 1, 2
),
plz_areas AS (
    -- Every PLZ5 with its area and population, once per Anlagenart. Use the base population table, not a rollup one,
    -- to avoid joining onto subtotals.
    SELECT area.plz AS plz5, area.qkm, pop.einwohner, arten.anlagenart
    FROM geo.plz_shapes_5 area
    LEFT JOIN mrt.plz_einwohner pop ON pop.plz = area.plz
    CROSS JOIN (VALUES ('gebaeude'), ('freiflaeche')) AS arten (anlagenart)
),
joined AS (
    -- 2. Join the 1-to-1 data. FULL JOIN: every PLZ brings its area and population to both Anlagenarten, also without
    --    units, and units with a PLZ unknown to the shapes still count for PLZ2 and PLZ3.
    SELECT
        COALESCE(a.plz5, s.plz5) AS plz5,
        COALESCE(a.anlagenart, s.anlagenart) AS anlagenart,
        s.total_units,
        s.total_power,
        s.total_power_net,
        a.qkm,
        a.einwohner
    FROM plz_areas a
    FULL JOIN plz5_solar_agg s ON s.plz5 = a.plz5 AND s.anlagenart = a.anlagenart
)
-- 3. Run the ROLLUP per Anlagenart: PLZ2 > PLZ3 > PLZ5
SELECT
    anlagenart,
    LEFT(plz5, 2) AS plz2,
    LEFT(plz5, 3) AS plz3,
    plz5,
    COALESCE(SUM(total_units), 0) AS total_units,
    CAST(COALESCE(SUM(total_power), 0) / 1000 AS NUMERIC(12,2)) AS total_power,
    CAST(COALESCE(SUM(total_power_net), 0) / 1000 AS NUMERIC(12,2)) AS total_power_net,
    CAST(COALESCE(SUM(total_power), 0) / NULLIF(SUM(qkm), 0) AS NUMERIC(10,1)) AS relative_area_power,
    CAST(COALESCE(SUM(total_power_net), 0) / NULLIF(SUM(qkm), 0) AS NUMERIC(10,1)) AS relative_area_power_net,
    CAST(COALESCE(SUM(total_power), 0) / NULLIF(SUM(einwohner), 0) AS NUMERIC(10,2)) AS relative_population_power,
    CAST(COALESCE(SUM(total_power_net), 0) / NULLIF(SUM(einwohner), 0) AS NUMERIC(10,2)) AS relative_population_power_net
FROM joined
GROUP BY anlagenart, ROLLUP (
    LEFT(plz5, 2),
    LEFT(plz5, 3),
    plz5
);
