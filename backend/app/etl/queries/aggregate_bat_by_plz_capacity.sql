CREATE SCHEMA IF NOT EXISTS mrt;

DROP MATERIALIZED VIEW IF EXISTS mrt.bat_stats;

CREATE MATERIALIZED VIEW mrt.bat_rollup AS
WITH plz5_bat_agg AS (
    -- 1. Pre-aggregate to 1 row per PLZ5 to prevent JOIN explosions
    SELECT 
        "Postleitzahl" AS plz5,
        COUNT("EinheitMastrNummer") AS total_units,
        SUM("") AS total_capacity
    FROM raw.bat_units
    GROUP BY "Postleitzahl"
)
-- 2. Join the 1-to-1 data and run the ROLLUP
SELECT 
    LEFT(s.plz5, 2) AS plz2,
    LEFT(s.plz5, 3) AS plz3,
    s.plz5,
    SUM(s.total_units) AS total_units,
    CAST(SUM(s.total_capacity) / 1000 AS NUMERIC(10,0)) AS total_capacity,
    CAST(SUM(s.total_capacity) / NULLIF(SUM(area."qkm"), 0) AS NUMERIC(10,0)) AS relative_area_capacity,
    CAST(SUM(s.total_capacity) / NULLIF(SUM(pop."einwohner"), 0) AS NUMERIC(10,2)) AS relative_population_capacity
FROM plz5_bat_agg s
-- Use your base population table here, not the rollup one, to avoid joining onto subtotals
LEFT JOIN geo.plz_shapes_5 area ON s.plz5 = area.plz 
LEFT JOIN mrt.plz_einwohner pop ON s.plz5 = pop.plz 
GROUP BY ROLLUP (
    LEFT(s.plz5, 2),
    LEFT(s.plz5, 3),
    s.plz5
);