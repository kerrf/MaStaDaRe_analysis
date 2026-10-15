CREATE SCHEMA IF NOT EXISTS mrt;

DROP MATERIALIZED VIEW IF EXISTS mrt.registrierungen;

-- Registrations in the Marktstammdatenregister per month and, with month NULL, per year (Registrierungsdatum) and
-- technology, from the month of the first registration on (the register started in 2019) to the current one, also
-- periods without any: the units registered in the period, and all registered up to its end. Every unit the register
-- lists, whatever its status (in operation, planned, shut down) or country: each was registered once. Units deleted from
-- the register are not in the export. The technologies are the dashboards' ids.
CREATE MATERIALIZED VIEW mrt.registrierungen AS
WITH units AS (
    SELECT 'solar' AS technology, "Registrierungsdatum" AS registered FROM raw.solar_units
    UNION ALL
    -- Solar per Anlagenart too: Freifläche, else Gebäude (also steckerfertige, sonstige and those without an Art)
    SELECT CASE WHEN "ArtDerSolaranlage" = '852' THEN 'solar_freiflaeche' ELSE 'solar_gebaeude' END, "Registrierungsdatum"
    FROM raw.solar_units
    UNION ALL
    SELECT 'wind', "Registrierungsdatum" FROM raw.wind_units
    UNION ALL
    SELECT 'wasserkraft', "Registrierungsdatum" FROM raw.water_units
    UNION ALL
    SELECT 'batterie', "Registrierungsdatum" FROM raw.storage_units WHERE "Technologie" = '524'
    UNION ALL
    SELECT 'pumpspeicher', "Registrierungsdatum" FROM raw.storage_units WHERE "Technologie" = '1537'
    UNION ALL
    -- Without the gas storage units, which the export lists among the gas producers too
    SELECT 'gaserzeuger', "Registrierungsdatum" FROM raw.gas_producer_units WHERE "SpeicherMaStRNummer" IS NULL
    UNION ALL
    SELECT 'gasspeicher', "Registrierungsdatum" FROM raw.gas_storage_units
),
per_month AS (
    SELECT technology, CAST(date_trunc('month', registered) AS date) AS month_start, count(*) AS units
    FROM units
    WHERE registered IS NOT NULL
    GROUP BY 1, 2
),
series AS (
    -- Every month from the technology's first registration to the current one; the total is the running sum
    SELECT
        t.technology,
        m.month_start,
        CAST(EXTRACT(YEAR FROM m.month_start) AS INTEGER) AS year,
        CAST(EXTRACT(MONTH FROM m.month_start) AS INTEGER) AS month,
        COALESCE(p.units, 0) AS units,
        sum(COALESCE(p.units, 0)) OVER (PARTITION BY t.technology ORDER BY m.month_start) AS total
    FROM (SELECT technology, min(month_start) AS first_month FROM per_month GROUP BY technology) t
    CROSS JOIN LATERAL (
        SELECT CAST(g AS date) AS month_start
        FROM generate_series(CAST(t.first_month AS timestamp), date_trunc('month', LOCALTIMESTAMP), interval '1 month') g
    ) m
    LEFT JOIN per_month p ON p.technology = t.technology AND p.month_start = m.month_start
)
-- Months, and with ROLLUP their years (month NULL). A period's total is the one at the end of its last month.
SELECT
    technology,
    year,
    month,
    CAST(sum(units) AS INTEGER) AS units,
    CAST((array_agg(total ORDER BY month_start DESC))[1] AS INTEGER) AS total
FROM series
GROUP BY technology, year, ROLLUP (month);

CREATE UNIQUE INDEX ON mrt.registrierungen (technology, year, month);
