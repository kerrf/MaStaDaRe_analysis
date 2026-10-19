CREATE SCHEMA IF NOT EXISTS mrt;

DROP MATERIALIZED VIEW IF EXISTS mrt.zubau_zeitverlauf_regions;

-- The Ausbau im Zeitverlauf of mrt.zubau_zeitverlauf (aggregate_zubau.sql: the same series, units and rules) for
-- Deutschland ('DE'), every Bundesland (2-digit key) and Landkreis (5 digits): Zubau and Bestand per month and, with
-- month NULL, per year since 2000, the Bestand as amount and as units. A unit counts in the Land and Kreis of its
-- Gemeindeschlüssel; one without (offshore wind) for Deutschland only. A series that never had a unit in a region has
-- no rows there.
CREATE MATERIALIZED VIEW mrt.zubau_zeitverlauf_regions AS
WITH battery_plants AS (
    -- The capacity (kWh) is registered per storage plant (AnlagenStromSpeicher), the power (kW) per unit.
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
    -- 1. Every unit that went into operation: its series, its Gemeindeschlüssel, the day it came, the day it was
    --    finally decommissioned (38) and its amount. Solar four times: all solar and its Anlagenart, each as
    --    Bruttoleistung and Nettonennleistung ('…_netto').
    SELECT
        s.technology,
        u."Gemeindeschluessel" AS ags,
        u."Inbetriebnahmedatum" AS added_on,
        CASE WHEN u."EinheitBetriebsstatus" = '38'
            THEN GREATEST(u."DatumEndgueltigeStilllegung"::date, u."Inbetriebnahmedatum") END AS removed_on,
        s.amount  -- kW
    FROM raw.solar_units u
    CROSS JOIN LATERAL (
        SELECT CASE WHEN u."ArtDerSolaranlage" = '852' THEN 'solar_freiflaeche' ELSE 'solar_gebaeude' END AS art
    ) a
    CROSS JOIN LATERAL (VALUES
        ('solar', u."Bruttoleistung"),
        ('solar_netto', u."Nettonennleistung"),
        (a.art, u."Bruttoleistung"),
        (a.art || '_netto', u."Nettonennleistung")
    ) AS s(technology, amount)
    WHERE u."Inbetriebnahmedatum" IS NOT NULL

    UNION ALL
    -- The Balkonkraftwerke (steckerfertige Solaranlagen, 2961) on their own, Nettonennleistung: in solar_gebaeude too,
    -- like everywhere on the site; the page Überblick takes them out of it
    SELECT
        'solar_balkon_netto',
        "Gemeindeschluessel",
        "Inbetriebnahmedatum",
        CASE WHEN "EinheitBetriebsstatus" = '38'
            THEN GREATEST("DatumEndgueltigeStilllegung"::date, "Inbetriebnahmedatum") END,
        "Nettonennleistung"
    FROM raw.solar_units
    WHERE "Inbetriebnahmedatum" IS NOT NULL AND "ArtDerSolaranlage" = '2961'

    UNION ALL
    SELECT
        CASE "WindAnLandOderAufSee" WHEN '889' THEN 'wind_auf_see' ELSE 'wind_an_land' END,
        "Gemeindeschluessel",
        "Inbetriebnahmedatum",
        CASE WHEN "EinheitBetriebsstatus" = '38'
            THEN GREATEST("DatumEndgueltigeStilllegung"::date, "Inbetriebnahmedatum") END,
        "Bruttoleistung"
    FROM raw.wind_units
    WHERE "Inbetriebnahmedatum" IS NOT NULL

    UNION ALL
    -- Hydropower in Germany: without the border plants in Austria and Switzerland, like the map
    SELECT
        'wasserkraft',
        "Gemeindeschluessel",
        "Inbetriebnahmedatum",
        CASE WHEN "EinheitBetriebsstatus" = '38'
            THEN GREATEST("DatumEndgueltigeStilllegung"::date, "Inbetriebnahmedatum") END,
        "Bruttoleistung"
    FROM raw.water_units
    WHERE "Inbetriebnahmedatum" IS NOT NULL AND "Land" = '84'

    UNION ALL
    -- Batteries by the size classes of battery-charts.de, each unit twice: its share of the plant's capacity and its
    -- power; only with a plausible capacity (more than 0.3 kWh and 0.3 kW, full in 6 minutes to 12 hours)
    SELECT
        s.technology,
        u."Gemeindeschluessel",
        u."Inbetriebnahmedatum",
        CASE WHEN u."EinheitBetriebsstatus" = '38'
            THEN GREATEST(u."DatumEndgueltigeStilllegung"::date, u."Inbetriebnahmedatum") END,
        s.amount
    FROM raw.storage_units u
    JOIN battery_plants b USING ("SpeMastrNummer")
    CROSS JOIN LATERAL (
        SELECT CASE
            WHEN b.capacity < 30 AND b.power < 30 THEN 'heimspeicher'
            WHEN b.capacity >= 1000 OR b.power >= 1000 THEN 'grossspeicher'
            ELSE 'gewerbespeicher'
        END AS size_class
    ) c
    CROSS JOIN LATERAL (VALUES
        (c.size_class, b.capacity * u."Bruttoleistung" / b.power),  -- kWh
        (c.size_class || '_leistung', u."Bruttoleistung")  -- kW
    ) AS s(technology, amount)
    WHERE u."Technologie" = '524'
      AND u."Inbetriebnahmedatum" IS NOT NULL
      AND b.capacity > 0.3
      AND b.power > 0.3
      AND b.capacity / b.power BETWEEN 0.1 AND 12
),
monthly AS (
    -- 2. Per series, region and month: the units that came (count and amount) and the net change, minus what left (in
    --    amount and units). Deutschland, the Länder and the Kreise in one pass.
    SELECT
        u.technology,
        CASE
            WHEN GROUPING(LEFT(u.ags, 5)) = 0 THEN LEFT(u.ags, 5)
            WHEN GROUPING(LEFT(u.ags, 2)) = 0 THEN LEFT(u.ags, 2)
            ELSE 'DE'
        END AS region,
        date_trunc('month', c.day)::date AS month_start,
        sum(c.units) AS added_units,
        sum(c.added) AS added,
        sum(c.net) AS net,
        sum(c.net_units) AS net_units
    FROM units u
    CROSS JOIN LATERAL (VALUES
        (u.added_on, 1, u.amount, u.amount, 1),
        (u.removed_on, 0, 0, -u.amount, -1)
    ) AS c(day, units, added, net, net_units)
    WHERE c.day IS NOT NULL
    GROUP BY GROUPING SETS (
        (u.technology, date_trunc('month', c.day)),
        (u.technology, date_trunc('month', c.day), LEFT(u.ags, 2)),
        (u.technology, date_trunc('month', c.day), LEFT(u.ags, 5))
    )
),
periods AS (
    -- Every series in every region where it has units: from its first month to the latest commissioning anywhere
    SELECT technology, region, min(month_start) AS first_month
    FROM monthly
    WHERE region IS NOT NULL
    GROUP BY technology, region
),
latest AS (
    SELECT max(month_start) FILTER (WHERE added_units > 0) AS last_month FROM monthly WHERE region = 'DE'
),
series AS (
    -- 3. Every month, also without changes; the Bestand is the running total of the net changes, in amount and units
    SELECT
        p.technology,
        p.region,
        m.month_start,
        CAST(EXTRACT(YEAR FROM m.month_start) AS INTEGER) AS year,
        CAST(EXTRACT(MONTH FROM m.month_start) AS INTEGER) AS month,
        COALESCE(c.added_units, 0) AS added_units,
        COALESCE(c.added, 0) AS added,
        COALESCE(sum(c.net) OVER w, 0) AS installed,
        COALESCE(sum(c.net_units) OVER w, 0) AS installed_units
    FROM periods p
    CROSS JOIN latest l
    CROSS JOIN LATERAL (
        SELECT CAST(g AS date) AS month_start
        FROM generate_series(CAST(p.first_month AS timestamp), CAST(l.last_month AS timestamp), interval '1 month') g
    ) m
    LEFT JOIN monthly c ON c.technology = p.technology AND c.region = p.region AND c.month_start = m.month_start
    WINDOW w AS (PARTITION BY p.technology, p.region ORDER BY m.month_start)
)
-- 4. Months, and with ROLLUP their years (month NULL). A period's Bestand is the one at the end of its last month.
SELECT
    region COLLATE "C" AS region,
    technology,
    year,
    month,
    CASE WHEN technology LIKE '%speicher' THEN 'MWh' ELSE 'MW' END AS unit,  -- '..._leistung': MW
    CAST(SUM(added_units) AS INTEGER) AS added_units,
    CAST(SUM(added) / 1000 AS NUMERIC(12,3)) AS added,
    CAST((array_agg(installed ORDER BY month_start DESC))[1] / 1000 AS NUMERIC(12,3)) AS installed,
    CAST((array_agg(installed_units ORDER BY month_start DESC))[1] AS INTEGER) AS installed_units
FROM series
WHERE year >= 2000
GROUP BY region, technology, year, ROLLUP (month)
ORDER BY region, technology, year, month NULLS FIRST;

-- One region's series per request: read in the order of the table
CREATE INDEX ON mrt.zubau_zeitverlauf_regions (region, technology, year, month);
