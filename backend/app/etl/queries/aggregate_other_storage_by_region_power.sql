CREATE SCHEMA IF NOT EXISTS mrt;

DROP MATERIALIZED VIEW IF EXISTS mrt.other_storage_region_stats;

-- The storage units that are neither batteries nor pumped storage, in operation per Bundesland, Landkreis and Gemeinde,
-- like aggregate_bat_by_region_power.sql, one row per Technologie: druckluft (Druckluftspeicher), schwungrad
-- (Schwungradspeicher), wasserstoff (Wasserstoffspeicher: hydrogen made with power and turned back into it, mostly home
-- systems); the API sums the chosen ones. Their capacity as registered on the Speicheranlage, split between its units by
-- their power: no plausibility check like the batteries', a hydrogen storage holds power for weeks. Units published
-- with their Land only (the Druckluftspeicher Huntorf) count for the Land.
CREATE MATERIALIZED VIEW mrt.other_storage_region_stats AS
WITH arten (mastr, art) AS (
    -- The register's Technologie of storage units (codes.KATALOG: StromspeicherOhneWasserkraft)
    VALUES ('Druckluft', 'druckluft'), ('Schwungrad', 'schwungrad'), ('Wasserstoffspeicher', 'wasserstoff')
),
laender (name, land) AS (
    -- The Länder of the units (Bundesland, as the MaStR writes them) by their key, for the units without a Gemeinde
    VALUES ('Brandenburg', '12'), ('Berlin', '11'), ('Baden-Württemberg', '08'), ('Bayern', '09'), ('Bremen', '04'),
        ('Hessen', '06'), ('Hamburg', '02'), ('Mecklenburg-Vorpommern', '13'), ('Niedersachsen', '03'),
        ('Nordrhein-Westfalen', '05'), ('Rheinland-Pfalz', '07'), ('Schleswig-Holstein', '01'), ('Saarland', '10'),
        ('Sachsen', '14'), ('Sachsen-Anhalt', '15'), ('Thüringen', '16')
),
plants AS (
    -- The usable capacity (kWh) is registered per storage plant (AnlagenStromSpeicher), the power (kW) per unit
    SELECT u."SpeMastrNummer", max(p."NutzbareSpeicherkapazitaet") AS capacity, sum(u."Bruttoleistung") AS power
    FROM raw.storage_units u
    JOIN raw.storage_plants p ON p."MaStRNummer" = u."SpeMastrNummer"
    JOIN arten a ON a.mastr = u."Technologie"
    GROUP BY u."SpeMastrNummer"
),
gemeinde_agg AS (
    -- 1. Pre-aggregate to 1 row per Gemeinde (or Land, for the units without one) and Technologie
    SELECT
        u."Gemeindeschluessel" AS ags,
        CASE WHEN u."Gemeindeschluessel" IS NULL THEN l.land END AS land,
        a.art,
        count(*) AS total_units,
        sum(u."Bruttoleistung") AS total_power,
        sum(s.capacity * u."Bruttoleistung" / NULLIF(s.power, 0)) AS total_capacity,
        sum(u."Bruttoleistung") FILTER (WHERE u."Inbetriebnahmedatum" > CURRENT_DATE - INTERVAL '12 months') AS added_12m_power,
        sum(s.capacity * u."Bruttoleistung" / NULLIF(s.power, 0)) FILTER (
            WHERE u."Inbetriebnahmedatum" > CURRENT_DATE - INTERVAL '12 months'
        ) AS added_12m_capacity
    FROM raw.storage_units u
    JOIN arten a ON a.mastr = u."Technologie"
    LEFT JOIN plants s USING ("SpeMastrNummer")
    LEFT JOIN laender l ON l.name = u."Bundesland"
    WHERE u."EinheitBetriebsstatus" = 'In Betrieb'  -- installed, without planned or decommissioned units
      AND (u."Gemeindeschluessel" IS NOT NULL OR l.land IS NOT NULL)
    GROUP BY 1, 2, 3
),
joined AS (
    -- 2. Every Gemeinde with every Technologie: its area and population also without units. FULL JOIN: units whose
    --    Gemeinde was merged after the geodata (unknown key) still count for Landkreis and Bundesland, those without one
    --    for their Land.
    SELECT
        COALESCE(g.ags, b.ags) AS ags,
        b.land,
        COALESCE(g.art, b.art) AS art,
        b.total_units,
        b.total_power,
        b.total_capacity,
        b.added_12m_power,
        b.added_12m_capacity,
        g.qkm,
        g.einwohner
    FROM (SELECT ags, qkm, einwohner, art FROM geo.gemeinden CROSS JOIN arten) g
    FULL JOIN gemeinde_agg b ON b.ags = g.ags AND b.art = g.art
),
regions AS (
    SELECT art, COALESCE(LEFT(ags, 2), land) AS bundesland, LEFT(ags, 5) AS landkreis, ags AS gemeinde, total_units,
        total_power, total_capacity, added_12m_power, added_12m_capacity, qkm, einwohner
    FROM joined
)
-- 3. Run the ROLLUP per Technologie: Bundesland (first 2 digits of the key) > Landkreis (5) > Gemeinde (8)
SELECT
    art,
    bundesland,
    landkreis,
    gemeinde,
    COALESCE(SUM(total_units), 0) AS total_units,
    CAST(COALESCE(SUM(total_power), 0) / 1000 AS NUMERIC(12,3)) AS total_power,  -- MW
    CAST(COALESCE(SUM(total_power), 0) / NULLIF(SUM(qkm), 0) AS NUMERIC(10,3)) AS relative_area_power,  -- kW per km²
    CAST(COALESCE(SUM(total_power), 0) / NULLIF(SUM(einwohner), 0) AS NUMERIC(12,5)) AS relative_population_power,  -- kW
    CAST(COALESCE(SUM(total_capacity), 0) / 1000 AS NUMERIC(12,3)) AS total_capacity,  -- MWh
    CAST(COALESCE(SUM(total_capacity), 0) / NULLIF(SUM(qkm), 0) AS NUMERIC(10,3)) AS relative_area_capacity,  -- kWh/km²
    CAST(COALESCE(SUM(total_capacity), 0) / NULLIF(SUM(einwohner), 0) AS NUMERIC(12,5)) AS relative_population_capacity,
    CAST(COALESCE(SUM(added_12m_power), 0) / 1000 AS NUMERIC(12,3)) AS added_12m_power,  -- MW
    CAST(COALESCE(SUM(added_12m_capacity), 0) / 1000 AS NUMERIC(12,3)) AS added_12m_capacity  -- MWh
FROM regions
GROUP BY art, ROLLUP (bundesland, landkreis, gemeinde)
-- The units of a Land without a Gemeinde are in the Land's row only, not in a Landkreis or Gemeinde row of their own
HAVING NOT (GROUPING(landkreis) = 0 AND landkreis IS NULL) AND NOT (GROUPING(gemeinde) = 0 AND gemeinde IS NULL);
