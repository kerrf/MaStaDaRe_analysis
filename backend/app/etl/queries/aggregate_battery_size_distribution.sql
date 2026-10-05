CREATE SCHEMA IF NOT EXISTS mrt;

DROP MATERIALIZED VIEW IF EXISTS mrt.battery_size_distribution;

-- Battery storage units in operation per size class, by the usable capacity of their storage plant, for Deutschland
-- ('DE'), every Bundesland (2-digit key), Landkreis (5) and Gemeinde (8): their number, power (MW) and share of the
-- plant's capacity (MWh, split between the units by their power). Every region has every class, also empty ones.
-- Like mrt.battery_zubau_regions, only units with a plausible capacity (battery-charts.de: more than 0.3 kWh and 0.3 kW,
-- full in 6 minutes to 12 hours).
CREATE MATERIALIZED VIEW mrt.battery_size_distribution AS
WITH classes (size_class, above, up_to, label, hint) AS (
    -- kWh of the plant, the lower bound excluded, the upper one included. Heimspeicher mostly 5–15 kWh; from 30 kWh
    -- Gewerbe, from 1 MWh Großspeicher (battery-charts.de)
    VALUES
        (1, '-Infinity'::float8, 5::float8, 'bis 5 kWh', 'kleine Heimspeicher'),
        (2, 5, 10, '5–10 kWh', 'Heimspeicher'),
        (3, 10, 15, '10–15 kWh', 'Heimspeicher'),
        (4, 15, 30, '15–30 kWh', 'große Heimspeicher'),
        (5, 30, 100, '30–100 kWh', 'Gewerbe'),
        (6, 100, 1000, '0,1–1 MWh', 'Gewerbe, Landwirtschaft'),
        (7, 1000, 10000, '1–10 MWh', 'Großspeicher'),
        (8, 10000, 'Infinity', 'über 10 MWh', 'Großspeicher am Netz')
),
battery_plants AS (
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
    -- Battery units in operation (InBetrieb) in Germany
    SELECT
        u."Gemeindeschluessel" AS ags,
        b.capacity AS plant_capacity,
        u."Bruttoleistung" AS power,
        b.capacity * u."Bruttoleistung" / b.power AS capacity
    FROM raw.storage_units u
    JOIN battery_plants b USING ("SpeMastrNummer")
    WHERE u."Technologie" = '524'
      AND u."EinheitBetriebsstatus" = '35'
      AND u."Land" = '84'
      AND u."Gemeindeschluessel" IS NOT NULL
      AND b.capacity > 0.3
      AND b.power > 0.3
      AND b.capacity / b.power BETWEEN 0.1 AND 12
),
counts AS (
    -- Per class for Deutschland, every Land, Kreis and Gemeinde in one pass
    SELECT
        c.size_class,
        CASE
            WHEN GROUPING(u.ags) = 0 THEN u.ags
            WHEN GROUPING(LEFT(u.ags, 5)) = 0 THEN LEFT(u.ags, 5)
            WHEN GROUPING(LEFT(u.ags, 2)) = 0 THEN LEFT(u.ags, 2)
            ELSE 'DE'
        END AS region,
        count(*) AS total_units,
        sum(u.power) AS total_power,
        sum(u.capacity) AS total_capacity
    FROM units u
    JOIN classes c ON u.plant_capacity > c.above AND u.plant_capacity <= c.up_to
    GROUP BY GROUPING SETS (
        (c.size_class),
        (c.size_class, LEFT(u.ags, 2)),
        (c.size_class, LEFT(u.ags, 5)),
        (c.size_class, u.ags)
    )
),
regions AS (
    -- Deutschland and the Länder, Kreise and Gemeinden of the boundaries
    SELECT 'deutschland' AS level, 'DE' AS region
    UNION SELECT 'bundesland', LEFT(ags, 2) FROM geo.gemeinden
    UNION SELECT 'landkreis', LEFT(ags, 5) FROM geo.gemeinden
    UNION SELECT 'gemeinde', ags FROM geo.gemeinden
)
SELECT
    r.level,
    -- The keys are digits: byte order ("C") is their order, and much faster to sort than a language's
    r.region COLLATE "C" AS region,
    c.size_class,
    c.label,
    c.hint,
    COALESCE(n.total_units, 0) AS total_units,
    CAST(COALESCE(n.total_power, 0) / 1000 AS NUMERIC(12,3)) AS total_power,  -- MW
    CAST(COALESCE(n.total_capacity, 0) / 1000 AS NUMERIC(12,3)) AS total_capacity  -- MWh
FROM classes c
CROSS JOIN regions r
LEFT JOIN counts n ON n.size_class = c.size_class AND n.region = r.region
ORDER BY level, region, size_class;

-- One region per request: read in the order of the table, no sorting
CREATE UNIQUE INDEX ON mrt.battery_size_distribution (level, region, size_class);
