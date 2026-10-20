CREATE SCHEMA IF NOT EXISTS mrt;

DROP MATERIALIZED VIEW IF EXISTS mrt.size_distribution;

-- Units and power per size class (Bruttoleistung) for solar, wind, hydropower, biomass and geothermal (the units of
-- raw.geothermal_units), and the KWK plants by their electrical power, for Deutschland ('DE'), every Bundesland (2-digit
-- key), Landkreis (5 digits) and Gemeinde (8 digits). Every region has every class, also empty ones. Solar per
-- Anlagenart ('gebaeude', 'freiflaeche', see aggregate_pv_by_region_power.sql), wind per Lage ('an_land', 'auf_see');
-- the API sums the chosen ones. The others as 'alle'. Power as Brutto (Bruttoleistung) and Netto (Nettonennleistung);
-- the classes go by the Bruttoleistung either way (KWK: the electrical power, Netto the same). Solar counts Anlagen, not
-- units: the units at one grid connection together (solar_anlagen); wind, hydropower, biomass and geothermal count
-- their units (turbines, engines), KWK its plants. Units without a Gemeinde (large plants published with their Land
-- only) count for Deutschland.
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
        ('water', 4, 10000, 'Infinity', 'über 10 MW', NULL),
        -- Biogas: Gülle-Kleinanlagen up to 75 kW (EEG § 44), most plants 0.5 to 1 MW; wood-fired plants above
        ('biomass', 1, '-Infinity', 100, 'bis 100 kW', 'Gülle-Kleinanlagen'),
        ('biomass', 2, 100, 500, '0,1–0,5 MW', NULL),
        ('biomass', 3, 500, 1000, '0,5–1 MW', NULL),
        ('biomass', 4, 1000, 5000, '1–5 MW', NULL),
        ('biomass', 5, 5000, 'Infinity', 'über 5 MW', 'Heizkraftwerke'),
        ('geothermal', 1, '-Infinity', 100, 'bis 100 kW', NULL),
        ('geothermal', 2, 100, 1000, '0,1–1 MW', NULL),
        ('geothermal', 3, 1000, 5000, '1–5 MW', NULL),
        ('geothermal', 4, 5000, 'Infinity', 'über 5 MW', NULL),
        -- KWK: Mikro-KWK (Brennstoffzellen, Stirling) in houses, Mini-KWK, Blockheizkraftwerke, Heizkraftwerke
        ('kwk', 1, '-Infinity', 2, 'bis 2 kW', 'Mikro-KWK'),
        ('kwk', 2, 2, 50, '2–50 kW', 'Mini-KWK'),
        ('kwk', 3, 50, 2000, '50 kW–2 MW', 'Blockheizkraftwerke'),
        ('kwk', 4, 2000, 50000, '2–50 MW', NULL),
        ('kwk', 5, 50000, 'Infinity', 'über 50 MW', 'Heizkraftwerke')
),
kinds (technology, anlagenart) AS (
    VALUES ('solar', 'gebaeude'), ('solar', 'freiflaeche'), ('wind', 'an_land'), ('wind', 'auf_see'), ('water', 'alle'),
        ('biomass', 'alle'), ('geothermal', 'alle'), ('kwk', 'alle')
),
kwk_places AS (
    -- Per KWK plant the Gemeinde of its largest unit (biomass, combustion and geothermal units name their KWK plant)
    SELECT DISTINCT ON (kwk) kwk, ags
    FROM (
        SELECT "KwkMaStRNummer" AS kwk, "Gemeindeschluessel" AS ags, "Bruttoleistung" AS kw FROM raw.biomass_units
        UNION ALL
        SELECT "KwkMaStRNummer", "Gemeindeschluessel", "Bruttoleistung" FROM raw.combustion_units
        UNION ALL
        SELECT "KwkMaStRNummer", "Gemeindeschluessel", "Bruttoleistung" FROM raw.geothermal_units
    ) u
    WHERE kwk IS NOT NULL
    ORDER BY kwk, kw DESC NULLS LAST, ags
),
solar_anlagen AS (
    -- Installed solar units ("In Betrieb") in Germany, those at one grid connection (the Lokation in the register) of the
    -- same Anlagenart as one Anlage, whoever operates them: parks are often registered in parts (per section, inverter
    -- or investor; over 100 units at one connection). Each on its own: balcony-size units (up to 2 kWp: the tenants of
    -- a house have their own behind its one connection), units without a Lokation, and the parts of a Lokation in
    -- another Gemeinde or postcode – a park across a border counts in each Gemeinde, and a Lokation the register shares
    -- between unrelated units across a city (Hamburg: over 1,100, nearly all balcony units) merges next to nothing.
    SELECT
        CASE WHEN "ArtDerSolaranlage" = 'Freiflächensolaranlage' THEN 'freiflaeche' ELSE 'gebaeude' END AS anlagenart,
        "Gemeindeschluessel" AS ags,
        sum("Bruttoleistung") AS power,
        sum("Nettonennleistung") AS power_net
    FROM raw.solar_units
    WHERE "EinheitBetriebsstatus" = 'In Betrieb' AND "Land" = 'Deutschland'
    GROUP BY
        1,
        2,
        "Postleitzahl",
        CASE WHEN "Bruttoleistung" <= 2 OR "LokationMaStRNummer" IS NULL THEN "EinheitMastrNummer"
            ELSE "LokationMaStRNummer" END
),
units AS (
    -- Installed units ("In Betrieb") in Germany, solar as Anlagen: without the border hydropower plants in Austria and
    -- Switzerland, with offshore wind (no Gemeindeschlüssel, it counts for DE only)
    SELECT 'solar' AS technology, anlagenart, ags, power, power_net FROM solar_anlagen
    UNION ALL
    SELECT
        'wind',
        CASE WHEN "WindAnLandOderAufSee" = 'Windkraft auf See' THEN 'auf_see' ELSE 'an_land' END,
        "Gemeindeschluessel",
        "Bruttoleistung",
        "Nettonennleistung"
    FROM raw.wind_units WHERE "EinheitBetriebsstatus" = 'In Betrieb' AND "Land" = 'Deutschland'
    UNION ALL
    SELECT 'water', 'alle', "Gemeindeschluessel", "Bruttoleistung", "Nettonennleistung"
    FROM raw.water_units WHERE "EinheitBetriebsstatus" = 'In Betrieb' AND "Land" = 'Deutschland'
    UNION ALL
    SELECT 'biomass', 'alle', "Gemeindeschluessel", "Bruttoleistung", "Nettonennleistung"
    FROM raw.biomass_units WHERE "EinheitBetriebsstatus" = 'In Betrieb' AND "Land" = 'Deutschland'
    UNION ALL
    SELECT 'geothermal', 'alle', "Gemeindeschluessel", "Bruttoleistung", "Nettonennleistung"
    FROM raw.geothermal_units WHERE "EinheitBetriebsstatus" = 'In Betrieb' AND "Land" = 'Deutschland'
    UNION ALL
    SELECT 'kwk', 'alle', k.ags, p."ElektrischeKwkLeistung", p."ElektrischeKwkLeistung"
    FROM raw.kwk_plants p
    JOIN kwk_places k ON k.kwk = p."KwkMastrNummer"
    WHERE p."AnlageBetriebsstatus" = 'In Betrieb'
),
counts AS (
    -- Per class for Deutschland, every Land, Kreis and Gemeinde in one pass
    SELECT
        c.technology,
        u.anlagenart,
        c.size_class,
        CASE
            WHEN GROUPING(u.ags) = 0 THEN 'gemeinde'
            WHEN GROUPING(LEFT(u.ags, 5)) = 0 THEN 'landkreis'
            WHEN GROUPING(LEFT(u.ags, 2)) = 0 THEN 'bundesland'
            ELSE 'deutschland'
        END AS level,
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
    -- By level too: a unit whose Gemeindeschlüssel is shorter (the register has a few with the Kreis's 5 digits) would
    -- else give its Kreis a second row
    ON n.technology = c.technology AND n.anlagenart = k.anlagenart AND n.size_class = c.size_class
        AND n.level = r.level AND n.region = r.region
ORDER BY technology, level, region, size_class, anlagenart;

-- One region per request, or all regions of a level (in a Land or Kreis): read in the order of the table, no sorting
CREATE UNIQUE INDEX ON mrt.size_distribution (technology, level, region, size_class, anlagenart);
