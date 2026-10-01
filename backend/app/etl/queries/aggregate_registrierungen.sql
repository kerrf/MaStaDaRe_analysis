CREATE SCHEMA IF NOT EXISTS mrt;

DROP MATERIALIZED VIEW IF EXISTS mrt.registrierungen;

-- Registrations in the Marktstammdatenregister per year (Registrierungsdatum) and technology, from the year of the first
-- registration on (the register started in 2019), also years without any. Every unit the register lists, whatever its
-- status (in operation, planned, shut down) or country: each was registered once. Units deleted from the register are
-- not in the export. The technologies are the dashboards' ids.
CREATE MATERIALIZED VIEW mrt.registrierungen AS
WITH units AS (
    SELECT 'solar' AS technology, "Registrierungsdatum" AS registered FROM raw.solar_units
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
per_year AS (
    SELECT technology, CAST(EXTRACT(YEAR FROM registered) AS INTEGER) AS year, count(*) AS units
    FROM units
    WHERE registered IS NOT NULL
    GROUP BY 1, 2
)
SELECT t.technology, y.year, coalesce(p.units, 0) AS units
FROM (SELECT technology, min(year) AS first_year FROM per_year GROUP BY technology) t
CROSS JOIN LATERAL generate_series(t.first_year, CAST(EXTRACT(YEAR FROM current_date) AS INTEGER)) AS y(year)
LEFT JOIN per_year p ON p.technology = t.technology AND p.year = y.year;

CREATE UNIQUE INDEX ON mrt.registrierungen (technology, year);
