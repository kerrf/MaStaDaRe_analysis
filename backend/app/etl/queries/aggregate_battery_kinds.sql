CREATE SCHEMA IF NOT EXISTS mrt;

DROP MATERIALIZED VIEW IF EXISTS mrt.battery_kinds;

-- Battery storage units in operation by kind, twice: by their battery technology ('technologie': Lithium, Blei, …) and
-- by how they are coupled ('kopplung': AC or DC), for Deutschland ('DE'), every Bundesland (2-digit key), Landkreis (5)
-- and Gemeinde (8): their number, power (MW) and share of the plant's capacity (MWh, split between the units by their
-- power). Only the kinds that occur in a region. Like mrt.battery_size_distribution, only units with a plausible
-- capacity (battery-charts.de: more than 0.3 kWh and 0.3 kW, full in 6 minutes to 12 hours).
CREATE MATERIALIZED VIEW mrt.battery_kinds AS
WITH kinds (kind, mastr, category, sort, label) AS (
    -- The register's texts (codes.KATALOG: Batterietechnologie, Systemkopplung); without one: 'unbekannt'
    VALUES
        ('technologie', 'Lithium-Batterie', 'lithium', 1, 'Lithium'),
        ('technologie', 'Blei-Batterie', 'blei', 2, 'Blei'),
        ('technologie', 'Redox-Flow-Batterie', 'redox_flow', 3, 'Redox-Flow'),
        ('technologie', 'Hochtemperaturbatterie', 'hochtemperatur', 4, 'Hochtemperatur'),
        ('technologie', 'Nickel-Cadmium- / Nickel-Metallhydridbatterie', 'nickel', 5, 'Nickel-Cadmium/-Metallhydrid'),
        ('technologie', 'Sonstige Batterie', 'sonstige', 6, 'Sonstige'),
        ('kopplung', 'AC gekoppeltes System', 'ac', 1, 'AC-gekoppelt'),
        ('kopplung', 'DC gekoppeltes System', 'dc', 2, 'DC-gekoppelt')
),
battery_plants AS (
    SELECT
        u."SpeMastrNummer",
        max(p."NutzbareSpeicherkapazitaet") AS capacity,
        sum(u."Bruttoleistung") AS power
    FROM raw.storage_units u
    JOIN raw.storage_plants p ON p."MaStRNummer" = u."SpeMastrNummer"
    WHERE u."Technologie" = 'Batterie'
    GROUP BY u."SpeMastrNummer"
),
units AS (
    -- Battery units in operation ("In Betrieb") in Germany, each once per kind
    SELECT
        u."Gemeindeschluessel" AS ags,
        k.kind,
        k.mastr,
        u."Bruttoleistung" AS power,
        b.capacity * u."Bruttoleistung" / b.power AS capacity
    FROM raw.storage_units u
    JOIN battery_plants b USING ("SpeMastrNummer")
    CROSS JOIN LATERAL (VALUES
        ('technologie', u."Batterietechnologie"),
        ('kopplung', u."AcDcKoppelung")
    ) AS k(kind, mastr)
    WHERE u."Technologie" = 'Batterie'
      AND u."EinheitBetriebsstatus" = 'In Betrieb'
      AND u."Land" = 'Deutschland'
      AND u."Gemeindeschluessel" IS NOT NULL
      AND b.capacity > 0.3
      AND b.power > 0.3
      AND b.capacity / b.power BETWEEN 0.1 AND 12
),
counts AS (
    -- Per kind for Deutschland, every Land, Kreis and Gemeinde in one pass
    SELECT
        u.kind,
        COALESCE(k.category, 'unbekannt') AS category,
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
    LEFT JOIN kinds k ON k.kind = u.kind AND k.mastr = u.mastr
    GROUP BY GROUPING SETS (
        (u.kind, COALESCE(k.category, 'unbekannt')),
        (u.kind, COALESCE(k.category, 'unbekannt'), LEFT(u.ags, 2)),
        (u.kind, COALESCE(k.category, 'unbekannt'), LEFT(u.ags, 5)),
        (u.kind, COALESCE(k.category, 'unbekannt'), u.ags)
    )
)
SELECT
    CASE WHEN c.region = 'DE' THEN 'deutschland' WHEN length(c.region) = 2 THEN 'bundesland'
        WHEN length(c.region) = 5 THEN 'landkreis' ELSE 'gemeinde' END AS level,
    -- The keys are digits: byte order ("C") is their order, and much faster to sort than a language's
    c.region COLLATE "C" AS region,
    c.kind,
    c.category,
    COALESCE(k.sort, 9) AS sort,
    COALESCE(k.label, 'ohne Angabe') AS label,
    c.total_units,
    CAST(c.total_power / 1000 AS NUMERIC(12,3)) AS total_power,  -- MW
    CAST(c.total_capacity / 1000 AS NUMERIC(12,3)) AS total_capacity  -- MWh
FROM counts c
LEFT JOIN (SELECT DISTINCT kind, category, sort, label FROM kinds) k ON k.kind = c.kind AND k.category = c.category
ORDER BY level, region, kind, sort;

-- One region per request: read in the order of the table, no sorting
CREATE UNIQUE INDEX ON mrt.battery_kinds (level, region, kind, category);
