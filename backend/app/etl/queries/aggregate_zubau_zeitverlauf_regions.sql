CREATE SCHEMA IF NOT EXISTS mrt;

DROP MATERIALIZED VIEW IF EXISTS mrt.zubau_zeitverlauf_regions;

-- The Ausbau im Zeitverlauf of mrt.zubau_zeitverlauf (aggregate_zubau.sql: the same series, units and rules) for
-- Deutschland ('DE'), every Bundesland (2-digit key) and Landkreis (5 digits): Zubau and Bestand per month and, with
-- month NULL, per year since 2000, the Bestand as amount and as units. A unit counts in the Land and Kreis of its
-- Gemeindeschlüssel; one without (offshore wind) for Deutschland only, those of the series that came later (biomass,
-- geothermal, KWK, the other storages) for their Land if the register names it (large plants). A series that never had a
-- unit in a region has no rows there.
CREATE MATERIALIZED VIEW mrt.zubau_zeitverlauf_regions AS
WITH laender (name, land) AS (
    -- The Länder of the units (Bundesland, as the MaStR writes them) by their key, for the units without a Gemeinde
    VALUES ('Brandenburg', '12'), ('Berlin', '11'), ('Baden-Württemberg', '08'), ('Bayern', '09'), ('Bremen', '04'),
        ('Hessen', '06'), ('Hamburg', '02'), ('Mecklenburg-Vorpommern', '13'), ('Niedersachsen', '03'),
        ('Nordrhein-Westfalen', '05'), ('Rheinland-Pfalz', '07'), ('Schleswig-Holstein', '01'), ('Saarland', '10'),
        ('Sachsen', '14'), ('Sachsen-Anhalt', '15'), ('Thüringen', '16')
),
kwk_units AS (
    -- The units that name a KWK plant: the series of its Energieträger, its place (a Gemeinde, else its Land)
    SELECT u."KwkMaStRNummer" AS kwk, u."Gemeindeschluessel" AS ags,
        CASE WHEN u."Gemeindeschluessel" IS NULL THEN l.land END AS land, u."Bruttoleistung" AS kw,
        CAST(u."DatumEndgueltigeStilllegung" AS date) AS removed_on, u.art
    FROM (
        SELECT "KwkMaStRNummer", "Gemeindeschluessel", "Bundesland", "Bruttoleistung", "DatumEndgueltigeStilllegung",
            'kwk_biomasse' AS art
        FROM raw.biomass_units
        UNION ALL
        SELECT "KwkMaStRNummer", "Gemeindeschluessel", "Bundesland", "Bruttoleistung", "DatumEndgueltigeStilllegung",
            CASE
                WHEN "Energietraeger" IN ('Erdgas', 'andere Gase', 'Wasserstoff') THEN 'kwk_erdgas'
                WHEN "Energietraeger" IN ('Steinkohle', 'Braunkohle') THEN 'kwk_kohle'
                ELSE 'kwk_sonstige'
            END
        FROM raw.combustion_units
        UNION ALL
        SELECT "KwkMaStRNummer", "Gemeindeschluessel", "Bundesland", "Bruttoleistung", "DatumEndgueltigeStilllegung",
            'kwk_sonstige'
        FROM raw.geothermal_units
    ) u
    LEFT JOIN laender l ON l.name = u."Bundesland"
    WHERE u."KwkMaStRNummer" IS NOT NULL
),
kwk_places AS (
    -- Per KWK plant: the place and Energieträger of its largest unit, and when its last unit was shut down for good
    SELECT DISTINCT ON (kwk) kwk, ags, land, art, max(removed_on) OVER (PARTITION BY kwk) AS removed_on
    FROM kwk_units
    ORDER BY kwk, kw DESC NULLS LAST, ags
),
other_storage_plants AS (
    -- The capacity of the storages that are neither batteries nor pumped storage, per storage plant, and their power
    SELECT u."SpeMastrNummer", max(p."NutzbareSpeicherkapazitaet") AS capacity, sum(u."Bruttoleistung") AS power
    FROM raw.storage_units u
    JOIN raw.storage_plants p ON p."MaStRNummer" = u."SpeMastrNummer"
    WHERE u."Technologie" IN ('Druckluft', 'Schwungrad', 'Wasserstoffspeicher')
    GROUP BY u."SpeMastrNummer"
),
battery_plants AS (
    -- The capacity (kWh) is registered per storage plant (AnlagenStromSpeicher), the power (kW) per unit.
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
    -- 1. Every unit that went into operation: its series, its Gemeindeschlüssel, the day it came, the day it was
    --    finally decommissioned, its amount, and its Land if it has no Gemeinde (the series that came later). Solar
    --    four times: all solar and its Anlagenart, each as Bruttoleistung and Nettonennleistung ('…_netto').
    SELECT
        s.technology,
        u."Gemeindeschluessel" AS ags,
        u."Inbetriebnahmedatum" AS added_on,
        CASE WHEN u."EinheitBetriebsstatus" = 'Endgültig stillgelegt'
            THEN GREATEST(u."DatumEndgueltigeStilllegung"::date, u."Inbetriebnahmedatum") END AS removed_on,
        s.amount,  -- kW
        CAST(NULL AS text) AS land
    FROM raw.solar_units u
    CROSS JOIN LATERAL (
        SELECT CASE WHEN u."ArtDerSolaranlage" = 'Freiflächensolaranlage' THEN 'solar_freiflaeche' ELSE 'solar_gebaeude' END AS art
    ) a
    CROSS JOIN LATERAL (VALUES
        ('solar', u."Bruttoleistung"),
        ('solar_netto', u."Nettonennleistung"),
        (a.art, u."Bruttoleistung"),
        (a.art || '_netto', u."Nettonennleistung")
    ) AS s(technology, amount)
    WHERE u."Inbetriebnahmedatum" IS NOT NULL

    UNION ALL
    -- The Balkonkraftwerke (steckerfertige Solaranlagen, 2961) on their own, Nettonennleistung: in solar_gebaeude too,
    -- like everywhere on the site; the page Überblick takes them out of it
    SELECT
        'solar_balkon_netto',
        "Gemeindeschluessel",
        "Inbetriebnahmedatum",
        CASE WHEN "EinheitBetriebsstatus" = 'Endgültig stillgelegt'
            THEN GREATEST("DatumEndgueltigeStilllegung"::date, "Inbetriebnahmedatum") END,
        "Nettonennleistung",
        NULL
    FROM raw.solar_units
    WHERE "Inbetriebnahmedatum" IS NOT NULL AND "ArtDerSolaranlage" = 'Steckerfertige Solaranlage (sog. Balkonkraftwerk)'

    UNION ALL
    SELECT
        CASE "WindAnLandOderAufSee" WHEN 'Windkraft auf See' THEN 'wind_auf_see' ELSE 'wind_an_land' END,
        "Gemeindeschluessel",
        "Inbetriebnahmedatum",
        CASE WHEN "EinheitBetriebsstatus" = 'Endgültig stillgelegt'
            THEN GREATEST("DatumEndgueltigeStilllegung"::date, "Inbetriebnahmedatum") END,
        "Bruttoleistung",
        NULL
    FROM raw.wind_units
    WHERE "Inbetriebnahmedatum" IS NOT NULL

    UNION ALL
    -- Hydropower in Germany: without the border plants in Austria and Switzerland, like the map
    SELECT
        'wasserkraft',
        "Gemeindeschluessel",
        "Inbetriebnahmedatum",
        CASE WHEN "EinheitBetriebsstatus" = 'Endgültig stillgelegt'
            THEN GREATEST("DatumEndgueltigeStilllegung"::date, "Inbetriebnahmedatum") END,
        "Bruttoleistung",
        NULL
    FROM raw.water_units
    WHERE "Inbetriebnahmedatum" IS NOT NULL AND "Land" = 'Deutschland'

    UNION ALL
    -- Batteries by the size classes of battery-charts.de, each unit twice: its share of the plant's capacity and its
    -- power; only with a plausible capacity (more than 0.3 kWh and 0.3 kW, full in 6 minutes to 12 hours)
    SELECT
        s.technology,
        u."Gemeindeschluessel",
        u."Inbetriebnahmedatum",
        CASE WHEN u."EinheitBetriebsstatus" = 'Endgültig stillgelegt'
            THEN GREATEST(u."DatumEndgueltigeStilllegung"::date, u."Inbetriebnahmedatum") END,
        s.amount,
        NULL
    FROM raw.storage_units u
    JOIN battery_plants b USING ("SpeMastrNummer")
    CROSS JOIN LATERAL (
        SELECT CASE
            WHEN b.capacity < 30 AND b.power < 30 THEN 'heimspeicher'
            WHEN b.capacity >= 1000 OR b.power >= 1000 THEN 'grossspeicher'
            ELSE 'gewerbespeicher'
        END AS size_class
    ) c
    CROSS JOIN LATERAL (VALUES
        (c.size_class, b.capacity * u."Bruttoleistung" / b.power),  -- kWh
        (c.size_class || '_leistung', u."Bruttoleistung")  -- kW
    ) AS s(technology, amount)
    WHERE u."Technologie" = 'Batterie'
      AND u."Inbetriebnahmedatum" IS NOT NULL
      AND b.capacity > 0.3
      AND b.power > 0.3
      AND b.capacity / b.power BETWEEN 0.1 AND 12

    UNION ALL
    -- Biomass: all of it, and per Biomasseart (the parts of the page Überblick)
    SELECT
        s.technology,
        u."Gemeindeschluessel",
        u."Inbetriebnahmedatum",
        CASE WHEN u."EinheitBetriebsstatus" = 'Endgültig stillgelegt'
            THEN GREATEST(u."DatumEndgueltigeStilllegung"::date, u."Inbetriebnahmedatum") END,
        u."Bruttoleistung",
        CASE WHEN u."Gemeindeschluessel" IS NULL THEN l.land END
    FROM raw.biomass_units u
    LEFT JOIN laender l ON l.name = u."Bundesland"
    CROSS JOIN LATERAL (VALUES
        ('biomasse'),
        (CASE u."Biomasseart"
            WHEN 'Gasförmige Biomasse' THEN 'biomasse_gasfoermig'
            WHEN 'Feste Biomasse' THEN 'biomasse_fest'
            WHEN 'Flüssige Biomasse' THEN 'biomasse_fluessig'
        END)
    ) AS s(technology)
    WHERE u."Inbetriebnahmedatum" IS NOT NULL AND u."Land" = 'Deutschland' AND s.technology IS NOT NULL

    UNION ALL
    -- Geothermie, Grubengas, Klärschlamm, Druckentspannung and Solarthermie: all of them, and each one
    SELECT
        s.technology,
        u."Gemeindeschluessel",
        u."Inbetriebnahmedatum",
        CASE WHEN u."EinheitBetriebsstatus" = 'Endgültig stillgelegt'
            THEN GREATEST(u."DatumEndgueltigeStilllegung"::date, u."Inbetriebnahmedatum") END,
        u."Bruttoleistung",
        CASE WHEN u."Gemeindeschluessel" IS NULL THEN l.land END
    FROM raw.geothermal_units u
    LEFT JOIN laender l ON l.name = u."Bundesland"
    CROSS JOIN LATERAL (VALUES
        ('geothermie_grubengas'),
        (CASE u."Energietraeger"
            WHEN 'Geothermie' THEN 'geothermie'
            WHEN 'Grubengas' THEN 'grubengas'
            WHEN 'Klärschlamm' THEN 'klaerschlamm'
            WHEN 'Druck aus Gasleitungen' THEN 'druckentspannung'
            WHEN 'Druck aus Wasserleitungen' THEN 'druckentspannung'
            WHEN 'Solarthermie' THEN 'solarthermie'
        END)
    ) AS s(technology)
    WHERE u."Inbetriebnahmedatum" IS NOT NULL AND u."Land" = 'Deutschland' AND s.technology IS NOT NULL

    UNION ALL
    -- KWK plants, their electrical power: all of them, and per Energieträger of their largest unit, in its place. A
    -- plant shut down for good leaves with its last unit.
    SELECT
        s.technology,
        k.ags,
        p."Inbetriebnahmedatum",
        CASE WHEN p."AnlageBetriebsstatus" = 'Endgültig stillgelegt'
            THEN GREATEST(k.removed_on, p."Inbetriebnahmedatum") END,
        p."ElektrischeKwkLeistung",
        k.land
    FROM raw.kwk_plants p
    JOIN kwk_places k ON k.kwk = p."KwkMastrNummer"
    CROSS JOIN LATERAL (VALUES ('kwk'), (k.art)) AS s(technology)
    WHERE p."Inbetriebnahmedatum" IS NOT NULL

    UNION ALL
    -- The other storages, each unit twice like the batteries: its share of the plant's capacity, as registered, and its
    -- power
    SELECT
        s.technology,
        u."Gemeindeschluessel",
        u."Inbetriebnahmedatum",
        CASE WHEN u."EinheitBetriebsstatus" = 'Endgültig stillgelegt'
            THEN GREATEST(u."DatumEndgueltigeStilllegung"::date, u."Inbetriebnahmedatum") END,
        s.amount,
        CASE WHEN u."Gemeindeschluessel" IS NULL THEN l.land END
    FROM raw.storage_units u
    LEFT JOIN other_storage_plants o USING ("SpeMastrNummer")
    LEFT JOIN laender l ON l.name = u."Bundesland"
    CROSS JOIN LATERAL (
        SELECT CASE u."Technologie"
            WHEN 'Druckluft' THEN 'druckluftspeicher'
            WHEN 'Schwungrad' THEN 'schwungradspeicher'
            WHEN 'Wasserstoffspeicher' THEN 'wasserstoffspeicher'
        END AS series
    ) c
    CROSS JOIN LATERAL (VALUES
        (c.series, COALESCE(o.capacity * u."Bruttoleistung" / NULLIF(o.power, 0), 0)),  -- kWh
        (c.series || '_leistung', u."Bruttoleistung")  -- kW
    ) AS s(technology, amount)
    WHERE u."Technologie" IN ('Druckluft', 'Schwungrad', 'Wasserstoffspeicher')
      AND u."Inbetriebnahmedatum" IS NOT NULL
),
monthly AS (
    -- 2. Per series, region and month: the units that came (count and amount) and the net change, minus what left (in
    --    amount and units). Deutschland, the Länder and the Kreise in one pass.
    SELECT
        u.technology,
        CASE
            WHEN GROUPING(LEFT(u.ags, 5)) = 0 THEN LEFT(u.ags, 5)
            WHEN GROUPING(COALESCE(LEFT(u.ags, 2), u.land)) = 0 THEN COALESCE(LEFT(u.ags, 2), u.land)
            ELSE 'DE'
        END AS region,
        date_trunc('month', c.day)::date AS month_start,
        sum(c.units) AS added_units,
        sum(c.added) AS added,
        sum(c.net) AS net,
        sum(c.net_units) AS net_units
    FROM units u
    CROSS JOIN LATERAL (VALUES
        (u.added_on, 1, u.amount, u.amount, 1),
        (u.removed_on, 0, 0, -u.amount, -1)
    ) AS c(day, units, added, net, net_units)
    WHERE c.day IS NOT NULL
    GROUP BY GROUPING SETS (
        (u.technology, date_trunc('month', c.day)),
        (u.technology, date_trunc('month', c.day), COALESCE(LEFT(u.ags, 2), u.land)),
        (u.technology, date_trunc('month', c.day), LEFT(u.ags, 5))
    )
),
periods AS (
    -- Every series in every region where it has units: from its first month to the latest commissioning anywhere
    SELECT technology, region, min(month_start) AS first_month
    FROM monthly
    WHERE region IS NOT NULL
    GROUP BY technology, region
),
latest AS (
    SELECT max(month_start) FILTER (WHERE added_units > 0) AS last_month FROM monthly WHERE region = 'DE'
),
series AS (
    -- 3. Every month, also without changes; the Bestand is the running total of the net changes, in amount and units
    SELECT
        p.technology,
        p.region,
        m.month_start,
        CAST(EXTRACT(YEAR FROM m.month_start) AS INTEGER) AS year,
        CAST(EXTRACT(MONTH FROM m.month_start) AS INTEGER) AS month,
        COALESCE(c.added_units, 0) AS added_units,
        COALESCE(c.added, 0) AS added,
        COALESCE(sum(c.net) OVER w, 0) AS installed,
        COALESCE(sum(c.net_units) OVER w, 0) AS installed_units
    FROM periods p
    CROSS JOIN latest l
    CROSS JOIN LATERAL (
        SELECT CAST(g AS date) AS month_start
        FROM generate_series(CAST(p.first_month AS timestamp), CAST(l.last_month AS timestamp), interval '1 month') g
    ) m
    LEFT JOIN monthly c ON c.technology = p.technology AND c.region = p.region AND c.month_start = m.month_start
    WINDOW w AS (PARTITION BY p.technology, p.region ORDER BY m.month_start)
)
-- 4. Months, and with ROLLUP their years (month NULL). A period's Bestand is the one at the end of its last month.
SELECT
    region COLLATE "C" AS region,
    technology,
    year,
    month,
    CASE WHEN technology LIKE '%speicher' THEN 'MWh' ELSE 'MW' END AS unit,  -- '..._leistung': MW
    CAST(SUM(added_units) AS INTEGER) AS added_units,
    CAST(SUM(added) / 1000 AS NUMERIC(12,3)) AS added,
    CAST((array_agg(installed ORDER BY month_start DESC))[1] / 1000 AS NUMERIC(12,3)) AS installed,
    CAST((array_agg(installed_units ORDER BY month_start DESC))[1] AS INTEGER) AS installed_units
FROM series
WHERE year >= 2000
GROUP BY region, technology, year, ROLLUP (month)
ORDER BY region, technology, year, month NULLS FIRST;

-- One region's series per request: read in the order of the table
CREATE INDEX ON mrt.zubau_zeitverlauf_regions (region, technology, year, month);
