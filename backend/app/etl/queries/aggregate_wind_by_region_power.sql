CREATE SCHEMA IF NOT EXISTS mrt;

DROP MATERIALIZED VIEW IF EXISTS mrt.wind_region_stats;

CREATE MATERIALIZED VIEW mrt.wind_region_stats AS
WITH gemeinde_wind_agg AS (
    -- 1. Pre-aggregate to 1 row per Gemeinde to prevent JOIN explosions.
    --    Offshore units (WindAufSee) lie in no Gemeinde: together they are the row 'offshore', the sea.
    SELECT
        CASE WHEN "WindAnLandOderAufSee" = '889' THEN 'offshore' ELSE "Gemeindeschluessel" END AS ags,
        COUNT("EinheitMastrNummer") AS total_units,
        SUM("Bruttoleistung") AS total_power
    FROM raw.wind_units
    WHERE "EinheitBetriebsstatus" = '35'  -- InBetrieb: installed, without planned or decommissioned units
      AND ("WindAnLandOderAufSee" = '889' OR "Gemeindeschluessel" IS NOT NULL)
    GROUP BY 1
),
joined AS (
    -- 2. Join the 1-to-1 data. FULL JOIN: every Gemeinde brings its area and population, also without units,
    --    and units whose Gemeinde was merged after the geodata (unknown key) still count for Landkreis and Bundesland.
    --    The sea joins as one more Gemeinde, with its area and without inhabitants.
    SELECT
        COALESCE(g.ags, w.ags) AS ags,
        w.total_units,
        w.total_power,
        g.qkm,
        g.einwohner
    FROM (
        SELECT ags, qkm, einwohner FROM geo.gemeinden
        UNION ALL
        SELECT 'offshore', qkm, NULL FROM geo.offshore
    ) g
    FULL JOIN gemeinde_wind_agg w ON w.ags = g.ags
),
regions AS (
    -- The sea is a region of its own on every level: a Bundesland with one Landkreis and one Gemeinde
    SELECT
        CASE WHEN ags = 'offshore' THEN ags ELSE LEFT(ags, 2) END AS bundesland,
        CASE WHEN ags = 'offshore' THEN ags ELSE LEFT(ags, 5) END AS landkreis,
        ags AS gemeinde,
        total_units,
        total_power,
        qkm,
        einwohner
    FROM joined
)
-- 3. Run the ROLLUP: Bundesland (first 2 digits of the key) > Landkreis (5) > Gemeinde (8)
SELECT
    bundesland,
    landkreis,
    gemeinde,
    COALESCE(SUM(total_units), 0) AS total_units,
    CAST(COALESCE(SUM(total_power), 0) / 1000 AS NUMERIC(12,2)) AS total_power,
    CAST(COALESCE(SUM(total_power), 0) / NULLIF(SUM(qkm), 0) AS NUMERIC(10,1)) AS relative_area_power,
    CAST(COALESCE(SUM(total_power), 0) / NULLIF(SUM(einwohner), 0) AS NUMERIC(10,2)) AS relative_population_power
FROM regions
GROUP BY ROLLUP (
    bundesland,
    landkreis,
    gemeinde
);
