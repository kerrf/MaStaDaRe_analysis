CREATE SCHEMA IF NOT EXISTS mrt;

DROP MATERIALIZED VIEW IF EXISTS mrt.size_distribution;

-- Units and power per size class (Bruttoleistung of the unit) for solar, wind and hydropower, for Deutschland ('DE'),
-- every Bundesland (2-digit key), Landkreis (5 digits) and Gemeinde (8 digits). Every region has every class, also
-- empty ones. Solar per Anlagenart ('gebaeude', 'freiflaeche', see aggregate_pv_by_region_power.sql), wind per Lage
-- ('an_land', 'auf_see'); the API sums the chosen ones. Hydropower as 'alle'. Power as Brutto (Bruttoleistung) and
-- Netto (Nettonennleistung); the classes go by the Bruttoleistung either way.
CREATE MATERIALIZED VIEW mrt.size_distribution AS
WITH classes (technology, size_class, above, up_to, label, hint) AS (
    -- kW, the lower bound excluded, the upper one included ("bis 2 kWp"). Solar: Balkon-PV, small and standard rooftop
    -- systems (7–12 kWp: the typical Einfamilienhaus), then the EEG thresholds 40 and 100 kWp, 1 and 10 MWp.
    VALUES
        ('solar', 1, '-Infinity'::float8, 2::float8, 'bis 2 kWp', 'Balkon-PV'),
        ('solar', 2, 2, 7, '2–7 kWp', 'kleine Anlagen'),
        ('solar', 3, 7, 12, '7–12 kWp', 'Standardanlagen'),
        ('solar', 4, 12, 40, '12–40 kWp', 'große Dachanlagen'),
        ('solar', 5, 40, 100, '40–100 kWp', 'Gewerbedächer'),
        ('solar', 6, 100, 1000, '0,1–1 MWp', 'Großdächer'),
        ('solar', 7, 1000, 10000, '1–10 MWp', 'Freiflächen'),
        ('solar', 8, 10000, 'Infinity', 'über 10 MWp', 'Solarparks'),
        ('wind', 1, '-Infinity', 1000, 'bis 1 MW', NULL),
        ('wind', 2, 1000, 2000, '1–2 MW', NULL),
        ('wind', 3, 2000, 3000, '2–3 MW', NULL),
        ('wind', 4, 3000, 4000, '3–4 MW', NULL),
        ('wind', 5, 4000, 5000, '4–5 MW', NULL),
        ('wind', 6, 5000, 6000, '5–6 MW', NULL),
        ('wind', 7, 6000, 'Infinity', 'über 6 MW', NULL),
        ('water', 1, '-Infinity', 100, 'bis 100 kW', NULL),
        ('water', 2, 100, 1000, '0,1–1 MW', NULL),
        ('water', 3, 1000, 10000, '1–10 MW', NULL),
        ('water', 4, 10000, 'Infinity', 'über 10 MW', NULL)
),
kinds (technology, anlagenart) AS (
    VALUES ('solar', 'gebaeude'), ('solar', 'freiflaeche'), ('wind', 'an_land'), ('wind', 'auf_see'), ('water', 'alle')
),
units AS (
    -- Installed units (InBetrieb) in Germany: without the border hydropower plants in Austria and Switzerland, with
    -- offshore wind (no Gemeindeschlüssel, it counts for DE only)
    SELECT
        'solar' AS technology,
        CASE WHEN "ArtDerSolaranlage" = '852' THEN 'freiflaeche' ELSE 'gebaeude' END AS anlagenart,
        "Gemeindeschluessel" AS ags,
        "Bruttoleistung" AS power,
        "Nettonennleistung" AS power_net
    FROM raw.solar_units WHERE "EinheitBetriebsstatus" = '35' AND "Land" = '84'
    UNION ALL
    SELECT
        'wind',
        CASE WHEN "WindAnLandOderAufSee" = '889' THEN 'auf_see' ELSE 'an_land' END,
        "Gemeindeschluessel",
        "Bruttoleistung",
        "Nettonennleistung"
    FROM raw.wind_units WHERE "EinheitBetriebsstatus" = '35' AND "Land" = '84'
    UNION ALL
    SELECT 'water', 'alle', "Gemeindeschluessel", "Bruttoleistung", "Nettonennleistung"
    FROM raw.water_units WHERE "EinheitBetriebsstatus" = '35' AND "Land" = '84'
),
counts AS (
    -- Per class for Deutschland, every Land, Kreis and Gemeinde in one pass
    SELECT
        c.technology,
        u.anlagenart,
        c.size_class,
        CASE
            WHEN GROUPING(u.ags) = 0 THEN u.ags
            WHEN GROUPING(LEFT(u.ags, 5)) = 0 THEN LEFT(u.ags, 5)
            WHEN GROUPING(LEFT(u.ags, 2)) = 0 THEN LEFT(u.ags, 2)
            ELSE 'DE'
        END AS region,
        count(*) AS total_units,
        sum(u.power) AS total_power,
        sum(u.power_net) AS total_power_net
    FROM units u
    JOIN classes c ON c.technology = u.technology AND u.power > c.above AND u.power <= c.up_to
    GROUP BY GROUPING SETS (
        (c.technology, u.anlagenart, c.size_class),
        (c.technology, u.anlagenart, c.size_class, LEFT(u.ags, 2)),
        (c.technology, u.anlagenart, c.size_class, LEFT(u.ags, 5)),
        (c.technology, u.anlagenart, c.size_class, u.ags)
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
    c.technology,
    k.anlagenart,
    r.level,
    -- The keys are digits: byte order ("C") is their order, and much faster to sort than a language's
    r.region COLLATE "C" AS region,
    c.size_class,
    c.label,
    c.hint,
    COALESCE(n.total_units, 0) AS total_units,
    CAST(COALESCE(n.total_power, 0) / 1000 AS NUMERIC(12,3)) AS total_power,  -- MW
    CAST(COALESCE(n.total_power_net, 0) / 1000 AS NUMERIC(12,3)) AS total_power_net
FROM classes c
JOIN kinds k USING (technology)
CROSS JOIN regions r
LEFT JOIN counts n
    ON n.technology = c.technology AND n.anlagenart = k.anlagenart AND n.size_class = c.size_class AND n.region = r.region
ORDER BY technology, level, region, size_class, anlagenart;

-- One region per request, or all regions of a level (in a Land or Kreis): read in the order of the table, no sorting
CREATE UNIQUE INDEX ON mrt.size_distribution (technology, level, region, size_class, anlagenart);
