CREATE SCHEMA IF NOT EXISTS mrt;

DROP MATERIALIZED VIEW IF EXISTS mrt.karte_zeit;

-- The map in time (routers/karte.py): per technology, kind and area what came, what left and what stood, for any year
-- or month, and what is planned. Areas: the Gemeinde (8-digit key; the API sums them to Kreis and Land by their prefix),
-- the Land (2 digits) for the plants published with their Land only (biomass, geothermal, KWK, the other storages,
-- like their region views), the sea ('offshore') for offshore wind. Rows, by kennzahl:
--   zubau, stilllegung  what went into operation and what was shut down for good, per month (month 1–12) and per year
--                       (month NULL); sparse, only where something happened
--   bestand             what stood at the end of a year (month NULL): every year from an area's first unit to the
--                       last year, the running total of Zubau minus Stilllegung (also the units vorübergehend
--                       stillgelegt: they are still there); the Bestand at the end of a month is the one of the year
--                       before plus that year's months up to it (the API)
--   geplant             the units in planning (year and month NULL)
-- Measures in kW and kWh: power (Bruttoleistung; KWK: electrical), power_net (solar: Nettonennleistung), capacity
-- (batteries: only a plausible one, like their map; the other storages as registered), heat (KWK: thermal, only where
-- plausible, like their map). Units: KWK counts plants. The rules of the kinds and places are those of the region views
-- (aggregate_*_by_region_power.sql), the dates those of the Zubau (aggregate_zubau_zeitverlauf_regions.sql).
CREATE MATERIALIZED VIEW mrt.karte_zeit AS
WITH laender (name, land) AS (
    -- The Länder of the units (Bundesland, as the MaStR writes them) by their key, for the units without a Gemeinde
    VALUES ('Brandenburg', '12'), ('Berlin', '11'), ('Baden-Württemberg', '08'), ('Bayern', '09'), ('Bremen', '04'),
        ('Hessen', '06'), ('Hamburg', '02'), ('Mecklenburg-Vorpommern', '13'), ('Niedersachsen', '03'),
        ('Nordrhein-Westfalen', '05'), ('Rheinland-Pfalz', '07'), ('Schleswig-Holstein', '01'), ('Saarland', '10'),
        ('Sachsen', '14'), ('Sachsen-Anhalt', '15'), ('Thüringen', '16')
),
biomasse_arten (mastr, art) AS (
    VALUES ('Gasförmige Biomasse', 'gasfoermig'), ('Feste Biomasse', 'fest'), ('Flüssige Biomasse', 'fluessig')
),
geothermie_arten (mastr, art) AS (
    VALUES ('Geothermie', 'geothermie'), ('Grubengas', 'grubengas'), ('Klärschlamm', 'klaerschlamm'),
        ('Druck aus Gasleitungen', 'druckentspannung'), ('Druck aus Wasserleitungen', 'druckentspannung'),
        ('Solarthermie', 'solarthermie')
),
speicher_arten (mastr, art) AS (
    VALUES ('Druckluft', 'druckluft'), ('Schwungrad', 'schwungrad'), ('Wasserstoffspeicher', 'wasserstoff')
),
kwk_units AS (
    -- The units that name a KWK plant, with their Energieträger and when they were shut down for good
    SELECT "KwkMaStRNummer" AS kwk, "Gemeindeschluessel" AS ags, "Bundesland" AS bundesland, "Bruttoleistung" AS kw,
        'biomasse' AS art, CAST("DatumEndgueltigeStilllegung" AS date) AS removed_on
    FROM raw.biomass_units
    WHERE "KwkMaStRNummer" IS NOT NULL
    UNION ALL
    SELECT "KwkMaStRNummer", "Gemeindeschluessel", "Bundesland", "Bruttoleistung",
        CASE
            WHEN "Energietraeger" IN ('Erdgas', 'andere Gase', 'Wasserstoff') THEN 'erdgas'
            WHEN "Energietraeger" IN ('Steinkohle', 'Braunkohle') THEN 'kohle'
            ELSE 'sonstige'
        END,
        CAST("DatumEndgueltigeStilllegung" AS date)
    FROM raw.combustion_units
    WHERE "KwkMaStRNummer" IS NOT NULL
    UNION ALL
    SELECT "KwkMaStRNummer", "Gemeindeschluessel", "Bundesland", "Bruttoleistung", 'sonstige',
        CAST("DatumEndgueltigeStilllegung" AS date)
    FROM raw.geothermal_units
    WHERE "KwkMaStRNummer" IS NOT NULL
),
kwk_places AS (
    -- Per KWK plant its largest unit: its place (a Gemeinde, else its Land) and Energieträger; the plant leaves with its
    -- last unit
    SELECT DISTINCT ON (u.kwk) u.kwk, COALESCE(u.ags, l.land) AS area, u.art,
        max(u.removed_on) OVER (PARTITION BY u.kwk) AS removed_on
    FROM kwk_units u
    LEFT JOIN laender l ON l.name = u.bundesland
    ORDER BY u.kwk, u.kw DESC NULLS LAST, u.ags
),
battery_plants AS (
    -- The usable capacity (kWh) is registered per storage plant (AnlagenStromSpeicher), the power (kW) per unit
    SELECT u."SpeMastrNummer", max(p."NutzbareSpeicherkapazitaet") AS capacity, sum(u."Bruttoleistung") AS power
    FROM raw.storage_units u
    JOIN raw.storage_plants p ON p."MaStRNummer" = u."SpeMastrNummer"
    WHERE u."Technologie" = 'Batterie'
    GROUP BY u."SpeMastrNummer"
),
other_storage_plants AS (
    SELECT u."SpeMastrNummer", max(p."NutzbareSpeicherkapazitaet") AS capacity, sum(u."Bruttoleistung") AS power
    FROM raw.storage_units u
    JOIN raw.storage_plants p ON p."MaStRNummer" = u."SpeMastrNummer"
    WHERE u."Technologie" IN ('Druckluft', 'Schwungrad', 'Wasserstoffspeicher')
    GROUP BY u."SpeMastrNummer"
),
units AS (
    -- 1. Every unit (KWK: plant) with its kind, area, status, the day it came and the day it left for good, and its
    --    measures
    SELECT 'solar' AS technology,
        CASE WHEN "ArtDerSolaranlage" = 'Freiflächensolaranlage' THEN 'freiflaeche' ELSE 'gebaeude' END AS art,
        "Gemeindeschluessel" AS area, "EinheitBetriebsstatus" AS status, "Inbetriebnahmedatum" AS added_on,
        CAST("DatumEndgueltigeStilllegung" AS date) AS removed_on,
        "Bruttoleistung" AS power, "Nettonennleistung" AS power_net,
        CAST(NULL AS float8) AS capacity, CAST(NULL AS float8) AS heat
    FROM raw.solar_units

    UNION ALL
    SELECT 'wind',
        CASE WHEN "WindAnLandOderAufSee" = 'Windkraft auf See' THEN 'auf_see' ELSE 'an_land' END,
        CASE WHEN "WindAnLandOderAufSee" = 'Windkraft auf See' THEN 'offshore' ELSE "Gemeindeschluessel" END,
        "EinheitBetriebsstatus", "Inbetriebnahmedatum", CAST("DatumEndgueltigeStilllegung" AS date),
        "Bruttoleistung", NULL, NULL, NULL
    FROM raw.wind_units

    UNION ALL
    SELECT 'water', 'alle', "Gemeindeschluessel", "EinheitBetriebsstatus", "Inbetriebnahmedatum",
        CAST("DatumEndgueltigeStilllegung" AS date), "Bruttoleistung", NULL, NULL, NULL
    FROM raw.water_units

    UNION ALL
    SELECT 'biomass', a.art, COALESCE(u."Gemeindeschluessel", l.land), u."EinheitBetriebsstatus",
        u."Inbetriebnahmedatum", CAST(u."DatumEndgueltigeStilllegung" AS date), u."Bruttoleistung", NULL, NULL, NULL
    FROM raw.biomass_units u
    JOIN biomasse_arten a ON a.mastr = u."Biomasseart"
    LEFT JOIN laender l ON l.name = u."Bundesland"

    UNION ALL
    SELECT 'geothermal', a.art, COALESCE(u."Gemeindeschluessel", l.land), u."EinheitBetriebsstatus",
        u."Inbetriebnahmedatum", CAST(u."DatumEndgueltigeStilllegung" AS date), u."Bruttoleistung", NULL, NULL, NULL
    FROM raw.geothermal_units u
    JOIN geothermie_arten a ON a.mastr = u."Energietraeger"
    LEFT JOIN laender l ON l.name = u."Bundesland"

    UNION ALL
    SELECT 'kwk', k.art, k.area, p."AnlageBetriebsstatus", p."Inbetriebnahmedatum", k.removed_on,
        p."ElektrischeKwkLeistung", NULL, NULL,
        CASE WHEN p."ThermischeNutzleistung" <= 50 * p."ElektrischeKwkLeistung" THEN p."ThermischeNutzleistung" END
    FROM raw.kwk_plants p
    JOIN kwk_places k ON k.kwk = p."KwkMastrNummer"

    UNION ALL
    -- Batteries: the plant's capacity split between its units by their power, where it is plausible (full in 6 minutes
    -- to 12 hours)
    SELECT 'battery', 'alle', u."Gemeindeschluessel", u."EinheitBetriebsstatus", u."Inbetriebnahmedatum",
        CAST(u."DatumEndgueltigeStilllegung" AS date), u."Bruttoleistung", NULL,
        CASE WHEN b.capacity > 0.3 AND b.power > 0.3 AND b.capacity / b.power BETWEEN 0.1 AND 12
            THEN b.capacity * u."Bruttoleistung" / b.power END,
        NULL
    FROM raw.storage_units u
    LEFT JOIN battery_plants b USING ("SpeMastrNummer")
    WHERE u."Technologie" = 'Batterie'

    UNION ALL
    -- The other storages: their capacity as registered, split between the units by their power
    SELECT 'other_storage', a.art, COALESCE(u."Gemeindeschluessel", l.land), u."EinheitBetriebsstatus",
        u."Inbetriebnahmedatum", CAST(u."DatumEndgueltigeStilllegung" AS date), u."Bruttoleistung", NULL,
        b.capacity * u."Bruttoleistung" / NULLIF(b.power, 0), NULL
    FROM raw.storage_units u
    JOIN speicher_arten a ON a.mastr = u."Technologie"
    LEFT JOIN other_storage_plants b USING ("SpeMastrNummer")
    LEFT JOIN laender l ON l.name = u."Bundesland"
    WHERE u."Technologie" IN ('Druckluft', 'Schwungrad', 'Wasserstoffspeicher')
),
events AS (
    -- 2. Per unit what happened when, in one pass: it came (a unit in operation, not one in planning), it left for good
    --    (never before it came: a date before counts as the day it came), it is planned (no day)
    SELECT u.technology, u.art, u.area, e.kennzahl, e.day, u.power, u.power_net, u.capacity, u.heat
    FROM units u
    CROSS JOIN LATERAL (VALUES
        ('zubau', u.added_on, u.status <> 'In Planung' AND u.added_on IS NOT NULL),
        ('stilllegung', GREATEST(u.removed_on, u.added_on), u.status = 'Endgültig stillgelegt' AND u.added_on IS NOT NULL),
        ('geplant', NULL, u.status = 'In Planung')
    ) AS e(kennzahl, day, happened)
    WHERE e.happened AND u.area IS NOT NULL
),
monthly AS (
    -- Per kind, area and month (planned: none)
    SELECT technology, art, area, kennzahl, CAST(date_trunc('month', day) AS date) AS month_start,
        count(*) AS units, sum(power) AS power, sum(power_net) AS power_net, sum(capacity) AS capacity, sum(heat) AS heat
    FROM events
    GROUP BY 1, 2, 3, 4, 5
),
yearly AS (
    SELECT technology, art, area, kennzahl, CAST(date_trunc('year', month_start) AS date) AS year_start,
        sum(units) AS units, sum(power) AS power, sum(power_net) AS power_net, sum(capacity) AS capacity,
        sum(heat) AS heat
    FROM monthly
    WHERE kennzahl <> 'geplant'
    GROUP BY 1, 2, 3, 4, 5
),
net AS (
    -- 3. The Bestand at the end of each year with a change: the running total of what came minus what left, like
    --    aggregate_zubau_zeitverlauf_regions.sql, and until when it holds (the year before the next change)
    SELECT technology, art, area, year_start,
        lead(year_start) OVER s AS next_start,
        sum(units) OVER w AS units, sum(power) OVER w AS power, sum(power_net) OVER w AS power_net,
        sum(capacity) OVER w AS capacity, sum(heat) OVER w AS heat
    FROM (
        SELECT technology, art, area, year_start,
            sum(CASE kennzahl WHEN 'zubau' THEN units ELSE -units END) AS units,
            sum(CASE kennzahl WHEN 'zubau' THEN power ELSE -power END) AS power,
            sum(CASE kennzahl WHEN 'zubau' THEN power_net ELSE -power_net END) AS power_net,
            sum(CASE kennzahl WHEN 'zubau' THEN capacity ELSE -capacity END) AS capacity,
            sum(CASE kennzahl WHEN 'zubau' THEN heat ELSE -heat END) AS heat
        FROM yearly
        GROUP BY 1, 2, 3, 4
    ) c
    WINDOW s AS (PARTITION BY technology, art, area ORDER BY year_start),
        w AS (PARTITION BY technology, art, area ORDER BY year_start ROWS UNBOUNDED PRECEDING)
),
last_year AS (
    -- The last year anything came, at most this one (a few dates in the register lie in the future)
    SELECT LEAST(max(year_start), CAST(date_trunc('year', CURRENT_DATE) AS date)) AS year_start
    FROM yearly WHERE kennzahl = 'zubau'
)
-- 4. All in one table: the months and years of the Zubau and the Stilllegungen, what is planned, and the Bestand of
--    every year, each change's held until the next (no join: each row spread over its years); only where something
--    stood
SELECT technology, art, area COLLATE "C" AS area, kennzahl,
    CAST(EXTRACT(YEAR FROM month_start) AS integer) AS year, CAST(EXTRACT(MONTH FROM month_start) AS integer) AS month,
    CAST(units AS integer) AS units, power, power_net, capacity, heat
FROM monthly
UNION ALL
SELECT technology, art, area, kennzahl, CAST(EXTRACT(YEAR FROM year_start) AS integer), NULL, CAST(units AS integer),
    power, power_net, capacity, heat
FROM yearly
UNION ALL
SELECT n.technology, n.art, n.area, 'bestand', CAST(y AS integer), NULL, CAST(n.units AS integer), n.power, n.power_net,
    n.capacity, n.heat
FROM net n
CROSS JOIN last_year l
CROSS JOIN LATERAL generate_series(
    CAST(EXTRACT(YEAR FROM n.year_start) AS integer),
    CAST(EXTRACT(YEAR FROM COALESCE(n.next_start - 1, l.year_start)) AS integer)
) AS y
WHERE n.units > 0;

-- One technology's Kennzahl in one year (or month), every area
CREATE INDEX ON mrt.karte_zeit (technology, kennzahl, year, month);
