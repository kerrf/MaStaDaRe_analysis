CREATE SCHEMA IF NOT EXISTS mrt;

DROP MATERIALIZED VIEW IF EXISTS mrt.netz_zubau_regions;

-- Zubau und Registrierungen der Netzanschlüsse (the page Zubau & Registrierungen of the Netzanschlüsse) for Deutschland
-- ('DE'), every Bundesland (2-digit key) and Landkreis (5 digits), per Spannungsebene (as on the map, see
-- aggregate_netzanschluesse.sql), per month and, with month NULL, per year since 2000. The Netzanschlusspunkte have no
-- dates of their own in the register (neither do their Lokationen): their dates are those of the units at their
-- Lokation, every kind of generating unit. Three series per Spannungsebene, in the shape of mrt.zubau_zeitverlauf_regions:
--   netz_<ebene>               the connected power (MW): each unit's when it went into operation, minus when it was shut
--                              down for good; a Lokation with several points splits it evenly among them, like the map
--   netz_<ebene>_punkte        the points: one comes with the first unit of its Lokation, goes with the last
--   netz_<ebene>_registriert   the points registered: with the first unit of its Lokation registered (any status)
-- added: in the period (MW, or points); installed: up to its end. A point counts in the Land and Kreis of its Lokation
-- (the Gemeinde of its units, else the Land they name); offshore and those without a place for Deutschland only.
CREATE MATERIALIZED VIEW mrt.netz_zubau_regions AS
WITH laender (name, land) AS (
    -- The Länder of the units (Bundesland, as the MaStR writes them) by their key, for the units without a Gemeinde
    VALUES ('Brandenburg', '12'), ('Berlin', '11'), ('Baden-Württemberg', '08'), ('Bayern', '09'), ('Bremen', '04'),
        ('Hessen', '06'), ('Hamburg', '02'), ('Mecklenburg-Vorpommern', '13'), ('Niedersachsen', '03'),
        ('Nordrhein-Westfalen', '05'), ('Rheinland-Pfalz', '07'), ('Schleswig-Holstein', '01'), ('Saarland', '10'),
        ('Sachsen', '14'), ('Sachsen-Anhalt', '15'), ('Thüringen', '16')
),
units AS NOT MATERIALIZED (
    -- Every unit with a Lokation: its place, status, dates and power (kW, Nettonennleistung, else Bruttoleistung).
    -- Read twice, straight from the tables (per Lokation, and per unit).
    SELECT "LokationMaStRNummer" AS lok, "Gemeindeschluessel" AS ags, "Bundesland" AS bundesland,
        "EinheitBetriebsstatus" AS status, "Inbetriebnahmedatum" AS added_on,
        CAST("DatumEndgueltigeStilllegung" AS date) AS removed_on, "Registrierungsdatum" AS registered_on,
        COALESCE("Nettonennleistung", "Bruttoleistung") AS kw
    FROM raw.solar_units
    UNION ALL
    SELECT "LokationMaStRNummer", CASE WHEN "WindAnLandOderAufSee" = 'Windkraft auf See' THEN 'offshore' ELSE "Gemeindeschluessel" END,
        "Bundesland", "EinheitBetriebsstatus", "Inbetriebnahmedatum", CAST("DatumEndgueltigeStilllegung" AS date),
        "Registrierungsdatum", COALESCE("Nettonennleistung", "Bruttoleistung")
    FROM raw.wind_units
    UNION ALL
    SELECT "LokationMaStRNummer", "Gemeindeschluessel", "Bundesland", "EinheitBetriebsstatus", "Inbetriebnahmedatum",
        CAST("DatumEndgueltigeStilllegung" AS date), "Registrierungsdatum", COALESCE("Nettonennleistung", "Bruttoleistung")
    FROM raw.water_units
    UNION ALL
    SELECT "LokationMaStRNummer", "Gemeindeschluessel", "Bundesland", "EinheitBetriebsstatus", "Inbetriebnahmedatum",
        CAST("DatumEndgueltigeStilllegung" AS date), "Registrierungsdatum", COALESCE("Nettonennleistung", "Bruttoleistung")
    FROM raw.storage_units
    UNION ALL
    SELECT "LokationMaStRNummer", "Gemeindeschluessel", "Bundesland", "EinheitBetriebsstatus", "Inbetriebnahmedatum",
        CAST("DatumEndgueltigeStilllegung" AS date), "Registrierungsdatum", COALESCE("Nettonennleistung", "Bruttoleistung")
    FROM raw.biomass_units
    UNION ALL
    SELECT "LokationMaStRNummer", "Gemeindeschluessel", "Bundesland", "EinheitBetriebsstatus", "Inbetriebnahmedatum",
        CAST("DatumEndgueltigeStilllegung" AS date), "Registrierungsdatum", COALESCE("Nettonennleistung", "Bruttoleistung")
    FROM raw.combustion_units
    UNION ALL
    SELECT "LokationMaStRNummer", "Gemeindeschluessel", "Bundesland", "EinheitBetriebsstatus", "Inbetriebnahmedatum",
        CAST("DatumEndgueltigeStilllegung" AS date), "Registrierungsdatum", COALESCE("Nettonennleistung", "Bruttoleistung")
    FROM raw.nuclear_units
    UNION ALL
    SELECT "LokationMaStRNummer", "Gemeindeschluessel", "Bundesland", "EinheitBetriebsstatus", "Inbetriebnahmedatum",
        CAST("DatumEndgueltigeStilllegung" AS date), "Registrierungsdatum", COALESCE("Nettonennleistung", "Bruttoleistung")
    FROM raw.geothermal_units
),
lokationen AS (
    -- Per Lokation: its place (Gemeinde, else Land; the sea), its first unit in operation, its first unit registered,
    -- and when its last unit was shut down for good (none while one is not)
    SELECT
        u.lok,
        CASE WHEN min(u.ags) = 'offshore' THEN NULL ELSE COALESCE(LEFT(min(u.ags), 2), min(l.land)) END AS land,
        CASE WHEN min(u.ags) = 'offshore' THEN NULL ELSE LEFT(min(u.ags), 5) END AS kreis,
        min(u.added_on) FILTER (WHERE u.status <> 'In Planung') AS first_on,
        min(u.registered_on) AS first_registered,
        CASE WHEN bool_and(u.status = 'Endgültig stillgelegt') FILTER (WHERE u.status <> 'In Planung')
            THEN max(GREATEST(u.removed_on, u.added_on)) END AS gone_on
    FROM units u
    LEFT JOIN laender l ON l.name = u.bundesland
    WHERE u.lok IS NOT NULL
    GROUP BY u.lok
),
punkte AS (
    -- The points of the Stromerzeugungslokationen: their Spannungsebene, their Lokation's place and dates, and how
    -- many points their Lokation has
    SELECT
        p."LokationMaStRNummer" AS lok,
        CASE
            WHEN p."Spannungsebene" IN ('Höchstspannung', 'Umspannebene Höchstspannung/Hochspannung') THEN 'hoechstspannung'
            WHEN p."Spannungsebene" IN ('Hochspannung', 'Umspannebene Hochspannung/Mittelspannung') THEN 'hochspannung'
            WHEN p."Spannungsebene" IN ('Mittelspannung', 'Umspannebene Mittelspannung/Niederspannung') THEN 'mittelspannung'
            WHEN p."Spannungsebene" = 'Niederspannung (= Hausanschluss/Haushaltsstrom)' THEN 'niederspannung'
        END AS ebene,
        count(*) OVER (PARTITION BY p."LokationMaStRNummer") AS n,
        l.land, l.kreis, l.first_on, l.first_registered, l.gone_on
    FROM raw.grid_connection_points p
    JOIN lokationen l ON l.lok = p."LokationMaStRNummer"
    WHERE p."Lokationtyp" = 'Stromerzeugungslokation'
),
by_place AS (
    -- 1. What happened when, summed at once per Spannungsebene, place (Kreis, or Land for those with their Land only,
    --    none for the sea and those without a place) and month: the power of every unit, its share at each point of its
    --    Lokation (in and out); the points (in and out) and their registration. Before 2000 all in December 1999: the
    --    Bestand of 2000 starts from it.
    SELECT ebene, what, land, kreis, GREATEST(CAST(date_trunc('month', day) AS date), DATE '1999-12-01') AS month_start,
        sum(amount) AS amount
    FROM (
        SELECT p.ebene, 'leistung' AS what, p.land, p.kreis, e.day, e.sign * u.kw / p.n AS amount
        FROM units u
        JOIN punkte p ON p.lok = u.lok
        CROSS JOIN LATERAL (VALUES
            (u.added_on, 1, u.status <> 'In Planung' AND u.added_on IS NOT NULL),
            (GREATEST(u.removed_on, u.added_on), -1, u.status = 'Endgültig stillgelegt' AND u.added_on IS NOT NULL)
        ) AS e(day, sign, happened)
        WHERE e.happened AND p.ebene IS NOT NULL
        UNION ALL
        SELECT p.ebene, e.what, p.land, p.kreis, e.day, e.sign
        FROM punkte p
        CROSS JOIN LATERAL (VALUES
            ('punkte', p.first_on, 1),
            ('punkte', p.gone_on, -1),
            ('registriert', p.first_registered, 1)
        ) AS e(what, day, sign)
        WHERE e.day IS NOT NULL AND p.ebene IS NOT NULL
    ) e
    GROUP BY 1, 2, 3, 4, 5
),
monthly AS (
    -- 2. Per series, region and month: the Kreise, the Länder and Deutschland from the places
    SELECT
        'netz_' || ebene || CASE what WHEN 'leistung' THEN '' ELSE '_' || what END AS technology,
        CASE WHEN GROUPING(kreis) = 0 THEN kreis WHEN GROUPING(land) = 0 THEN land ELSE 'DE' END AS region,
        month_start,
        sum(amount) AS amount
    FROM by_place
    GROUP BY GROUPING SETS (
        (ebene, what, month_start),
        (ebene, what, month_start, land),
        (ebene, what, month_start, kreis)
    )
),
latest AS (
    -- The latest month a point came anywhere, at most this one (a few dates in the register lie in the future)
    SELECT LEAST(max(month_start), CAST(date_trunc('month', CURRENT_DATE) AS date)) AS last_month
    FROM monthly WHERE region = 'DE' AND technology LIKE '%\_punkte'
),
series AS (
    -- 3. Every month from a series' first one in a region, also without changes; the Bestand as the running total
    SELECT
        p.technology,
        p.region,
        m.month_start,
        COALESCE(c.amount, 0) AS added,
        COALESCE(sum(c.amount) OVER w, 0) AS installed
    FROM (SELECT technology, region, min(month_start) AS first_month FROM monthly WHERE region IS NOT NULL GROUP BY 1, 2) p
    CROSS JOIN latest l
    CROSS JOIN LATERAL generate_series(CAST(p.first_month AS timestamp), CAST(l.last_month AS timestamp), interval '1 month') AS g
    CROSS JOIN LATERAL (SELECT CAST(g AS date) AS month_start) m
    LEFT JOIN monthly c ON c.technology = p.technology AND c.region = p.region AND c.month_start = m.month_start
    WINDOW w AS (PARTITION BY p.technology, p.region ORDER BY m.month_start)
)
-- 4. Months, and with ROLLUP their years (month NULL); a period's Bestand is the one at the end of its last month.
--    Power in MW; the points (and registrations) as counts, in added_units and installed_units too.
SELECT
    region COLLATE "C" AS region,
    technology,
    CAST(EXTRACT(YEAR FROM month_start) AS integer) AS year,
    CAST(EXTRACT(MONTH FROM month_start) AS integer) AS month,
    CASE WHEN technology ~ '_(punkte|registriert)$' THEN 'Punkte' ELSE 'MW' END AS unit,
    CAST(CASE WHEN technology ~ '_(punkte|registriert)$' THEN sum(added) END AS integer) AS added_units,
    CAST(sum(added) / CASE WHEN technology ~ '_(punkte|registriert)$' THEN 1 ELSE 1000 END AS NUMERIC(14,3)) AS added,
    CAST((array_agg(installed ORDER BY month_start DESC))[1] / CASE WHEN technology ~ '_(punkte|registriert)$' THEN 1 ELSE 1000 END
        AS NUMERIC(14,3)) AS installed,
    CAST(CASE WHEN technology ~ '_(punkte|registriert)$' THEN (array_agg(installed ORDER BY month_start DESC))[1] END AS integer)
        AS installed_units
FROM series
WHERE month_start >= DATE '2000-01-01'
GROUP BY region, technology, CAST(EXTRACT(YEAR FROM month_start) AS integer), ROLLUP (CAST(EXTRACT(MONTH FROM month_start) AS integer));

-- One region's series per request
CREATE INDEX ON mrt.netz_zubau_regions (region, technology, year, month);
