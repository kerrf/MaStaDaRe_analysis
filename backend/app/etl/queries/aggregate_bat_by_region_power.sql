CREATE SCHEMA IF NOT EXISTS mrt;

DROP MATERIALIZED VIEW IF EXISTS mrt.battery_region_stats;

-- Battery storage in operation per Bundesland, Landkreis and Gemeinde, one row per size class like the Zubau
-- (aggregate_zubau_zeitverlauf_regions.sql, battery-charts.de): 'heimspeicher' below 30 kWh and 30 kW, 'grossspeicher'
-- from 1,000 kWh or 1,000 kW, 'gewerbespeicher' in between, by the storage plant; those without a plausible capacity
-- (about 10,000 of 2.8 million) by their power alone. The API sums the chosen classes (?groesse=…). Every row of a region
-- carries its whole area and population, so the values per km² and per inhabitant add up too. The capacity only where it
-- is plausible (battery-charts.de: more than 0.3 kWh and 0.3 kW, full in 6 minutes to 12 hours), like the Zubau.
CREATE MATERIALIZED VIEW mrt.battery_region_stats AS
WITH arten (art) AS (VALUES ('heimspeicher'), ('gewerbespeicher'), ('grossspeicher')),
battery_plants AS (
    -- The usable capacity (kWh) is registered per storage plant (AnlagenStromSpeicher), the power (kW) per unit
    SELECT u."SpeMastrNummer", max(p."NutzbareSpeicherkapazitaet") AS capacity, sum(u."Bruttoleistung") AS power
    FROM raw.storage_units u
    JOIN raw.storage_plants p ON p."MaStRNummer" = u."SpeMastrNummer"
    WHERE u."Technologie" = 'Batterie'
    GROUP BY u."SpeMastrNummer"
),
classified AS (
    SELECT
        u."Gemeindeschluessel" AS ags,
        CASE
            WHEN b.capacity > 0.3 AND b.power > 0.3 AND b.capacity / b.power BETWEEN 0.1 AND 12 THEN
                CASE
                    WHEN b.capacity < 30 AND b.power < 30 THEN 'heimspeicher'
                    WHEN b.capacity >= 1000 OR b.power >= 1000 THEN 'grossspeicher'
                    ELSE 'gewerbespeicher'
                END
            -- Without a plausible capacity: by the power alone (the plant's, else the unit's)
            WHEN COALESCE(b.power, u."Bruttoleistung", 0) < 30 THEN 'heimspeicher'
            WHEN COALESCE(b.power, u."Bruttoleistung", 0) >= 1000 THEN 'grossspeicher'
            ELSE 'gewerbespeicher'
        END AS art,
        u."EinheitMastrNummer",
        u."Bruttoleistung" AS power,
        u."Inbetriebnahmedatum" > CURRENT_DATE - INTERVAL '12 months' AS recent,
        -- The plant's capacity, split between its units by their power, where it is plausible
        CASE WHEN b.capacity > 0.3 AND b.power > 0.3 AND b.capacity / b.power BETWEEN 0.1 AND 12
            THEN b.capacity * u."Bruttoleistung" / b.power END AS capacity
    FROM raw.storage_units u
    LEFT JOIN battery_plants b USING ("SpeMastrNummer")
    WHERE u."Technologie" = 'Batterie'  -- the only storage technology that counts as a battery (not Pumpspeicher, Druckluft, ...)
      AND u."EinheitBetriebsstatus" = 'In Betrieb'  -- installed, without planned or decommissioned units
      AND u."Gemeindeschluessel" IS NOT NULL
),
gemeinde_battery_agg AS (
    -- 1. Pre-aggregate to 1 row per Gemeinde and size class to prevent JOIN explosions
    SELECT
        ags,
        art,
        COUNT("EinheitMastrNummer") AS total_units,
        SUM(power) AS total_power,
        SUM(capacity) AS total_capacity,
        -- Zubau: in operation since less than 12 months
        SUM(power) FILTER (WHERE recent) AS added_12m_power,
        SUM(capacity) FILTER (WHERE recent) AS added_12m_capacity
    FROM classified
    GROUP BY ags, art
),
joined AS (
    -- 2. Every Gemeinde with every size class: its area and population also without units. FULL JOIN: units whose
    --    Gemeinde was merged after the geodata (unknown key) still count for Landkreis and Bundesland.
    SELECT
        COALESCE(g.ags, b.ags) AS ags,
        COALESCE(g.art, b.art) AS art,
        b.total_units,
        b.total_power,
        b.total_capacity,
        b.added_12m_power,
        b.added_12m_capacity,
        g.qkm,
        g.einwohner
    FROM (SELECT ags, qkm, einwohner, art FROM geo.gemeinden CROSS JOIN arten) g
    FULL JOIN gemeinde_battery_agg b ON b.ags = g.ags AND b.art = g.art
)
-- 3. Run the ROLLUP per size class: Bundesland (first 2 digits of the key) > Landkreis (5) > Gemeinde (8)
SELECT
    art,
    LEFT(ags, 2) AS bundesland,
    LEFT(ags, 5) AS landkreis,
    ags AS gemeinde,
    COALESCE(SUM(total_units), 0) AS total_units,
    CAST(COALESCE(SUM(total_power), 0) / 1000 AS NUMERIC(12,3)) AS total_power,
    CAST(COALESCE(SUM(total_power), 0) / NULLIF(SUM(qkm), 0) AS NUMERIC(10,3)) AS relative_area_power,
    CAST(COALESCE(SUM(total_power), 0) / NULLIF(SUM(einwohner), 0) AS NUMERIC(12,5)) AS relative_population_power,
    CAST(COALESCE(SUM(total_capacity), 0) / 1000 AS NUMERIC(12,3)) AS total_capacity,  -- MWh
    CAST(COALESCE(SUM(total_capacity), 0) / NULLIF(SUM(qkm), 0) AS NUMERIC(10,3)) AS relative_area_capacity,  -- kWh/km²
    CAST(COALESCE(SUM(total_capacity), 0) / NULLIF(SUM(einwohner), 0) AS NUMERIC(12,5)) AS relative_population_capacity,  -- kWh
    CAST(COALESCE(SUM(added_12m_power), 0) / 1000 AS NUMERIC(12,3)) AS added_12m_power,  -- Zubau of the last 12 months, MW
    CAST(COALESCE(SUM(added_12m_capacity), 0) / 1000 AS NUMERIC(12,3)) AS added_12m_capacity  -- MWh
FROM joined
GROUP BY art, ROLLUP (
    LEFT(ags, 2),
    LEFT(ags, 5),
    ags
);
