CREATE SCHEMA IF NOT EXISTS mrt;

DROP MATERIALIZED VIEW IF EXISTS mrt.solar_orientation_tilt;

-- Solar units and power by the tilt of their modules (HauptausrichtungNeigungswinkel) and their main orientation
-- (Hauptausrichtung), for Deutschland ('DE'), every Bundesland (2-digit key), Landkreis (5 digits) and Gemeinde (8
-- digits): the rose of the orientations per tilt class (page Anlagen). The register knows classes, not degrees: under
-- 5°, 5–20°, 21–40°, 41–60°, 61–89°, 90°. Under 5° (a newer code with few units, flat modules were 5–20° before)
-- counts with 5–20° as 0–20°. Tracked units have no fixed tilt; units without one in the register (mostly
-- Balkonkraftwerke, whose simplified registration doesn't ask) count as 'unbekannt'. tilt_sort: the classes from flat to
-- vertical, then tracked and unknown; orientation_sort as in aggregate_solar_orientation.sql.
-- Only the combinations that occur (the page fills in the empty ones). Per Anlagenart ('gebaeude', 'freiflaeche'; the
-- API sums the chosen ones), with Brutto (Bruttoleistung) and Netto (Nettonennleistung) power.
CREATE MATERIALIZED VIEW mrt.solar_orientation_tilt AS
WITH tilt_codes (code, tilt) AS (
    -- The register stores the tilt as a number (its code)
    VALUES
        (3179, '0_20'),
        (810, '0_20'),
        (809, '21_40'),
        (808, '41_60'),
        (807, '61_89'),
        (806, '90'),
        (811, 'nachgefuehrt')
),
tilts (tilt, sort) AS (
    VALUES ('0_20', 1), ('21_40', 2), ('41_60', 3), ('61_89', 4), ('90', 5), ('nachgefuehrt', 6), ('unbekannt', 7)
),
orientations (code, orientation, sort) AS (
    VALUES
        ('695', 'nord', 1),
        ('696', 'nordost', 2),
        ('697', 'ost', 3),
        ('698', 'suedost', 4),
        ('699', 'sued', 5),
        ('700', 'suedwest', 6),
        ('701', 'west', 7),
        ('702', 'nordwest', 8),
        ('704', 'ost_west', 9),
        ('703', 'nachgefuehrt', 10),
        (NULL, 'unbekannt', 11)
),
units AS (
    -- Installed units (InBetrieb) in Germany, like the region rollups
    SELECT
        COALESCE(t.tilt, 'unbekannt') AS tilt,
        COALESCE(o.orientation, 'unbekannt') AS orientation,
        CASE WHEN u."ArtDerSolaranlage" = '852' THEN 'freiflaeche' ELSE 'gebaeude' END AS anlagenart,
        u."Gemeindeschluessel" AS ags,
        u."Bruttoleistung" AS power,
        u."Nettonennleistung" AS power_net
    FROM raw.solar_units u
    LEFT JOIN tilt_codes t ON t.code = u."HauptausrichtungNeigungswinkel"
    LEFT JOIN orientations o ON o.code = u."Hauptausrichtung"
    WHERE u."EinheitBetriebsstatus" = '35'
      AND u."Land" = '84'
),
counts AS (
    -- Per tilt and orientation for Deutschland, every Land, Kreis and Gemeinde in one pass
    SELECT
        tilt,
        orientation,
        anlagenart,
        CASE
            WHEN GROUPING(ags) = 0 THEN ags
            WHEN GROUPING(LEFT(ags, 5)) = 0 THEN LEFT(ags, 5)
            WHEN GROUPING(LEFT(ags, 2)) = 0 THEN LEFT(ags, 2)
            ELSE 'DE'
        END AS region,
        count(*) AS total_units,
        sum(power) AS total_power,
        sum(power_net) AS total_power_net
    FROM units
    GROUP BY GROUPING SETS (
        (tilt, orientation, anlagenart),
        (tilt, orientation, anlagenart, LEFT(ags, 2)),
        (tilt, orientation, anlagenart, LEFT(ags, 5)),
        (tilt, orientation, anlagenart, ags)
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
    n.tilt,
    t.sort AS tilt_sort,
    n.orientation,
    o.sort AS orientation_sort,
    n.anlagenart,
    r.level,
    -- The keys are digits: byte order ("C") is their order, and much faster to sort than a language's
    r.region COLLATE "C" AS region,
    CAST(n.total_units AS INTEGER) AS total_units,
    CAST(COALESCE(n.total_power, 0) / 1000 AS NUMERIC(12,3)) AS total_power,  -- MW
    CAST(COALESCE(n.total_power_net, 0) / 1000 AS NUMERIC(12,3)) AS total_power_net
FROM counts n
JOIN regions r ON r.region = n.region
JOIN tilts t ON t.tilt = n.tilt
JOIN orientations o ON o.orientation = n.orientation
ORDER BY level, region, tilt_sort, orientation_sort, anlagenart;

-- One region per request: read in the order of the table, no sorting
CREATE UNIQUE INDEX ON mrt.solar_orientation_tilt (level, region, tilt_sort, orientation_sort, anlagenart);
