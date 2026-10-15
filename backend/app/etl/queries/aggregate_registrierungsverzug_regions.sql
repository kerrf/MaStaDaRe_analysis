CREATE SCHEMA IF NOT EXISTS mrt;

DROP MATERIALIZED VIEW IF EXISTS mrt.registrierungsverzug_regions;

-- The Abstand zwischen Inbetriebnahme und Registrierung of mrt.registrierungsverzug (aggregate_registrierungsverzug.sql:
-- the same technologies, classes and rules) for Deutschland ('DE'), every Bundesland (2-digit key) and Landkreis (5
-- digits), per technology and year of commissioning. A unit counts in the Land and Kreis of its Gemeindeschlüssel; one
-- without (offshore, abroad) for Deutschland only.
CREATE MATERIALIZED VIEW mrt.registrierungsverzug_regions AS
WITH units AS (
    SELECT 'solar' AS technology, "Gemeindeschluessel" AS ags, "Inbetriebnahmedatum" AS commissioned,
        "Registrierungsdatum" AS registered
    FROM raw.solar_units
    UNION ALL
    SELECT 'wind', "Gemeindeschluessel", "Inbetriebnahmedatum", "Registrierungsdatum" FROM raw.wind_units
    UNION ALL
    SELECT 'wasserkraft', "Gemeindeschluessel", "Inbetriebnahmedatum", "Registrierungsdatum" FROM raw.water_units
    UNION ALL
    SELECT 'batterie', "Gemeindeschluessel", "Inbetriebnahmedatum", "Registrierungsdatum"
    FROM raw.storage_units WHERE "Technologie" = '524'
    UNION ALL
    SELECT 'pumpspeicher', "Gemeindeschluessel", "Inbetriebnahmedatum", "Registrierungsdatum"
    FROM raw.storage_units WHERE "Technologie" = '1537'
    UNION ALL
    SELECT 'gaserzeuger', "Gemeindeschluessel", "Inbetriebnahmedatum", "Registrierungsdatum"
    FROM raw.gas_producer_units WHERE "SpeicherMaStRNummer" IS NULL
    UNION ALL
    SELECT 'gasspeicher', "Gemeindeschluessel", "Inbetriebnahmedatum", "Registrierungsdatum" FROM raw.gas_storage_units
),
delays AS (
    SELECT
        technology,
        ags,
        CAST(EXTRACT(YEAR FROM commissioned) AS INTEGER) AS year,
        registered - commissioned AS days,
        CASE
            WHEN registered < commissioned THEN 'vorab'
            WHEN registered <= commissioned + INTERVAL '1 month' THEN 'bis_1_monat'
            WHEN registered <= commissioned + INTERVAL '3 months' THEN 'bis_3_monate'
            WHEN registered <= commissioned + INTERVAL '12 months' THEN 'bis_12_monate'
            ELSE 'spaeter'
        END AS delay
    FROM units
    WHERE commissioned >= DATE '2019-01-31' AND commissioned <= current_date AND registered IS NOT NULL
),
counts AS (
    -- Deutschland, the Länder and the Kreise in one pass
    SELECT
        CASE
            WHEN GROUPING(LEFT(ags, 5)) = 0 THEN LEFT(ags, 5)
            WHEN GROUPING(LEFT(ags, 2)) = 0 THEN LEFT(ags, 2)
            ELSE 'DE'
        END AS region,
        technology,
        year,
        count(*) AS units,
        count(*) FILTER (WHERE delay = 'vorab') AS vorab,  -- registered before going into operation
        count(*) FILTER (WHERE delay = 'bis_1_monat') AS bis_1_monat,  -- within the deadline
        count(*) FILTER (WHERE delay = 'bis_3_monate') AS bis_3_monate,
        count(*) FILTER (WHERE delay = 'bis_12_monate') AS bis_12_monate,
        count(*) FILTER (WHERE delay = 'spaeter') AS spaeter,  -- more than a year late
        CAST(percentile_cont(0.5) WITHIN GROUP (ORDER BY days) AS INTEGER) AS median_days
    FROM delays
    GROUP BY GROUPING SETS (
        (technology, year),
        (technology, year, LEFT(ags, 2)),
        (technology, year, LEFT(ags, 5))
    )
)
SELECT region COLLATE "C" AS region, technology, year, units, vorab, bis_1_monat, bis_3_monate, bis_12_monate, spaeter,
    median_days
FROM counts
WHERE region IS NOT NULL
ORDER BY region, technology, year;

CREATE UNIQUE INDEX ON mrt.registrierungsverzug_regions (region, technology, year);
