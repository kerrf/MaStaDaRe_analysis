CREATE SCHEMA IF NOT EXISTS mrt;

DROP MATERIALIZED VIEW IF EXISTS mrt.zubau_zeitverlauf;

-- Zubau (additions by commissioning date) and Bestand (installed at the end of the period) in Germany, per month and
-- per year since 2000: solar and wind in MW, battery storage in MWh of usable capacity, split into size classes.
CREATE MATERIALIZED VIEW mrt.zubau_zeitverlauf AS
WITH battery_plants AS (
    -- The capacity (kWh) is registered per storage plant (AnlagenStromSpeicher), the power (kW) per unit.
    -- Almost every battery plant has exactly one unit.
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
    -- 1. Every unit that went into operation (planned ones have no Inbetriebnahmedatum): its series, the day it came,
    --    the day it was finally decommissioned (38) and its amount. A decommissioned unit without a valid date leaves
    --    in the month it came.
    SELECT
        'solar' AS technology,
        "Inbetriebnahmedatum" AS added_on,
        CASE WHEN "EinheitBetriebsstatus" = '38'
            THEN GREATEST("DatumEndgueltigeStilllegung"::date, "Inbetriebnahmedatum") END AS removed_on,
        "Bruttoleistung" AS amount  -- kW
    FROM raw.solar_units
    WHERE "Inbetriebnahmedatum" IS NOT NULL

    UNION ALL
    SELECT
        CASE "WindAnLandOderAufSee" WHEN '889' THEN 'wind_auf_see' ELSE 'wind_an_land' END,
        "Inbetriebnahmedatum",
        CASE WHEN "EinheitBetriebsstatus" = '38'
            THEN GREATEST("DatumEndgueltigeStilllegung"::date, "Inbetriebnahmedatum") END,
        "Bruttoleistung"
    FROM raw.wind_units
    WHERE "Inbetriebnahmedatum" IS NOT NULL

    UNION ALL
    -- Size classes of battery-charts.de (RWTH Aachen) by the plant: Heimspeicher below 30 kWh and 30 kW,
    -- Großspeicher from 1,000 kWh or 1,000 kW, Gewerbespeicher in between. A plant's capacity is split between its
    -- units by their power.
    SELECT
        CASE
            WHEN b.capacity < 30 AND b.power < 30 THEN 'heimspeicher'
            WHEN b.capacity >= 1000 OR b.power >= 1000 THEN 'grossspeicher'
            ELSE 'gewerbespeicher'
        END,
        u."Inbetriebnahmedatum",
        CASE WHEN u."EinheitBetriebsstatus" = '38'
            THEN GREATEST(u."DatumEndgueltigeStilllegung"::date, u."Inbetriebnahmedatum") END,
        b.capacity * u."Bruttoleistung" / b.power  -- kWh
    FROM raw.storage_units u
    JOIN battery_plants b USING ("SpeMastrNummer")
    WHERE u."Technologie" = '524'
      AND u."Inbetriebnahmedatum" IS NOT NULL
      -- Plausibility check of battery-charts.de: more than 0.3 kWh and 0.3 kW, full in 6 minutes to 12 hours.
      -- Units whose plant is missing (the nightly update fetches it) have no capacity yet and are left out.
      AND b.capacity > 0.3
      AND b.power > 0.3
      AND b.capacity / b.power BETWEEN 0.1 AND 12
),
monthly AS (
    -- 2. Per series and month: the units that came (count and amount) and the net change, i.e. minus what left
    SELECT
        u.technology,
        date_trunc('month', c.day)::date AS month_start,
        sum(c.units) AS added_units,
        sum(c.added) AS added,
        sum(c.net) AS net
    FROM units u
    CROSS JOIN LATERAL (VALUES
        (u.added_on, 1, u.amount, u.amount),
        (u.removed_on, 0, 0, -u.amount)
    ) AS c(day, units, added, net)
    WHERE c.day IS NOT NULL
    GROUP BY u.technology, date_trunc('month', c.day)
),
series AS (
    -- 3. Every month from the first unit to the latest commissioning (the data stand), also months without changes.
    --    The Bestand is the running total of the net changes.
    SELECT
        t.technology,
        m.month_start,
        CAST(EXTRACT(YEAR FROM m.month_start) AS INTEGER) AS year,
        CAST(EXTRACT(MONTH FROM m.month_start) AS INTEGER) AS month,
        COALESCE(c.added_units, 0) AS added_units,
        COALESCE(c.added, 0) AS added,
        COALESCE(sum(c.net) OVER (PARTITION BY t.technology ORDER BY m.month_start), 0) AS installed
    FROM (SELECT DISTINCT technology FROM monthly) t
    CROSS JOIN (
        SELECT CAST(generate_series(
            CAST(min(month_start) AS timestamp),
            CAST(max(month_start) FILTER (WHERE added_units > 0) AS timestamp),
            interval '1 month'
        ) AS date) AS month_start
        FROM monthly
    ) m
    LEFT JOIN monthly c ON c.technology = t.technology AND c.month_start = m.month_start
)
-- 4. Months, and with ROLLUP their years (month NULL). A period's Bestand is the one at the end of its last month.
SELECT
    technology,
    year,
    month,
    CASE WHEN technology LIKE '%speicher' THEN 'MWh' ELSE 'MW' END AS unit,
    CAST(SUM(added_units) AS INTEGER) AS added_units,
    CAST(SUM(added) / 1000 AS NUMERIC(12,3)) AS added,
    CAST((array_agg(installed ORDER BY month_start DESC))[1] / 1000 AS NUMERIC(12,3)) AS installed
FROM series
WHERE year >= 2000
GROUP BY technology, year, ROLLUP (month);
