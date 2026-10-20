CREATE SCHEMA IF NOT EXISTS mrt;

DROP MATERIALIZED VIEW IF EXISTS mrt.registrierungen_regions;

-- The Registrierungen of mrt.registrierungen (aggregate_registrierungen.sql: the same technologies and rules) for
-- Deutschland ('DE'), every Bundesland (2-digit key) and Landkreis (5 digits): per month and, with month NULL, per
-- year, the units registered in the period and all registered up to its end. A unit counts in the Land and Kreis of its
-- Gemeindeschlüssel; one without (offshore, abroad) for Deutschland only.
CREATE MATERIALIZED VIEW mrt.registrierungen_regions AS
WITH kwk_places AS (
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
units AS (
    -- Solar as a whole and per Anlagenart: Freifläche, else Gebäude (also steckerfertige, sonstige, without an Art)
    SELECT s.technology, u."Gemeindeschluessel" AS ags, u."Registrierungsdatum" AS registered
    FROM raw.solar_units u
    CROSS JOIN LATERAL (VALUES
        ('solar'),
        (CASE WHEN u."ArtDerSolaranlage" = 'Freiflächensolaranlage' THEN 'solar_freiflaeche' ELSE 'solar_gebaeude' END)
    ) AS s(technology)
    UNION ALL
    -- Wind as a whole and per Lage: auf See, else an Land
    SELECT w.technology, u."Gemeindeschluessel", u."Registrierungsdatum"
    FROM raw.wind_units u
    CROSS JOIN LATERAL (VALUES
        ('wind'),
        (CASE WHEN u."WindAnLandOderAufSee" = 'Windkraft auf See' THEN 'wind_auf_see' ELSE 'wind_an_land' END)
    ) AS w(technology)
    UNION ALL
    SELECT 'wasserkraft', "Gemeindeschluessel", "Registrierungsdatum" FROM raw.water_units
    UNION ALL
    SELECT 'batterie', "Gemeindeschluessel", "Registrierungsdatum" FROM raw.storage_units WHERE "Technologie" = 'Batterie'
    UNION ALL
    SELECT 'pumpspeicher', "Gemeindeschluessel", "Registrierungsdatum" FROM raw.storage_units WHERE "Technologie" = 'Pumpspeicher'
    UNION ALL
    -- Without the gas storage units, which the export lists among the gas producers too
    SELECT 'gaserzeuger', "Gemeindeschluessel", "Registrierungsdatum"
    FROM raw.gas_producer_units WHERE "SpeicherMaStRNummer" IS NULL
    UNION ALL
    SELECT 'gasspeicher', "Gemeindeschluessel", "Registrierungsdatum" FROM raw.gas_storage_units
    UNION ALL
    SELECT 'biomasse', "Gemeindeschluessel", "Registrierungsdatum" FROM raw.biomass_units
    UNION ALL
    -- Geothermie, Grubengas, Klärschlamm, Druckentspannung and Solarthermie
    SELECT 'geothermie_grubengas', "Gemeindeschluessel", "Registrierungsdatum" FROM raw.geothermal_units
    UNION ALL
    -- The KWK plants, in the Gemeinde of their largest unit
    SELECT 'kwk', k.ags, p."Registrierungsdatum"
    FROM raw.kwk_plants p
    LEFT JOIN kwk_places k ON k.kwk = p."KwkMastrNummer"
    UNION ALL
    -- The storages that are neither batteries nor pumped storage: Druckluft, Schwungrad, Wasserstoff
    SELECT 'speicher_sonstige', "Gemeindeschluessel", "Registrierungsdatum"
    FROM raw.storage_units WHERE "Technologie" IN ('Druckluft', 'Schwungrad', 'Wasserstoffspeicher')
),
per_month AS (
    -- Deutschland, the Länder and the Kreise in one pass
    SELECT
        technology,
        CASE
            WHEN GROUPING(LEFT(ags, 5)) = 0 THEN LEFT(ags, 5)
            WHEN GROUPING(LEFT(ags, 2)) = 0 THEN LEFT(ags, 2)
            ELSE 'DE'
        END AS region,
        CAST(date_trunc('month', registered) AS date) AS month_start,
        count(*) AS units
    FROM units
    WHERE registered IS NOT NULL
    GROUP BY GROUPING SETS (
        (technology, date_trunc('month', registered)),
        (technology, date_trunc('month', registered), LEFT(ags, 2)),
        (technology, date_trunc('month', registered), LEFT(ags, 5))
    )
),
series AS (
    -- Every month from the technology's first registration in the region to the current one; the total is the
    -- running sum
    SELECT
        t.technology,
        t.region,
        m.month_start,
        CAST(EXTRACT(YEAR FROM m.month_start) AS INTEGER) AS year,
        CAST(EXTRACT(MONTH FROM m.month_start) AS INTEGER) AS month,
        COALESCE(p.units, 0) AS units,
        sum(COALESCE(p.units, 0)) OVER (PARTITION BY t.technology, t.region ORDER BY m.month_start) AS total
    FROM (
        SELECT technology, region, min(month_start) AS first_month
        FROM per_month
        WHERE region IS NOT NULL
        GROUP BY technology, region
    ) t
    CROSS JOIN LATERAL (
        SELECT CAST(g AS date) AS month_start
        FROM generate_series(CAST(t.first_month AS timestamp), date_trunc('month', LOCALTIMESTAMP), interval '1 month') g
    ) m
    LEFT JOIN per_month p ON p.technology = t.technology AND p.region = t.region AND p.month_start = m.month_start
)
-- Months, and with ROLLUP their years (month NULL). A period's total is the one at the end of its last month.
SELECT
    region COLLATE "C" AS region,
    technology,
    year,
    month,
    CAST(sum(units) AS INTEGER) AS units,
    CAST((array_agg(total ORDER BY month_start DESC))[1] AS INTEGER) AS total
FROM series
GROUP BY region, technology, year, ROLLUP (month)
ORDER BY region, technology, year, month NULLS FIRST;

CREATE INDEX ON mrt.registrierungen_regions (region, technology, year, month);
