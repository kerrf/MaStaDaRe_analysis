CREATE SCHEMA IF NOT EXISTS mrt;

DROP MATERIALIZED VIEW IF EXISTS mrt.solar_orientation;

-- Solar units and power by the main orientation of their modules (Hauptausrichtung), for Deutschland ('DE'), every
-- Bundesland (2-digit key), Landkreis (5 digits) and Gemeinde (8 digits). Every region has every orientation, also
-- empty ones. sort: the compass clockwise from north, then Ost-West, tracked and unknown.
CREATE MATERIALIZED VIEW mrt.solar_orientation AS
WITH orientations (code, orientation, label, sort) AS (
    VALUES
        ('695', 'nord', 'Nord', 1),
        ('696', 'nordost', 'Nordost', 2),
        ('697', 'ost', 'Ost', 3),
        ('698', 'suedost', 'Südost', 4),
        ('699', 'sued', 'Süd', 5),
        ('700', 'suedwest', 'Südwest', 6),
        ('701', 'west', 'West', 7),
        ('702', 'nordwest', 'Nordwest', 8),
        ('704', 'ost_west', 'Ost-West', 9),
        ('703', 'nachgefuehrt', 'Nachgeführt', 10),
        -- No orientation in the register: mostly Balkonkraftwerke, whose simplified registration doesn't ask for it
        (NULL, 'unbekannt', 'Unbekannt', 11)
),
units AS (
    -- Installed units (InBetrieb) in Germany, like the region rollups
    SELECT COALESCE(o.orientation, 'unbekannt') AS orientation, u."Gemeindeschluessel" AS ags, u."Bruttoleistung" AS power
    FROM raw.solar_units u
    LEFT JOIN orientations o ON o.code = u."Hauptausrichtung"
    WHERE u."EinheitBetriebsstatus" = '35'
      AND u."Land" = '84'
),
counts AS (
    -- Per orientation for Deutschland, every Land, Kreis and Gemeinde in one pass
    SELECT
        orientation,
        CASE
            WHEN GROUPING(ags) = 0 THEN ags
            WHEN GROUPING(LEFT(ags, 5)) = 0 THEN LEFT(ags, 5)
            WHEN GROUPING(LEFT(ags, 2)) = 0 THEN LEFT(ags, 2)
            ELSE 'DE'
        END AS region,
        count(*) AS total_units,
        sum(power) AS total_power
    FROM units
    GROUP BY GROUPING SETS ((orientation), (orientation, LEFT(ags, 2)), (orientation, LEFT(ags, 5)), (orientation, ags))
),
regions AS (
    -- Deutschland and the Länder, Kreise and Gemeinden of the boundaries
    SELECT 'deutschland' AS level, 'DE' AS region
    UNION SELECT 'bundesland', LEFT(ags, 2) FROM geo.gemeinden
    UNION SELECT 'landkreis', LEFT(ags, 5) FROM geo.gemeinden
    UNION SELECT 'gemeinde', ags FROM geo.gemeinden
)
SELECT
    o.orientation,
    o.label,
    o.sort,
    r.level,
    -- The keys are digits: byte order ("C") is their order, and much faster to sort than a language's
    r.region COLLATE "C" AS region,
    COALESCE(n.total_units, 0) AS total_units,
    CAST(COALESCE(n.total_power, 0) / 1000 AS NUMERIC(12,3)) AS total_power  -- MW
FROM orientations o
CROSS JOIN regions r
LEFT JOIN counts n ON n.orientation = o.orientation AND n.region = r.region
ORDER BY r.level, 5, o.sort;

-- One region per request, or all regions of a level (in a Land or Kreis): read in the order of the table, no sorting
CREATE UNIQUE INDEX ON mrt.solar_orientation (level, region, sort);
