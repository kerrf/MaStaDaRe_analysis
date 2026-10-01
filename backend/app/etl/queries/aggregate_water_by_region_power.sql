CREATE SCHEMA IF NOT EXISTS mrt;

DROP MATERIALIZED VIEW IF EXISTS mrt.water_region_stats;

CREATE MATERIALIZED VIEW mrt.water_region_stats AS
WITH gemeinde_water_agg AS (
    -- 1. Pre-aggregate to 1 row per Gemeinde to prevent JOIN explosions
    SELECT
        "Gemeindeschluessel" AS ags,
        COUNT("EinheitMastrNummer") AS total_units,
        SUM("Bruttoleistung") AS total_power,
        SUM("Bruttoleistung") FILTER (WHERE "Inbetriebnahmedatum" > CURRENT_DATE - INTERVAL '12 months') AS added_12m_power  -- in operation since less than 12 months
    FROM raw.water_units
    WHERE "EinheitBetriebsstatus" = '35'  -- InBetrieb: installed, without planned or decommissioned units
      AND "Gemeindeschluessel" IS NOT NULL
    GROUP BY "Gemeindeschluessel"
),
joined AS (
    -- 2. Join the 1-to-1 data. FULL JOIN: every Gemeinde brings its area and population, also without units,
    --    and units whose Gemeinde was merged after the geodata (unknown key) still count for Landkreis and Bundesland.
    SELECT
        COALESCE(g.ags, w.ags) AS ags,
        w.total_units,
        w.total_power,
        w.added_12m_power,
        g.qkm,
        g.einwohner
    FROM geo.gemeinden g
    FULL JOIN gemeinde_water_agg w ON w.ags = g.ags
)
-- 3. Run the ROLLUP: Bundesland (first 2 digits of the key) > Landkreis (5) > Gemeinde (8)
SELECT
    LEFT(ags, 2) AS bundesland,
    LEFT(ags, 5) AS landkreis,
    ags AS gemeinde,
    COALESCE(SUM(total_units), 0) AS total_units,
    CAST(COALESCE(SUM(total_power), 0) / 1000 AS NUMERIC(12,2)) AS total_power,
    CAST(COALESCE(SUM(total_power), 0) / NULLIF(SUM(qkm), 0) AS NUMERIC(10,1)) AS relative_area_power,
    CAST(COALESCE(SUM(total_power), 0) / NULLIF(SUM(einwohner), 0) AS NUMERIC(10,2)) AS relative_population_power,
    CAST(COALESCE(SUM(added_12m_power), 0) / 1000 AS NUMERIC(12,2)) AS added_12m_power  -- Zubau of the last 12 months, MW
FROM joined
GROUP BY ROLLUP (
    LEFT(ags, 2),
    LEFT(ags, 5),
    ags
);
