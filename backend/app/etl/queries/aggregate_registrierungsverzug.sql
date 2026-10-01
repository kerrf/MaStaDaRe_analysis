CREATE SCHEMA IF NOT EXISTS mrt;

DROP MATERIALIZED VIEW IF EXISTS mrt.registrierungsverzug;

-- How long after going into operation (Inbetriebnahmedatum) units were registered in the Marktstammdatenregister
-- (Registrierungsdatum), per technology and year of commissioning: the units per delay class and the median delay in
-- days. Since the register started (31.01.2019), a unit has to be registered within a month of going into operation
-- (§ 5 MaStRV); units that went into operation before had until 31.01.2021, so they are left out. Every status: a unit
-- shut down since was registered all the same. The technologies are the dashboards' ids, like mrt.registrierungen.
CREATE MATERIALIZED VIEW mrt.registrierungsverzug AS
WITH units AS (
    SELECT 'solar' AS technology, "Inbetriebnahmedatum" AS commissioned, "Registrierungsdatum" AS registered
    FROM raw.solar_units
    UNION ALL
    SELECT 'wind', "Inbetriebnahmedatum", "Registrierungsdatum" FROM raw.wind_units
    UNION ALL
    SELECT 'wasserkraft', "Inbetriebnahmedatum", "Registrierungsdatum" FROM raw.water_units
    UNION ALL
    SELECT 'batterie', "Inbetriebnahmedatum", "Registrierungsdatum" FROM raw.storage_units WHERE "Technologie" = '524'
    UNION ALL
    SELECT 'pumpspeicher', "Inbetriebnahmedatum", "Registrierungsdatum" FROM raw.storage_units WHERE "Technologie" = '1537'
    UNION ALL
    SELECT 'gaserzeuger', "Inbetriebnahmedatum", "Registrierungsdatum"
    FROM raw.gas_producer_units WHERE "SpeicherMaStRNummer" IS NULL
    UNION ALL
    SELECT 'gasspeicher', "Inbetriebnahmedatum", "Registrierungsdatum" FROM raw.gas_storage_units
),
delays AS (
    SELECT
        technology,
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
)
SELECT
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
GROUP BY technology, year;

CREATE UNIQUE INDEX ON mrt.registrierungsverzug (technology, year);
