CREATE SCHEMA IF NOT EXISTS mrt;

DROP MATERIALIZED VIEW IF EXISTS mrt.kwk_region_stats;

-- KWK plants (Kraft-Wärme-Kopplung, raw.kwk_plants) in operation per Bundesland, Landkreis and Gemeinde: their
-- electrical and their thermal power (ElektrischeKwkLeistung, ThermischeNutzleistung). A plant lies where its units are
-- (biomass, combustion and geothermal units name their KWK plant): the place and the Energieträger of its largest unit.
-- One row per Energieträger, like the Netzanschlüsse group them: erdgas (with the other gases and hydrogen), biomasse,
-- kohle (Stein- and Braunkohle), sonstige (oil, waste, heat, Klärschlamm, Grubengas); the API sums the chosen ones.
-- Most of the power is in large plants published with their Land only (no Gemeindeschlüssel): they count for the Land,
-- not for a Kreis or Gemeinde. Plants whose units the tables don't have are left out. The heat only where it is
-- plausible: at most 50 times the electrical power (a few dozen plants have the heat of a year, kWh, or Wh: up to 7,000
-- times; micro-KWK with their peak boiler up to 50).
CREATE MATERIALIZED VIEW mrt.kwk_region_stats AS
WITH laender (name, land) AS (
    -- The Länder of the units (Bundesland, as the MaStR writes them) by their key, for the units without a Gemeinde
    VALUES ('Brandenburg', '12'), ('Berlin', '11'), ('Baden-Württemberg', '08'), ('Bayern', '09'), ('Bremen', '04'),
        ('Hessen', '06'), ('Hamburg', '02'), ('Mecklenburg-Vorpommern', '13'), ('Niedersachsen', '03'),
        ('Nordrhein-Westfalen', '05'), ('Rheinland-Pfalz', '07'), ('Schleswig-Holstein', '01'), ('Saarland', '10'),
        ('Sachsen', '14'), ('Sachsen-Anhalt', '15'), ('Thüringen', '16')
),
arten (art) AS (VALUES ('erdgas'), ('biomasse'), ('kohle'), ('sonstige')),
units AS (
    -- The units that name a KWK plant, with their Energieträger
    SELECT "KwkMaStRNummer" AS kwk, "Gemeindeschluessel" AS ags, "Bundesland" AS bundesland, "Bruttoleistung" AS kw,
        'biomasse' AS art
    FROM raw.biomass_units
    WHERE "KwkMaStRNummer" IS NOT NULL
    UNION ALL
    SELECT "KwkMaStRNummer", "Gemeindeschluessel", "Bundesland", "Bruttoleistung",
        CASE
            WHEN "Energietraeger" IN ('Erdgas', 'andere Gase', 'Wasserstoff') THEN 'erdgas'
            WHEN "Energietraeger" IN ('Steinkohle', 'Braunkohle') THEN 'kohle'
            ELSE 'sonstige'
        END
    FROM raw.combustion_units
    WHERE "KwkMaStRNummer" IS NOT NULL
    UNION ALL
    SELECT "KwkMaStRNummer", "Gemeindeschluessel", "Bundesland", "Bruttoleistung", 'sonstige'
    FROM raw.geothermal_units
    WHERE "KwkMaStRNummer" IS NOT NULL
),
places AS (
    -- Per plant its largest unit: its place and Energieträger
    SELECT DISTINCT ON (u.kwk) u.kwk, u.ags, CASE WHEN u.ags IS NULL THEN l.land END AS land, u.art
    FROM units u
    LEFT JOIN laender l ON l.name = u.bundesland
    ORDER BY u.kwk, u.kw DESC NULLS LAST, u.ags
),
gemeinde_agg AS (
    -- 1. Pre-aggregate to 1 row per Gemeinde (or Land, for the plants without one) and Energieträger
    SELECT
        s.ags,
        s.land,
        s.art,
        count(*) AS total_units,
        sum(p."ElektrischeKwkLeistung") AS total_power,
        sum(p."ThermischeNutzleistung") FILTER (WHERE p."ThermischeNutzleistung" <= 50 * p."ElektrischeKwkLeistung")
            AS total_heat,
        sum(p."ElektrischeKwkLeistung") FILTER (WHERE p."Inbetriebnahmedatum" > CURRENT_DATE - INTERVAL '12 months')
            AS added_12m_power
    FROM raw.kwk_plants p
    JOIN places s ON s.kwk = p."KwkMastrNummer"
    WHERE p."AnlageBetriebsstatus" = 'In Betrieb'
      AND (s.ags IS NOT NULL OR s.land IS NOT NULL)
    GROUP BY 1, 2, 3
),
joined AS (
    -- 2. Every Gemeinde with every Energieträger: its area and population also without plants. FULL JOIN: plants whose
    --    Gemeinde was merged after the geodata (unknown key) still count for Landkreis and Bundesland, those without one
    --    for their Land.
    SELECT
        COALESCE(g.ags, b.ags) AS ags,
        b.land,
        COALESCE(g.art, b.art) AS art,
        b.total_units,
        b.total_power,
        b.total_heat,
        b.added_12m_power,
        g.qkm,
        g.einwohner
    FROM (SELECT ags, qkm, einwohner, art FROM geo.gemeinden CROSS JOIN arten) g
    FULL JOIN gemeinde_agg b ON b.ags = g.ags AND b.art = g.art
),
regions AS (
    SELECT art, COALESCE(LEFT(ags, 2), land) AS bundesland, LEFT(ags, 5) AS landkreis, ags AS gemeinde, total_units,
        total_power, total_heat, added_12m_power, qkm, einwohner
    FROM joined
)
-- 3. Run the ROLLUP per Energieträger: Bundesland (first 2 digits of the key) > Landkreis (5) > Gemeinde (8)
SELECT
    art,
    bundesland,
    landkreis,
    gemeinde,
    COALESCE(SUM(total_units), 0) AS total_units,  -- plants
    CAST(COALESCE(SUM(total_power), 0) / 1000 AS NUMERIC(12,2)) AS total_power,  -- electrical, MW
    CAST(COALESCE(SUM(total_power), 0) / NULLIF(SUM(qkm), 0) AS NUMERIC(10,1)) AS relative_area_power,  -- kW per km²
    CAST(COALESCE(SUM(total_power), 0) / NULLIF(SUM(einwohner), 0) AS NUMERIC(10,3)) AS relative_population_power,  -- kW
    CAST(COALESCE(SUM(total_heat), 0) / 1000 AS NUMERIC(12,2)) AS total_heat,  -- thermal, MW
    CAST(COALESCE(SUM(total_heat), 0) / NULLIF(SUM(qkm), 0) AS NUMERIC(10,1)) AS relative_area_heat,  -- kW per km²
    CAST(COALESCE(SUM(total_heat), 0) / NULLIF(SUM(einwohner), 0) AS NUMERIC(10,3)) AS relative_population_heat,  -- kW
    CAST(COALESCE(SUM(added_12m_power), 0) / 1000 AS NUMERIC(12,2)) AS added_12m_power  -- Zubau of the last 12 months, MW
FROM regions
GROUP BY art, ROLLUP (bundesland, landkreis, gemeinde)
-- The plants of a Land without a Gemeinde are in the Land's row only, not in a Landkreis or Gemeinde row of their own
HAVING NOT (GROUPING(landkreis) = 0 AND landkreis IS NULL) AND NOT (GROUPING(gemeinde) = 0 AND gemeinde IS NULL);
