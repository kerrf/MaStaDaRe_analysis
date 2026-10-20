CREATE SCHEMA IF NOT EXISTS mrt;

DROP MATERIALIZED VIEW IF EXISTS mrt.netz_region_stats;
DROP MATERIALIZED VIEW IF EXISTS mrt.netz_anschluesse;

-- Netzanschlüsse der Stromerzeugung: the Netzanschlusspunkte of the Stromerzeugungslokationen (raw.grid_connection_points,
-- Lokationtyp Stromerzeugungslokation, from the bulk export), each in the place of its Lokation's units (every kind of
-- generating unit). The largest power plants are published with their Land only (no Gemeindeschlüssel, postcode or
-- coordinates): their points count for the Land, not for a Kreis or Gemeinde. A point is in operation while a unit of its
-- Lokation is (EinheitBetriebsstatus "In Betrieb"); its power is that of those units (Nettonennleistung, else
-- Bruttoleistung), a Lokation with several points splits it evenly among them. In planning: a point "noch in Planung"
-- without a unit in operation. New: its first unit in operation for less than 12 months.
-- Spannungsebenen, as Netzebenen 1–7 and grouped with the transformation below each voltage:
--   hoechstspannung: Höchstspannung (Netzebene 1) and Umspannebene Höchstspannung/Hochspannung (2)
--   hochspannung:    Hochspannung (3) and Umspannebene Hochspannung/Mittelspannung (4)
--   mittelspannung:  Mittelspannung (5) and Umspannebene Mittelspannung/Niederspannung (6)
--   niederspannung:  Niederspannung (= Hausanschluss/Haushaltsstrom) (7)

