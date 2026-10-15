CREATE SCHEMA IF NOT EXISTS mrt;

DROP MATERIALIZED VIEW IF EXISTS mrt.geplant_zeitverlauf_regions;

-- Geplante (genehmigte) Anlagen: units in planning (EinheitBetriebsstatus 31, "In Planung") by the date they are to go
-- into operation (GeplantesInbetriebnahmedatum, as the operators give it), in the series of the Ausbau
-- (mrt.zubau_zeitverlauf_regions: solar per Anlagenart as Brutto and '…_netto', wind an Land and auf See, hydropower),
-- for Deutschland ('DE'), every Bundesland (2-digit key) and Landkreis (5 digits): per month and, with month NULL, per
-- year the power planned to come in the period (added) and all planned up to its end (installed). Units in Germany;
-- offshore wind (no Gemeindeschlüssel) counts for Deutschland only. Only dates from the current month on (that of the
-- build or the nightly refresh): a date that has passed means planned, but never reported in operation – mostly small
-- solar units. Dates after 2040 (a handful, typing errors like 2056) are left out too.
CREATE MATERIALIZED VIEW mrt.geplant_zeitverlauf_regions AS
WITH units AS (
    -- The planned date is text in the export: only a valid date counts
    SELECT
        s.technology,
        u."Gemeindeschluessel" AS ags,
        CASE WHEN u."GeplantesInbetriebnahmedatum" ~ '^\d{4}-\d{2}-\d{2}$'
            THEN CAST(u."GeplantesInbetriebnahmedatum" AS date) END AS planned_on,
        s.amount  -- kW
    FROM raw.solar_units u
    CROSS JOIN LATERAL (
        SELECT CASE WHEN u."ArtDerSolaranlage" = '852' THEN 'solar_freiflaeche' ELSE 'solar_gebaeude' END AS art
    ) a
    CROSS JOIN LATERAL (VALUES
        (a.art, u."Bruttoleistung"),
        (a.art || '_netto', u."Nettonennleistung")
    ) AS s(technology, amount)
    WHERE u."EinheitBetriebsstatus" = '31' AND u."Land" = '84'

    UNION ALL
    SELECT
        CASE "WindAnLandOderAufSee" WHEN '889' THEN 'wind_auf_see' ELSE 'wind_an_land' END,
        "Gemeindeschluessel",
        CASE WHEN "GeplantesInbetriebnahmedatum" ~ '^\d{4}-\d{2}-\d{2}$' THEN CAST("GeplantesInbetriebnahmedatum" AS date) END,
        "Bruttoleistung"
    FROM raw.wind_units
    WHERE "EinheitBetriebsstatus" = '31' AND "Land" = '84'

    UNION ALL
    SELECT
        'wasserkraft',
        "Gemeindeschluessel",
        CASE WHEN "GeplantesInbetriebnahmedatum" ~ '^\d{4}-\d{2}-\d{2}$' THEN CAST("GeplantesInbetriebnahmedatum" AS date) END,
        "Bruttoleistung"
    FROM raw.water_units
    WHERE "EinheitBetriebsstatus" = '31' AND "Land" = '84'
),
monthly AS (
    -- Per series, region and planned month: the units and their power. Deutschland, the Länder and the Kreise in one pass.
    SELECT
        technology,
        CASE
            WHEN GROUPING(LEFT(ags, 5)) = 0 THEN LEFT(ags, 5)
            WHEN GROUPING(LEFT(ags, 2)) = 0 THEN LEFT(ags, 2)
            ELSE 'DE'
        END AS region,
        CAST(date_trunc('month', planned_on) AS date) AS month_start,
        count(*) AS added_units,
        sum(amount) AS added
    FROM units
    WHERE planned_on >= date_trunc('month', current_date) AND planned_on < DATE '2041-01-01'
    GROUP BY GROUPING SETS (
        (technology, date_trunc('month', planned_on)),
        (technology, date_trunc('month', planned_on), LEFT(ags, 2)),
        (technology, date_trunc('month', planned_on), LEFT(ags, 5))
    )
),
periods AS (
    -- Every series in every region where it has planned units: from its first planned month to the last one anywhere
    SELECT technology, region, min(month_start) AS first_month
    FROM monthly
    WHERE region IS NOT NULL
    GROUP BY technology, region
),
latest AS (
    SELECT max(month_start) AS last_month FROM monthly WHERE region = 'DE'
),
series AS (
    -- Every month, also without any; "installed" is all planned up to the month's end, the running total
    SELECT
        p.technology,
        p.region,
        m.month_start,
        CAST(EXTRACT(YEAR FROM m.month_start) AS INTEGER) AS year,
        CAST(EXTRACT(MONTH FROM m.month_start) AS INTEGER) AS month,
        COALESCE(c.added_units, 0) AS added_units,
        COALESCE(c.added, 0) AS added,
        sum(COALESCE(c.added, 0)) OVER (PARTITION BY p.technology, p.region ORDER BY m.month_start) AS installed
    FROM periods p
    CROSS JOIN latest l
    CROSS JOIN LATERAL (
        SELECT CAST(g AS date) AS month_start
        FROM generate_series(CAST(p.first_month AS timestamp), CAST(l.last_month AS timestamp), interval '1 month') g
    ) m
    LEFT JOIN monthly c ON c.technology = p.technology AND c.region = p.region AND c.month_start = m.month_start
)
-- Months, and with ROLLUP their years (month NULL). A period's "installed" is the one at the end of its last month.
SELECT
    region COLLATE "C" AS region,
    technology,
    year,
    month,
    'MW' AS unit,
    CAST(SUM(added_units) AS INTEGER) AS added_units,
    CAST(SUM(added) / 1000 AS NUMERIC(12,3)) AS added,
    CAST((array_agg(installed ORDER BY month_start DESC))[1] / 1000 AS NUMERIC(12,3)) AS installed
FROM series
GROUP BY region, technology, year, ROLLUP (month)
ORDER BY region, technology, year, month NULLS FIRST;

-- One region's series per request: read in the order of the table
CREATE INDEX ON mrt.geplant_zeitverlauf_regions (region, technology, year, month);
