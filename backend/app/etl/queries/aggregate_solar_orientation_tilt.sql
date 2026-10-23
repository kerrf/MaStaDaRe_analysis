CREATE SCHEMA IF NOT EXISTS mrt;

DROP MATERIALIZED VIEW IF EXISTS mrt.solar_orientation_tilt;

-- Solar units and power by the tilt of their modules (HauptausrichtungNeigungswinkel) and their main orientation
-- (Hauptausrichtung), for Deutschland ('DE'), every Bundesland (2-digit key), Landkreis (5 digits) and Gemeinde (8
-- digits): the rose of the orientations per tilt class (page Anlagen). The register knows classes, not degrees: under
-- 5°, 5–20°, 21–40°, 41–60°, 61–89°, 90°. Under 5° (a newer class with few units, flat modules were 5–20° before)
-- counts with 5–20° as 0–20°. Tracked units have no fixed tilt; units without one in the register (mostly
-- Balkonkraftwerke, whose simplified registration doesn't ask) count as 'unbekannt'. tilt_sort: the classes from flat to
-- vertical, then tracked and unknown; orientation_sort as in aggregate_solar_orientation.sql.
-- Only the combinations that occur (the page fills in the empty ones). Per Anlagenart ('gebaeude', 'freiflaeche', 'balkon'; the
-- API sums the chosen ones), with Brutto (Bruttoleistung) and Netto (Nettonennleistung) power.
CREATE MATERIALIZED VIEW mrt.solar_orientation_tilt AS
WITH tilt_classes (mastr, tilt) AS (
    -- The register's HauptausrichtungNeigungswinkel (codes.KATALOG: Solarneigungswinkel)
    VALUES
        ('unter 5 Grad (horizontal)', '0_20'),
        ('5 - 20 Grad', '0_20'),
        ('21 - 40 Grad', '21_40'),
        ('41 - 60 Grad', '41_60'),
        ('61 - 89 Grad', '61_89'),
        ('90 Grad (vertikal)', '90'),
        ('Nachgeführt', 'nachgefuehrt')
),
tilts (tilt, sort) AS (
    VALUES ('0_20', 1), ('21_40', 2), ('41_60', 3), ('61_89', 4), ('90', 5), ('nachgefuehrt', 6), ('unbekannt', 7)
),
orientations (mastr, orientation, sort) AS (
    VALUES
        ('Nord', 'nord', 1),
        ('Nord-Ost', 'nordost', 2),
        ('Ost', 'ost', 3),
        ('Süd-Ost', 'suedost', 4),
        ('Süd', 'sued', 5),
        ('Süd-West', 'suedwest', 6),
        ('West', 'west', 7),
        ('Nord-West', 'nordwest', 8),
        ('Ost-West', 'ost_west', 9),
        ('nachgeführt', 'nachgefuehrt', 10),
        (NULL, 'unbekannt', 11)
),
units AS (
    -- Installed units ("In Betrieb") in Germany, like the region rollups
    SELECT
        COALESCE(t.tilt, 'unbekannt') AS tilt,
        COALESCE(o.orientation, 'unbekannt') AS orientation,
        CASE u."ArtDerSolaranlage" WHEN 'Freiflächensolaranlage' THEN 'freiflaeche' WHEN 'Steckerfertige Solaranlage (sog. Balkonkraftwerk)' THEN 'balkon' ELSE 'gebaeude' END AS anlagenart,
        u."Gemeindeschluessel" AS ags,
        u."Bruttoleistung" AS power,
        u."Nettonennleistung" AS power_net
    FROM raw.solar_units u
    LEFT JOIN tilt_classes t ON t.mastr = u."HauptausrichtungNeigungswinkel"
    LEFT JOIN orientations o ON o.mastr = u."Hauptausrichtung"
    WHERE u."EinheitBetriebsstatus" = 'In Betrieb'
      AND u."Land" = 'Deutschland'
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
