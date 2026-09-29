CREATE SCHEMA IF NOT EXISTS mrt;

DROP MATERIALIZED VIEW IF EXISTS mrt.battery_region_stats;

CREATE MATERIALIZED VIEW mrt.battery_region_stats AS
WITH gemeinde_battery_agg AS (
    -- 1. Pre-aggregate to 1 row per Gemeinde to prevent JOIN explosions
    SELECT
        "Gemeindeschluessel" AS ags,
        COUNT("EinheitMastrNummer") AS total_units,
        SUM("Bruttoleistung") AS total_power
    FROM raw.storage_units
    WHERE "Technologie" = '524'  -- Batterie: the only storage technology that counts as a battery (not Pumpspeicher, Druckluft, ...)
      AND "EinheitBetriebsstatus" = '35'  -- InBetrieb: installed, without planned or decommissioned units
      AND "Gemeindeschluessel" IS NOT NULL
    GROUP BY "Gemeindeschluessel"
),
joined AS (
    -- 2. Join the 1-to-1 data. FULL JOIN: every Gemeinde brings its area and population, also without units,
    --    and units whose Gemeinde was merged after the geodata (unknown key) still count for Landkreis and Bundesland.
    SELECT
        COALESCE(g.ags, b.ags) AS ags,
        b.total_units,
        b.total_power,
        g.qkm,
        g.einwohner
    FROM geo.gemeinden g
    FULL JOIN gemeinde_battery_agg b ON b.ags = g.ags
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