-- The map: one row per Spannungsebene and region, like the Anlagenarten of solar (the API sums the ones chosen). Every
-- row carries its region's whole area and population, so the values per km² and per inhabitant add up as well. Offshore
-- (wind at sea) is a region of its own on every level.
CREATE MATERIALIZED VIEW mrt.netz_region_stats AS
WITH laender (name, land) AS (
    -- The Länder of the units (Bundesland, as the MaStR writes them) by their key, for the units without a Gemeinde
    VALUES ('Brandenburg', '12'), ('Berlin', '11'), ('Baden-Württemberg', '08'), ('Bayern', '09'), ('Bremen', '04'),
        ('Hessen', '06'), ('Hamburg', '02'), ('Mecklenburg-Vorpommern', '13'), ('Niedersachsen', '03'),
        ('Nordrhein-Westfalen', '05'), ('Rheinland-Pfalz', '07'), ('Schleswig-Holstein', '01'), ('Saarland', '10'),
        ('Sachsen', '14'), ('Sachsen-Anhalt', '15'), ('Thüringen', '16')
),
units AS (
    SELECT "LokationMaStRNummer" AS lok, "Gemeindeschluessel" AS ags, "Bundesland" AS bundesland,
        "EinheitBetriebsstatus" AS status, "Inbetriebnahmedatum" AS seit, COALESCE("Nettonennleistung", "Bruttoleistung") AS kw
    FROM raw.solar_units
    UNION ALL
    SELECT "LokationMaStRNummer", CASE WHEN "WindAnLandOderAufSee" = 'Windkraft auf See' THEN 'offshore' ELSE "Gemeindeschluessel" END,
        "Bundesland", "EinheitBetriebsstatus", "Inbetriebnahmedatum", COALESCE("Nettonennleistung", "Bruttoleistung")
    FROM raw.wind_units
    UNION ALL
    SELECT "LokationMaStRNummer", "Gemeindeschluessel", "Bundesland", "EinheitBetriebsstatus", "Inbetriebnahmedatum",
        COALESCE("Nettonennleistung", "Bruttoleistung")
    FROM raw.water_units
    UNION ALL
    SELECT "LokationMaStRNummer", "Gemeindeschluessel", "Bundesland", "EinheitBetriebsstatus", "Inbetriebnahmedatum",
        COALESCE("Nettonennleistung", "Bruttoleistung")
    FROM raw.storage_units
    UNION ALL
    SELECT "LokationMaStRNummer", "Gemeindeschluessel", "Bundesland", "EinheitBetriebsstatus", "Inbetriebnahmedatum",
        COALESCE("Nettonennleistung", "Bruttoleistung")
    FROM raw.biomass_units
    UNION ALL
    SELECT "LokationMaStRNummer", "Gemeindeschluessel", "Bundesland", "EinheitBetriebsstatus", "Inbetriebnahmedatum",
        COALESCE("Nettonennleistung", "Bruttoleistung")
    FROM raw.combustion_units
    UNION ALL
    SELECT "LokationMaStRNummer", "Gemeindeschluessel", "Bundesland", "EinheitBetriebsstatus", "Inbetriebnahmedatum",
        COALESCE("Nettonennleistung", "Bruttoleistung")
    FROM raw.nuclear_units
    UNION ALL
    SELECT "LokationMaStRNummer", "Gemeindeschluessel", "Bundesland", "EinheitBetriebsstatus", "Inbetriebnahmedatum",
        COALESCE("Nettonennleistung", "Bruttoleistung")
    FROM raw.geothermal_units
),
lokationen AS (
    -- Per Lokation: its place (Gemeinde, else Land), the power in operation (kW) and since when
    SELECT
        u.lok,
        min(u.ags) AS ags,
        min(laender.land) AS land,
        sum(u.kw) FILTER (WHERE u.status = 'In Betrieb') AS kw,
        min(u.seit) FILTER (WHERE u.status = 'In Betrieb') AS seit,
        COALESCE(bool_or(u.status = 'In Betrieb'), false) AS in_betrieb
    FROM units u
    LEFT JOIN laender ON laender.name = u.bundesland
    WHERE u.lok IS NOT NULL
    GROUP BY u.lok
),
punkte AS (
    SELECT
        l.ags,
        COALESCE(LEFT(l.ags, 2), l.land) AS land,
        CASE
            WHEN p."Spannungsebene" IN ('Höchstspannung', 'Umspannebene Höchstspannung/Hochspannung') THEN 'hoechstspannung'
            WHEN p."Spannungsebene" IN ('Hochspannung', 'Umspannebene Hochspannung/Mittelspannung') THEN 'hochspannung'
            WHEN p."Spannungsebene" IN ('Mittelspannung', 'Umspannebene Mittelspannung/Niederspannung') THEN 'mittelspannung'
            WHEN p."Spannungsebene" = 'Niederspannung (= Hausanschluss/Haushaltsstrom)' THEN 'niederspannung'
        END AS ebene,
        l.in_betrieb,
        l.kw / count(*) OVER (PARTITION BY p."LokationMaStRNummer") AS kw,
        l.seit,
        p."NochInPlanung" = '1' AS geplant
    FROM raw.grid_connection_points p
    JOIN lokationen l ON l.lok = p."LokationMaStRNummer"
    WHERE p."Lokationtyp" = 'Stromerzeugungslokation' AND (l.ags IS NOT NULL OR l.land IS NOT NULL)
),
gemeinde_netz_agg AS (
    -- 1. Pre-aggregate to 1 row per Gemeinde (or the sea, or a Land for the points without a Gemeinde) and Spannungsebene
    SELECT
        ags,
        land,
        ebene,
        count(*) FILTER (WHERE in_betrieb) AS total_units,
        sum(kw) FILTER (WHERE in_betrieb) AS total_power,
        count(*) FILTER (WHERE in_betrieb AND seit > CURRENT_DATE - INTERVAL '12 months') AS added_12m_units,
        sum(kw) FILTER (WHERE in_betrieb AND seit > CURRENT_DATE - INTERVAL '12 months') AS added_12m_power,
        count(*) FILTER (WHERE NOT in_betrieb AND geplant) AS planned_units
    FROM punkte
    WHERE ebene IS NOT NULL
    GROUP BY 1, 2, 3
),
joined AS (
    -- 2. Every Gemeinde and the sea with every Spannungsebene: its area and population also without points. FULL JOIN:
    --    points in a Gemeinde merged after the geodata (unknown key) still count for Landkreis and Bundesland.
    SELECT
        COALESCE(g.ags, n.ags) AS ags,
        n.land,
        COALESCE(g.ebene, n.ebene) AS ebene,
        n.total_units,
        n.total_power,
        n.added_12m_units,
        n.added_12m_power,
        n.planned_units,
        g.qkm,
        g.einwohner
    FROM (
        SELECT ags, qkm, einwohner, ebene
        FROM (
            SELECT ags, qkm, einwohner FROM geo.gemeinden
            UNION ALL
            SELECT 'offshore', qkm, NULL FROM geo.offshore
        ) areas
        CROSS JOIN (VALUES ('hoechstspannung'), ('hochspannung'), ('mittelspannung'), ('niederspannung')) AS ebenen (ebene)
    ) g
    FULL JOIN gemeinde_netz_agg n ON n.ags = g.ags AND n.ebene = g.ebene
),
regions AS (
    -- Without a Gemeinde: the Land, no Landkreis or Gemeinde (see the HAVING below)
    SELECT
        ebene,
        CASE WHEN ags = 'offshore' THEN ags ELSE COALESCE(LEFT(ags, 2), land) END AS bundesland,
        CASE WHEN ags = 'offshore' THEN ags ELSE LEFT(ags, 5) END AS landkreis,
        ags AS gemeinde,
        total_units,
        total_power,
        added_12m_units,
        added_12m_power,
        planned_units,
        qkm,
        einwohner
    FROM joined
)
-- 3. Run the ROLLUP per Spannungsebene: Bundesland (first 2 digits of the key) > Landkreis (5) > Gemeinde (8)
SELECT
    ebene,
    bundesland,
    landkreis,
    gemeinde,
    COALESCE(SUM(total_units), 0) AS total_units,
    CAST(COALESCE(SUM(total_power), 0) / 1000 AS NUMERIC(12,2)) AS total_power,  -- MW
    CAST(COALESCE(SUM(total_units), 0) / NULLIF(SUM(qkm), 0) AS NUMERIC(10,2)) AS relative_area_units,  -- per km²
    -- per 1,000 inhabitants
    CAST(COALESCE(SUM(total_units), 0) * 1000.0 / NULLIF(SUM(einwohner), 0) AS NUMERIC(10,1)) AS relative_population_units,
    CAST(COALESCE(SUM(total_power), 0) / NULLIF(SUM(qkm), 0) AS NUMERIC(10,1)) AS relative_area_power,  -- kW per km²
    CAST(COALESCE(SUM(total_power), 0) / NULLIF(SUM(einwohner), 0) AS NUMERIC(10,2)) AS relative_population_power,  -- kW
    COALESCE(SUM(added_12m_units), 0) AS added_12m_units,
    CAST(COALESCE(SUM(added_12m_power), 0) / 1000 AS NUMERIC(12,2)) AS added_12m_power,  -- MW
    COALESCE(SUM(planned_units), 0) AS planned_units
