CREATE SCHEMA IF NOT EXISTS mrt;

DROP MATERIALIZED VIEW IF EXISTS mrt.solar_region_stats;

-- One row per Anlagenart and region: the API sums the Anlagenarten chosen on the dashboard. Both rows of a region carry
-- its whole area and population, so the values per km² and per inhabitant add up as well.
--   gebaeude:    Gebäude-, sonstige und steckerfertige Solaranlagen (853, 2484, 2961) and those without an Art
--   freiflaeche: Freiflächensolaranlagen (852)
-- Power as Brutto (DC, Bruttoleistung: the modules' peak) and Netto (AC, Nettonennleistung: at most the inverter's).
CREATE MATERIALIZED VIEW mrt.solar_region_stats AS
WITH gemeinde_solar_agg AS (
    -- 1. Pre-aggregate to 1 row per Gemeinde and Anlagenart to prevent JOIN explosions
    SELECT
        "Gemeindeschluessel" AS ags,
        CASE WHEN "ArtDerSolaranlage" = '852' THEN 'freiflaeche' ELSE 'gebaeude' END AS anlagenart,
        COUNT("EinheitMastrNummer") AS total_units,
        SUM("Bruttoleistung") AS total_power,
        SUM("Nettonennleistung") AS total_power_net,
        -- Zubau: in operation since less than 12 months
        SUM("Bruttoleistung") FILTER (WHERE "Inbetriebnahmedatum" > CURRENT_DATE - INTERVAL '12 months') AS added_12m_power,
        SUM("Nettonennleistung") FILTER (WHERE "Inbetriebnahmedatum" > CURRENT_DATE - INTERVAL '12 months') AS added_12m_power_net
    FROM raw.solar_units
    WHERE "EinheitBetriebsstatus" = '35'  -- InBetrieb: installed, without planned or decommissioned units
      AND "Gemeindeschluessel" IS NOT NULL
    GROUP BY 1, 2
),
joined AS (
    -- 2. Join the 1-to-1 data. FULL JOIN: every Gemeinde brings its area and population to both Anlagenarten, also
    --    without units, and units whose Gemeinde was merged after the geodata (unknown key) still count for Landkreis and
    --    Bundesland.
    SELECT
        COALESCE(g.ags, s.ags) AS ags,
        COALESCE(g.anlagenart, s.anlagenart) AS anlagenart,
        s.total_units,
        s.total_power,
        s.total_power_net,
        s.added_12m_power,
        s.added_12m_power_net,
        g.qkm,
        g.einwohner
    FROM (
        SELECT ags, qkm, einwohner, anlagenart
        FROM geo.gemeinden
        CROSS JOIN (VALUES ('gebaeude'), ('freiflaeche')) AS arten (anlagenart)
    ) g
    FULL JOIN gemeinde_solar_agg s ON s.ags = g.ags AND s.anlagenart = g.anlagenart
)
-- 3. Run the ROLLUP per Anlagenart: Bundesland (first 2 digits of the key) > Landkreis (5) > Gemeinde (8)
SELECT
    anlagenart,
    LEFT(ags, 2) AS bundesland,
    LEFT(ags, 5) AS landkreis,
    ags AS gemeinde,
    COALESCE(SUM(total_units), 0) AS total_units,
    CAST(COALESCE(SUM(total_power), 0) / 1000 AS NUMERIC(12,2)) AS total_power,
    CAST(COALESCE(SUM(total_power_net), 0) / 1000 AS NUMERIC(12,2)) AS total_power_net,
    CAST(COALESCE(SUM(total_power), 0) / NULLIF(SUM(qkm), 0) AS NUMERIC(10,1)) AS relative_area_power,
    CAST(COALESCE(SUM(total_power_net), 0) / NULLIF(SUM(qkm), 0) AS NUMERIC(10,1)) AS relative_area_power_net,
    CAST(COALESCE(SUM(total_power), 0) / NULLIF(SUM(einwohner), 0) AS NUMERIC(10,2)) AS relative_population_power,
    CAST(COALESCE(SUM(total_power_net), 0) / NULLIF(SUM(einwohner), 0) AS NUMERIC(10,2)) AS relative_population_power_net,
    CAST(COALESCE(SUM(added_12m_power), 0) / 1000 AS NUMERIC(12,2)) AS added_12m_power,
    CAST(COALESCE(SUM(added_12m_power_net), 0) / 1000 AS NUMERIC(12,2)) AS added_12m_power_net
FROM joined
GROUP BY anlagenart, ROLLUP (
    LEFT(ags, 2),
    LEFT(ags, 5),
    ags
);
