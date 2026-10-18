CREATE SCHEMA IF NOT EXISTS mrt;

DROP MATERIALIZED VIEW IF EXISTS mrt.solar_arten_regions;

-- Solar per Art for the page Auf einen Blick: like mrt.solar_zubau_regions (aggregate_solar_zubau_regions.sql) – the
-- units that went into operation in a year, and those in operation at its end, Brutto and Netto – but with the
-- Balkonkraftwerke apart, for Deutschland ('DE'), every Bundesland (2-digit key) and Landkreis (5):
--   gebaeude:    Gebäude- and sonstige Solaranlagen (853, 2484) and those without an Art
--   balkon:      steckerfertige Solaranlagen (2961), the Balkonkraftwerke as registered
--   freiflaeche: Freiflächensolaranlagen (852)
-- Everywhere else the Balkonkraftwerke count with the Gebäude: about 1 % of the power, and the register knows only a
-- part of them (see the page Datenqualität). Units that went into operation before 2000 count into the Bestand.
CREATE MATERIALIZED VIEW mrt.solar_arten_regions AS
WITH units AS (
    -- Every unit in Germany that went into operation: the year it came (before 2000 as 1999), the year it was finally
    -- decommissioned (38), at the earliest the year it came
    SELECT
        CASE "ArtDerSolaranlage" WHEN '852' THEN 'freiflaeche' WHEN '2961' THEN 'balkon' ELSE 'gebaeude' END AS art,
        "Gemeindeschluessel" AS ags,
        GREATEST(CAST(EXTRACT(YEAR FROM "Inbetriebnahmedatum") AS INTEGER), 1999) AS added_in,
        CASE WHEN "EinheitBetriebsstatus" = '38' THEN GREATEST(
            CAST(EXTRACT(YEAR FROM GREATEST("DatumEndgueltigeStilllegung"::date, "Inbetriebnahmedatum")) AS INTEGER), 1999
        ) END AS removed_in,
        COALESCE("Bruttoleistung", 0) AS power,
        COALESCE("Nettonennleistung", 0) AS power_net
    FROM raw.solar_units
    WHERE "Inbetriebnahmedatum" IS NOT NULL
      AND "Land" = '84'
      AND "Gemeindeschluessel" IS NOT NULL
),
changes AS (
    -- Per unit two changes: + in the year it came, - in the year it left
    SELECT u.art, u.ags, c.year, c.units, c.added, c.added_net, c.net_units, c.net, c.net_net
    FROM units u
    CROSS JOIN LATERAL (VALUES
        (u.added_in, 1, u.power, u.power_net, 1, u.power, u.power_net),
        (u.removed_in, 0, 0, 0, -1, -u.power, -u.power_net)
    ) AS c(year, units, added, added_net, net_units, net, net_net)
    WHERE c.year IS NOT NULL
),
per_region AS (
    -- Per year for Deutschland, every Land and Kreis in one pass
    SELECT
        art,
        year,
        CASE
            WHEN GROUPING(LEFT(ags, 5)) = 0 THEN LEFT(ags, 5)
            WHEN GROUPING(LEFT(ags, 2)) = 0 THEN LEFT(ags, 2)
            ELSE 'DE'
        END AS region,
        sum(units) AS added_units,
        sum(added) AS added,
        sum(added_net) AS added_net,
        sum(net_units) AS net_units,
        sum(net) AS net,
        sum(net_net) AS net_net
    FROM changes
    GROUP BY GROUPING SETS (
        (art, year),
        (art, year, LEFT(ags, 2)),
        (art, year, LEFT(ags, 5))
    )
),
regions AS (
    -- Deutschland and the Länder and Kreise of the boundaries
    SELECT 'deutschland' AS level, 'DE' AS region
    UNION SELECT 'bundesland', LEFT(ags, 2) FROM geo.gemeinden
    UNION SELECT 'landkreis', LEFT(ags, 5) FROM geo.gemeinden
),
grid AS (
    -- Every region, Art and year from 1999 (the units before 2000) to the latest commissioning; the Bestand is the
    -- running total of the net changes
    SELECT
        r.level,
        r.region,
        a.art,
        y.year,
        COALESCE(p.added_units, 0) AS added_units,
        COALESCE(p.added, 0) AS added,
        COALESCE(p.added_net, 0) AS added_net,
        sum(COALESCE(p.net_units, 0)) OVER w AS installed_units,
        sum(COALESCE(p.net, 0)) OVER w AS installed,
        sum(COALESCE(p.net_net, 0)) OVER w AS installed_net
    FROM regions r
    CROSS JOIN (VALUES ('gebaeude'), ('balkon'), ('freiflaeche')) AS a (art)
    CROSS JOIN generate_series(1999, (SELECT max(added_in) FROM units)) AS y (year)
    LEFT JOIN per_region p ON p.region = r.region AND p.art = a.art AND p.year = y.year
    WINDOW w AS (PARTITION BY r.region, a.art ORDER BY y.year)
)
SELECT
    level,
    -- The keys are digits: byte order ("C") is their order, and much faster to sort than a language's
    region COLLATE "C" AS region,
    year,
    art,
    CAST(added_units AS INTEGER) AS added_units,
    CAST(added / 1000 AS NUMERIC(12,3)) AS added,  -- MW
    CAST(added_net / 1000 AS NUMERIC(12,3)) AS added_net,
    CAST(installed_units AS INTEGER) AS installed_units,
    CAST(installed / 1000 AS NUMERIC(12,3)) AS installed,
    CAST(installed_net / 1000 AS NUMERIC(12,3)) AS installed_net
FROM grid
WHERE year >= 2000
ORDER BY level, region, year, art;

-- One region per request: read in the order of the table, no sorting
CREATE UNIQUE INDEX ON mrt.solar_arten_regions (level, region, year, art);
