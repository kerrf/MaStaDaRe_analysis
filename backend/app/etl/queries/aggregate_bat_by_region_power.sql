CREATE SCHEMA IF NOT EXISTS mrt;

DROP MATERIALIZED VIEW IF EXISTS mrt.battery_region_stats;

CREATE MATERIALIZED VIEW mrt.battery_region_stats AS
WITH battery_plants AS (
    -- The usable capacity (kWh) is registered per storage plant (AnlagenStromSpeicher), the power (kW) per unit
    SELECT u."SpeMastrNummer", max(p."NutzbareSpeicherkapazitaet") AS capacity, sum(u."Bruttoleistung") AS power
    FROM raw.storage_units u
    JOIN raw.storage_plants p ON p."MaStRNummer" = u."SpeMastrNummer"
    WHERE u."Technologie" = '524'
    GROUP BY u."SpeMastrNummer"
),
gemeinde_battery_agg AS (
    -- 1. Pre-aggregate to 1 row per Gemeinde to prevent JOIN explosions
    SELECT
        u."Gemeindeschluessel" AS ags,
        COUNT(u."EinheitMastrNummer") AS total_units,
        SUM(u."Bruttoleistung") AS total_power,
        -- The usable capacity: the plant's, split between its units by their power, where it is plausible
        -- (battery-charts.de: full in 6 minutes to 12 hours), like in aggregate_zubau.sql
        SUM(b.capacity * u."Bruttoleistung" / b.power) FILTER (
            WHERE b.capacity > 0.3 AND b.power > 0.3 AND b.capacity / b.power BETWEEN 0.1 AND 12
        ) AS total_capacity,
        -- Zubau: in operation since less than 12 months. The capacity like in aggregate_zubau.sql: the plant's, split
        -- between its units by their power, if plausible (battery-charts.de: full in 6 minutes to 12 hours)
        SUM(u."Bruttoleistung") FILTER (WHERE u."Inbetriebnahmedatum" > CURRENT_DATE - INTERVAL '12 months') AS added_12m_power,
        SUM(b.capacity * u."Bruttoleistung" / b.power) FILTER (
            WHERE u."Inbetriebnahmedatum" > CURRENT_DATE - INTERVAL '12 months'
              AND b.capacity > 0.3 AND b.power > 0.3 AND b.capacity / b.power BETWEEN 0.1 AND 12
        ) AS added_12m_capacity
    FROM raw.storage_units u
    LEFT JOIN battery_plants b USING ("SpeMastrNummer")
    WHERE u."Technologie" = '524'  -- Batterie: the only storage technology that counts as a battery (not Pumpspeicher, Druckluft, ...)
      AND u."EinheitBetriebsstatus" = '35'  -- InBetrieb: installed, without planned or decommissioned units
      AND u."Gemeindeschluessel" IS NOT NULL
    GROUP BY u."Gemeindeschluessel"
),
joined AS (
    -- 2. Join the 1-to-1 data. FULL JOIN: every Gemeinde brings its area and population, also without units,
    --    and units whose Gemeinde was merged after the geodata (unknown key) still count for Landkreis and Bundesland.
    SELECT
        COALESCE(g.ags, b.ags) AS ags,
        b.total_units,
        b.total_power,
        b.total_capacity,
        b.added_12m_power,
        b.added_12m_capacity,
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
    CAST(COALESCE(SUM(total_power), 0) / NULLIF(SUM(einwohner), 0) AS NUMERIC(10,2)) AS relative_population_power,
    CAST(COALESCE(SUM(total_capacity), 0) / 1000 AS NUMERIC(12,2)) AS total_capacity,  -- MWh
    CAST(COALESCE(SUM(total_capacity), 0) / NULLIF(SUM(qkm), 0) AS NUMERIC(10,1)) AS relative_area_capacity,  -- kWh/km²
    CAST(COALESCE(SUM(total_capacity), 0) / NULLIF(SUM(einwohner), 0) AS NUMERIC(10,3)) AS relative_population_capacity,  -- kWh
    CAST(COALESCE(SUM(added_12m_power), 0) / 1000 AS NUMERIC(12,2)) AS added_12m_power,  -- Zubau of the last 12 months, MW
    CAST(COALESCE(SUM(added_12m_capacity), 0) / 1000 AS NUMERIC(12,2)) AS added_12m_capacity  -- MWh
FROM joined
GROUP BY ROLLUP (
    LEFT(ags, 2),
    LEFT(ags, 5),
    ags
);