FROM regions
GROUP BY ebene, ROLLUP (
    bundesland,
    landkreis,
    gemeinde
)
-- The points of a Land without a Gemeinde are in the Land's row only, not in a Landkreis or Gemeinde row of their own
HAVING NOT (GROUPING(landkreis) = 0 AND landkreis IS NULL) AND NOT (GROUPING(gemeinde) = 0 AND gemeinde IS NULL);

-- The analyses (Spannungsebenen & Netzbetreiber): the points per Landkreis (or the sea; the Land's 2-digit key for those
-- without a Gemeinde; NULL: abroad, for Deutschland only), Netzebene (1–7, by its Spannungsebene) and grid operator, with its name and its grid (raw.grid_operators): the Übertragungsnetz of the operators with the market role
-- Übertragungsnetzbetreiber (UN: the four German ones, Baltic Cable), else the Verteilnetz – the regional ones, the
-- Stadtwerke, the closed grids of industrial parks and airports. The power of a point is that of all units of its
-- Lokation, in total and per technology (a point with solar and a battery counts for both). The API sums them for
-- Deutschland, a Land (its Kreise and itself, by prefix) or a Kreis.
CREATE MATERIALIZED VIEW mrt.netz_anschluesse AS
WITH laender (name, land) AS (
    -- The Länder of the units (Bundesland, as the MaStR writes them) by their key, for the units without a Gemeinde
    VALUES ('Brandenburg', '12'), ('Berlin', '11'), ('Baden-Württemberg', '08'), ('Bayern', '09'), ('Bremen', '04'),
        ('Hessen', '06'), ('Hamburg', '02'), ('Mecklenburg-Vorpommern', '13'), ('Niedersachsen', '03'),
        ('Nordrhein-Westfalen', '05'), ('Rheinland-Pfalz', '07'), ('Schleswig-Holstein', '01'), ('Saarland', '10'),
        ('Sachsen', '14'), ('Sachsen-Anhalt', '15'), ('Thüringen', '16')
),
units AS (
    SELECT "LokationMaStRNummer" AS lok, "Gemeindeschluessel" AS ags, "Bundesland" AS bundesland,
        "EinheitBetriebsstatus" AS status, COALESCE("Nettonennleistung", "Bruttoleistung") AS kw, 'solar' AS technologie
    FROM raw.solar_units
    UNION ALL
    SELECT "LokationMaStRNummer", CASE WHEN "WindAnLandOderAufSee" = 'Windkraft auf See' THEN 'offshore' ELSE "Gemeindeschluessel" END,
        "Bundesland", "EinheitBetriebsstatus", COALESCE("Nettonennleistung", "Bruttoleistung"), 'wind'
    FROM raw.wind_units
    UNION ALL
    SELECT "LokationMaStRNummer", "Gemeindeschluessel", "Bundesland", "EinheitBetriebsstatus",
        COALESCE("Nettonennleistung", "Bruttoleistung"), 'wasser'
    FROM raw.water_units
    UNION ALL
    SELECT "LokationMaStRNummer", "Gemeindeschluessel", "Bundesland", "EinheitBetriebsstatus",
        COALESCE("Nettonennleistung", "Bruttoleistung"), 'speicher'
    FROM raw.storage_units
    UNION ALL
    SELECT "LokationMaStRNummer", "Gemeindeschluessel", "Bundesland", "EinheitBetriebsstatus",
        COALESCE("Nettonennleistung", "Bruttoleistung"), 'biomasse'
    FROM raw.biomass_units
    UNION ALL
    -- Erdgas with the other gases and hydrogen, Stein- and Braunkohle; oil, waste, heat
    SELECT "LokationMaStRNummer", "Gemeindeschluessel", "Bundesland", "EinheitBetriebsstatus",
        COALESCE("Nettonennleistung", "Bruttoleistung"),
        CASE
            WHEN "Energietraeger" IN ('Erdgas', 'andere Gase', 'Wasserstoff') THEN 'erdgas'
            WHEN "Energietraeger" IN ('Steinkohle', 'Braunkohle') THEN 'kohle'
            ELSE 'sonstige'
        END
    FROM raw.combustion_units
    UNION ALL
    SELECT "LokationMaStRNummer", "Gemeindeschluessel", "Bundesland", "EinheitBetriebsstatus",
        COALESCE("Nettonennleistung", "Bruttoleistung"), 'sonstige'
    FROM raw.nuclear_units
    UNION ALL
    SELECT "LokationMaStRNummer", "Gemeindeschluessel", "Bundesland", "EinheitBetriebsstatus",
        COALESCE("Nettonennleistung", "Bruttoleistung"), 'sonstige'
    FROM raw.geothermal_units
),
per_technologie AS (
    SELECT u.lok, u.technologie, min(u.ags) AS ags, min(laender.land) AS land,
        sum(u.kw) FILTER (WHERE u.status = 'In Betrieb') AS kw, bool_or(u.status = 'In Betrieb') AS in_betrieb
    FROM units u
    LEFT JOIN laender ON laender.name = u.bundesland
    WHERE u.lok IS NOT NULL
    GROUP BY u.lok, u.technologie
),
lokationen AS (
    -- The power of a Lokation's units in operation, in total and per technology
    SELECT
        lok,
        min(ags) AS ags,
        min(land) AS land,
        COALESCE(bool_or(in_betrieb), false) AS in_betrieb,
        COALESCE(sum(kw), 0) AS kw,
        COALESCE(sum(kw) FILTER (WHERE technologie = 'solar'), 0) AS kw_solar,
        COALESCE(sum(kw) FILTER (WHERE technologie = 'wind'), 0) AS kw_wind,
        COALESCE(sum(kw) FILTER (WHERE technologie = 'wasser'), 0) AS kw_wasser,
        COALESCE(sum(kw) FILTER (WHERE technologie = 'speicher'), 0) AS kw_speicher,
        COALESCE(sum(kw) FILTER (WHERE technologie = 'biomasse'), 0) AS kw_biomasse,
        COALESCE(sum(kw) FILTER (WHERE technologie = 'erdgas'), 0) AS kw_erdgas,
        COALESCE(sum(kw) FILTER (WHERE technologie = 'kohle'), 0) AS kw_kohle,
        COALESCE(sum(kw) FILTER (WHERE technologie = 'sonstige'), 0) AS kw_sonstige
    FROM per_technologie
    GROUP BY lok
),
punkte AS (
    -- A Lokation with several points splits its power evenly among them
    SELECT
        CASE WHEN l.ags = 'offshore' THEN l.ags ELSE COALESCE(LEFT(l.ags, 5), l.land) END AS landkreis,
        CASE p."Spannungsebene"
            WHEN 'Höchstspannung' THEN 1
            WHEN 'Umspannebene Höchstspannung/Hochspannung' THEN 2
            WHEN 'Hochspannung' THEN 3
            WHEN 'Umspannebene Hochspannung/Mittelspannung' THEN 4
            WHEN 'Mittelspannung' THEN 5
            WHEN 'Umspannebene Mittelspannung/Niederspannung' THEN 6
            WHEN 'Niederspannung (= Hausanschluss/Haushaltsstrom)' THEN 7
        END AS netzebene,
        p."NetzbetreiberMaStRNummer" AS netzbetreiber,
        l.in_betrieb,
        p."NochInPlanung" = '1' AS geplant,
        count(*) OVER (PARTITION BY p."LokationMaStRNummer") AS n,
        l.kw, l.kw_solar, l.kw_wind, l.kw_wasser, l.kw_speicher, l.kw_biomasse, l.kw_erdgas, l.kw_kohle, l.kw_sonstige
    FROM raw.grid_connection_points p
    JOIN lokationen l ON l.lok = p."LokationMaStRNummer"
    WHERE p."Lokationtyp" = 'Stromerzeugungslokation' AND p."Spannungsebene" IS NOT NULL
)
SELECT
    p.landkreis COLLATE "C" AS landkreis,
    p.netzebene,
    p.netzbetreiber,
    o."Firmenname" AS netzbetreiber_name,
    CASE WHEN o."Marktrollen" ~ '[0-9]UN(,|$)' THEN 'uebertragungsnetz' ELSE 'verteilnetz' END AS netz,
    CAST(count(*) FILTER (WHERE p.in_betrieb) AS INTEGER) AS punkte,
    -- MW of the units in operation, in total and per technology
    CAST(COALESCE(sum(p.kw / p.n) FILTER (WHERE p.in_betrieb), 0) / 1000 AS NUMERIC(12,3)) AS leistung,
    CAST(COALESCE(sum(p.kw_solar / p.n) FILTER (WHERE p.in_betrieb), 0) / 1000 AS NUMERIC(12,3)) AS leistung_solar,
    CAST(COALESCE(sum(p.kw_wind / p.n) FILTER (WHERE p.in_betrieb), 0) / 1000 AS NUMERIC(12,3)) AS leistung_wind,
    CAST(COALESCE(sum(p.kw_wasser / p.n) FILTER (WHERE p.in_betrieb), 0) / 1000 AS NUMERIC(12,3)) AS leistung_wasser,
    CAST(COALESCE(sum(p.kw_speicher / p.n) FILTER (WHERE p.in_betrieb), 0) / 1000 AS NUMERIC(12,3)) AS leistung_speicher,
    CAST(COALESCE(sum(p.kw_biomasse / p.n) FILTER (WHERE p.in_betrieb), 0) / 1000 AS NUMERIC(12,3)) AS leistung_biomasse,
    CAST(COALESCE(sum(p.kw_erdgas / p.n) FILTER (WHERE p.in_betrieb), 0) / 1000 AS NUMERIC(12,3)) AS leistung_erdgas,
    CAST(COALESCE(sum(p.kw_kohle / p.n) FILTER (WHERE p.in_betrieb), 0) / 1000 AS NUMERIC(12,3)) AS leistung_kohle,
    CAST(COALESCE(sum(p.kw_sonstige / p.n) FILTER (WHERE p.in_betrieb), 0) / 1000 AS NUMERIC(12,3)) AS leistung_sonstige,
    CAST(count(*) FILTER (WHERE NOT p.in_betrieb AND p.geplant) AS INTEGER) AS geplant
FROM punkte p
LEFT JOIN raw.grid_operators o ON o."MastrNummer" = p.netzbetreiber
GROUP BY p.landkreis, p.netzebene, p.netzbetreiber, o."Firmenname", o."Marktrollen"
HAVING count(*) FILTER (WHERE p.in_betrieb OR p.geplant) > 0;

-- One scope per request: Deutschland (all rows), a Land (its Kreise by prefix) or a Kreis
CREATE INDEX ON mrt.netz_anschluesse (landkreis);
