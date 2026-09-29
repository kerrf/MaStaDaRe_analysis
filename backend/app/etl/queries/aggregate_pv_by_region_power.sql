CREATE SCHEMA IF NOT EXISTS mrt;

DROP MATERIALIZED VIEW IF EXISTS mrt.solar_region_stats;

CREATE MATERIALIZED VIEW mrt.solar_region_stats AS
WITH gemeinde_solar_agg AS (
    -- 1. Pre-aggregate to 1 row per Gemeinde to prevent JOIN explosions
    SELECT
        "Gemeindeschluessel" AS ags,
        COUNT("EinheitMastrNummer") AS total_units,
        SUM("Bruttoleistung") AS total_power
    FROM raw.solar_units
    WHERE "EinheitBetriebsstatus" = '35'  -- InBetrieb: installed, without planned or decommissioned units
      AND "Gemeindeschluessel" IS NOT NULL
    GROUP BY "Gemeindeschluessel"
),
joined AS (
    -- 2. Join the 1-to-1 data. FULL JOIN: every Gemeinde brings its area and population, also without units,
    --    and units whose Gemeinde was merged after the geodata (unknown key) still count for Landkreis and Bundesland.
    SELECT
        COALESCE(g.ags, s.ags) AS ags,
        s.total_units,
        s.total_power,
        g.qkm,
        g.einwohner
    FROM geo.gemeinden g
    FULL JOIN gemeinde_solar_agg s ON s.ags = g.ags
)
-- 3. Run the ROLLUP: Bundesland (first 2 digits of the key) > Landkreis (5) > Gemeinde (8)
SELECT
    LEFT(ags, 2) AS bundesland,
    LEFT(ags, 5) AS landkreis,
    ags AS gemeinde,
    COALESCE(SUM(total_units), 0) AS total_units,
    CAST(COALESCE(SUM(total_power), 0) / 1000 AS NUMERIC(12,2)) AS total_power,
    CAST(COALESCE(SUM(total_power), 0) / NULLIF(SUM(qkm), 0) AS NUMERIC(10,1)) AS relative_area_power,
    CAST(COALESCE(SUM(total_power), 0) / NULLIF(SUM(einwohner), 0) AS NUMERIC(10,2)) AS relative_population_power
FROM joined
GROUP BY ROLLUP (
    LEFT(ags, 2),
    LEFT(ags, 5),
    ags
);
