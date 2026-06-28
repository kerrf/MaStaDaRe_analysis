CREATE SCHEMA IF NOT EXISTS mrt;

DROP MATERIALIZED VIEW IF EXISTS mrt.plz2_density_area;

CREATE MATERIALIZED VIEW mrt.plz2_density_area AS
WITH solar_agg AS (
    SELECT
        LEFT(LPAD("Postleitzahl"::text, 5, '0'), 2) AS plz_region,
        COUNT("EinheitMastrNummer") as count_pv,
        SUM("Bruttoleistung") as aggr_power
    FROM raw.solar_units
    GROUP BY GROUP BY LEFT(LPAD("Postleitzahl"::text, 5, '0'), 2)
),
geo_agg AS (
    SELECT
        plz AS plz_region,
        ST_Union(geoemtry) AS geom,
        SUM(ST_Area(geometry::geography)) / 1000000.0 AS area_sqkm
    FROM geo.plz_shapes_2
    GROUP BY plz
)

SELECT
    g.plz_region,
    COALESCE(s.count_pv, 0) AS count_pv,
    COALESCE(s.aggr_leistung, 0) AS aggr_leistung,
    e.einwohner,
    g.area_sqkm,
    
    -- Calculate Densities (NULLIF prevents division by zero errors)
    (COALESCE(s.count_pv, 0) / NULLIF(g.area_sqkm, 0)) AS dichte_pv_km2,
    (COALESCE(s.aggr_leistung, 0) / NULLIF(g.area_sqkm, 0)) AS dichte_leistung_area,
    (COALESCE(s.aggr_leistung, 0) / NULLIF(e.einwohner, 0)) AS dichte_leistung_population,
    
    g.geom -- The spatial column
FROM geo_agg g
    LEFT JOIN solar_agg s ON USING (plz_region)
    LEFT JOIN raw.plz_einwohner e ON g.plz_region = e.plz::text;

CREATE UNIQUE INDEX idx_mrt_plz2_region ON mrt.plz2_density_shape (plz_region);
CREATE INDEX indx_mrt_plz2_geom ON mrt.plz2_density_shape USING GIST (geom);