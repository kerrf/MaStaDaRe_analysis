CREATE SCHEMA IF NOT EXISTS mrt;

DROP MATERIALIZED VIEW IF EXISTS mrt.battery_zubau_regions;

-- Battery storage Zubau and Bestand per year since 2013 for Deutschland ('DE'), every Bundesland (2-digit key),
-- Landkreis (5) and Gemeinde (8), in the size classes of battery-charts.de (RWTH Aachen) like mrt.zubau_zeitverlauf:
-- 'heimspeicher' below 30 kWh and 30 kW, 'grossspeicher' from 1,000 kWh or 1,000 kW, 'gewerbespeicher' in between, by
-- the storage plant. Each unit with its power (MW) and its share of the plant's usable capacity (MWh, split between the
-- units by their power). With the plausibility check of battery-charts.de: more than 0.3 kWh and 0.3 kW, full in
-- 6 minutes to 12 hours; units without a plausible capacity are left out. Units that went into operation before 2013
-- count into the Bestand. Every region has every year and class, also empty ones.
CREATE MATERIALIZED VIEW mrt.battery_zubau_regions AS
WITH battery_plants AS (
    -- The capacity (kWh) is registered per storage plant (AnlagenStromSpeicher), the power (kW) per unit
    SELECT
        u."SpeMastrNummer",
        max(p."NutzbareSpeicherkapazitaet") AS capacity,
        sum(u."Bruttoleistung") AS power
    FROM raw.storage_units u
    JOIN raw.storage_plants p ON p."MaStRNummer" = u."SpeMastrNummer"
    WHERE u."Technologie" = '524'  -- Batterie
    GROUP BY u."SpeMastrNummer"
),
units AS (
    -- Every battery unit in Germany that went into operation: its class, the year it came (before 2013 as 2012), the
    -- year it was finally decommissioned (38), its power and capacity (kW, kWh)
    SELECT
        CASE
            WHEN b.capacity < 30 AND b.power < 30 THEN 'heimspeicher'
            WHEN b.capacity >= 1000 OR b.power >= 1000 THEN 'grossspeicher'
            ELSE 'gewerbespeicher'
        END AS size_class,
        u."Gemeindeschluessel" AS ags,
        GREATEST(CAST(EXTRACT(YEAR FROM u."Inbetriebnahmedatum") AS INTEGER), 2012) AS added_in,
        CASE WHEN u."EinheitBetriebsstatus" = '38' THEN GREATEST(
            CAST(EXTRACT(YEAR FROM GREATEST(u."DatumEndgueltigeStilllegung"::date, u."Inbetriebnahmedatum")) AS INTEGER), 2012
        ) END AS removed_in,
        u."Bruttoleistung" AS power,
        b.capacity * u."Bruttoleistung" / b.power AS capacity
    FROM raw.storage_units u
    JOIN battery_plants b USING ("SpeMastrNummer")
    WHERE u."Technologie" = '524'
      AND u."Inbetriebnahmedatum" IS NOT NULL
      AND u."Land" = '84'
      AND u."Gemeindeschluessel" IS NOT NULL
      AND b.capacity > 0.3
      AND b.power > 0.3
      AND b.capacity / b.power BETWEEN 0.1 AND 12
),
changes AS (
    -- Per unit two changes: + in the year it came, - in the year it left
    SELECT u.size_class, u.ags, c.year, c.units, c.power, c.capacity, c.net_units, c.net_power, c.net_capacity
    FROM units u
    CROSS JOIN LATERAL (VALUES
        (u.added_in, 1, u.power, u.capacity, 1, u.power, u.capacity),
        (u.removed_in, 0, 0, 0, -1, -u.power, -u.capacity)
    ) AS c(year, units, power, capacity, net_units, net_power, net_capacity)
    WHERE c.year IS NOT NULL
),
per_region AS (
    -- Per year and class for Deutschland, every Land, Kreis and Gemeinde in one pass
    SELECT
        size_class,
        year,
        CASE
            WHEN GROUPING(ags) = 0 THEN ags
            WHEN GROUPING(LEFT(ags, 5)) = 0 THEN LEFT(ags, 5)
            WHEN GROUPING(LEFT(ags, 2)) = 0 THEN LEFT(ags, 2)
            ELSE 'DE'
        END AS region,
        sum(units) AS added_units,
        sum(power) AS added_power,
        sum(capacity) AS added_capacity,
        sum(net_units) AS net_units,
        sum(net_power) AS net_power,
        sum(net_capacity) AS net_capacity
    FROM changes
    GROUP BY GROUPING SETS (
        (size_class, year),
        (size_class, year, LEFT(ags, 2)),
        (size_class, year, LEFT(ags, 5)),
        (size_class, year, ags)
    )
),
regions AS (
    -- Deutschland and the Länder, Kreise and Gemeinden of the boundaries
    SELECT 'deutschland' AS level, 'DE' AS region
    UNION SELECT 'bundesland', LEFT(ags, 2) FROM geo.gemeinden
    UNION SELECT 'landkreis', LEFT(ags, 5) FROM geo.gemeinden
    UNION SELECT 'gemeinde', ags FROM geo.gemeinden
),
grid AS (
    -- Every region, class and year from 2012 (the units before 2013) to the latest commissioning; the Bestand is the
    -- running total of the net changes
    SELECT
        r.level,
        r.region,
        k.size_class,
        y.year,
        COALESCE(p.added_units, 0) AS added_units,
        COALESCE(p.added_power, 0) AS added_power,
        COALESCE(p.added_capacity, 0) AS added_capacity,
        sum(COALESCE(p.net_units, 0)) OVER w AS installed_units,
        sum(COALESCE(p.net_power, 0)) OVER w AS installed_power,
        sum(COALESCE(p.net_capacity, 0)) OVER w AS installed_capacity
    FROM regions r
    CROSS JOIN (VALUES ('heimspeicher'), ('gewerbespeicher'), ('grossspeicher')) AS k (size_class)
    CROSS JOIN generate_series(2012, (SELECT max(added_in) FROM units)) AS y (year)
    LEFT JOIN per_region p ON p.region = r.region AND p.size_class = k.size_class AND p.year = y.year
    WINDOW w AS (PARTITION BY r.region, k.size_class ORDER BY y.year)
)
SELECT
    level,
    -- The keys are digits: byte order ("C") is their order, and much faster to sort than a language's
    region COLLATE "C" AS region,
    year,
    size_class,
    CAST(added_units AS INTEGER) AS added_units,
    CAST(added_power / 1000 AS NUMERIC(12,3)) AS added_power,  -- MW
    CAST(added_capacity / 1000 AS NUMERIC(12,3)) AS added_capacity,  -- MWh
    CAST(installed_units AS INTEGER) AS installed_units,
    CAST(installed_power / 1000 AS NUMERIC(12,3)) AS installed_power,
    CAST(installed_capacity / 1000 AS NUMERIC(12,3)) AS installed_capacity
FROM grid
WHERE year >= 2013
ORDER BY level, region, year, size_class;

-- One region per request: read in the order of the table, no sorting
CREATE UNIQUE INDEX ON mrt.battery_zubau_regions (level, region, year, size_class);
