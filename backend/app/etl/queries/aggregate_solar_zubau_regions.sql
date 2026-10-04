CREATE SCHEMA IF NOT EXISTS mrt;

DROP MATERIALIZED VIEW IF EXISTS mrt.solar_zubau_regions;

-- Solar Zubau and Bestand per year since 2000 for Deutschland ('DE'), every Bundesland (2-digit key), Landkreis (5)
-- and Gemeinde (8): the units that went into operation in the year, and those in operation at its end (minus the finally
-- decommissioned ones), like the Germany-wide mrt.zubau_zeitverlauf. Every region has every year, also empty ones.
-- Per Anlagenart ('gebaeude', 'freiflaeche', see aggregate_pv_by_region_power.sql; the API returns both), with Brutto
-- (Bruttoleistung) and Netto (Nettonennleistung) power. Units that went into operation before 2000 count into the Bestand.
CREATE MATERIALIZED VIEW mrt.solar_zubau_regions AS
WITH units AS (
    -- Every unit in Germany that went into operation (planned ones have no Inbetriebnahmedatum): the year it came,
    -- before 2000 as 1999, and the year it was finally decommissioned (38), at the earliest the year it came
    SELECT
        CASE WHEN "ArtDerSolaranlage" = '852' THEN 'freiflaeche' ELSE 'gebaeude' END AS anlagenart,
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
    SELECT u.anlagenart, u.ags, c.year, c.units, c.added, c.added_net, c.net_units, c.net, c.net_net
    FROM units u
    CROSS JOIN LATERAL (VALUES
        (u.added_in, 1, u.power, u.power_net, 1, u.power, u.power_net),
        (u.removed_in, 0, 0, 0, -1, -u.power, -u.power_net)
    ) AS c(year, units, added, added_net, net_units, net, net_net)
    WHERE c.year IS NOT NULL
),
per_region AS (
    -- Per year for Deutschland, every Land, Kreis and Gemeinde in one pass
    SELECT
        anlagenart,
        year,
        CASE
            WHEN GROUPING(ags) = 0 THEN ags
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
        (anlagenart, year),
        (anlagenart, year, LEFT(ags, 2)),
        (anlagenart, year, LEFT(ags, 5)),
        (anlagenart, year, ags)
    )
),
regions AS (
    -- Deutschland and the Länder, Kreise and Gemeinden of the boundaries
    SELECT 'deutschland' AS level, 'DE' AS region
    UNION SELECT 'bundesland', LEFT(ags, 2) FROM geo.gemeinden
    UNION SELECT 'landkreis', LEFT(ags, 5) FROM geo.gemeinden
    UNION SELECT 'gemeinde', ags FROM geo.gemeinden
),
grid AS (
    -- Every region, Anlagenart and year from 1999 (the units before 2000) to the latest commissioning; the Bestand is
    -- the running total of the net changes
    SELECT
        r.level,
        r.region,
        a.anlagenart,
        y.year,
        COALESCE(p.added_units, 0) AS added_units,
        COALESCE(p.added, 0) AS added,
        COALESCE(p.added_net, 0) AS added_net,
        sum(COALESCE(p.net_units, 0)) OVER w AS installed_units,
        sum(COALESCE(p.net, 0)) OVER w AS installed,
        sum(COALESCE(p.net_net, 0)) OVER w AS installed_net
    FROM regions r
    CROSS JOIN (VALUES ('gebaeude'), ('freiflaeche')) AS a (anlagenart)
    CROSS JOIN generate_series(1999, (SELECT max(added_in) FROM units)) AS y (year)
    LEFT JOIN per_region p ON p.region = r.region AND p.anlagenart = a.anlagenart AND p.year = y.year
    WINDOW w AS (PARTITION BY r.region, a.anlagenart ORDER BY y.year)
)
SELECT
    level,
    -- The keys are digits: byte order ("C") is their order, and much faster to sort than a language's
    region COLLATE "C" AS region,
    year,
    anlagenart,
    CAST(added_units AS INTEGER) AS added_units,
    CAST(added / 1000 AS NUMERIC(12,3)) AS added,  -- MW
    CAST(added_net / 1000 AS NUMERIC(12,3)) AS added_net,
    CAST(installed_units AS INTEGER) AS installed_units,
    CAST(installed / 1000 AS NUMERIC(12,3)) AS installed,
    CAST(installed_net / 1000 AS NUMERIC(12,3)) AS installed_net
FROM grid
WHERE year >= 2000
ORDER BY level, region, year, anlagenart;

-- One region per request: read in the order of the table, no sorting
CREATE UNIQUE INDEX ON mrt.solar_zubau_regions (level, region, year, anlagenart);
