CREATE SCHEMA IF NOT EXISTS mrt;

DROP MATERIALIZED VIEW IF EXISTS mrt.heatmap_points;

-- Where the power of solar, wind and battery units in operation lies, as points for the continuous map (heatmap): the
-- website spreads each point's power with a Gaussian kernel of its own width (sigma_km) plus a smoothing of its own.
--   site: units with coordinates, summed per cell of about 1 km (0.015° × 0.01°) at their power-weighted centre. The
--         register publishes the coordinates of units above 30 kW: most of the solar power, almost all wind turbines,
--         the large batteries. sigma_km 0.35: about the size of a solar park, or of the cell.
--   area: the units without coordinates (the small ones: roofs, home batteries), summed per postcode (PLZ 5) at its
--         centre, spread over the postcode: sigma_km 0.35 * sqrt(km²), from 0.4 to 8 km – a little wider than a disc of
--         its area (0.28 * sqrt), as the villages of a large postcode lie apart.
-- A coordinate counts only if it lies near the unit's postcode (within 3 * sqrt(km²) + 5 km of its centre): the few
-- hundred others, typos and swapped digits mostly, count at their postcode instead. Offshore wind has no postcode and
-- counts where it stands. Units with neither (no PLZ of the boundaries) are left out: about 0.2 GW.
-- One row per technology, Anlagenart (solar: gebaeude/freiflaeche, wind: an_land/auf_see, batteries: alle) and point
-- (the cell's column * 100000 + its row, or the postcode as a number);
-- the API sums the Anlagenarten chosen. Power in kW: Brutto, and Netto for solar; batteries also their usable capacity
-- (kWh) where it is plausible, like mrt.battery_region_stats.
CREATE MATERIALIZED VIEW mrt.heatmap_points AS
WITH postcodes AS (
    -- The centre of a postcode: its centroid, or a point inside it where the centroid lies outside (rings, crescents)
    SELECT
        plz,
        qkm,
        CASE WHEN ST_Contains(geometry, ST_Centroid(geometry)) THEN ST_Centroid(geometry) ELSE ST_PointOnSurface(geometry) END AS centre
    FROM geo.plz_shapes_5
),
plz AS (
    SELECT plz, qkm, ST_X(centre) AS lon, ST_Y(centre) AS lat, LEAST(GREATEST(0.35 * sqrt(qkm), 0.4), 8) AS sigma_km
    FROM postcodes
),
battery_plants AS (
    -- The usable capacity (kWh) is registered per storage plant (AnlagenStromSpeicher), the power (kW) per unit
    SELECT u."SpeMastrNummer", max(p."NutzbareSpeicherkapazitaet") AS capacity, sum(u."Bruttoleistung") AS power
    FROM raw.storage_units u
    JOIN raw.storage_plants p ON p."MaStRNummer" = u."SpeMastrNummer"
    WHERE u."Technologie" = '524'
    GROUP BY u."SpeMastrNummer"
),
units AS (
    -- Every unit in operation (InBetrieb): where it is, its power (Brutto, Netto) and capacity
    SELECT
        'solar' AS technology,
        CASE WHEN "ArtDerSolaranlage" = '852' THEN 'freiflaeche' ELSE 'gebaeude' END AS anlagenart,
        "Laengengrad" AS x,
        "Breitengrad" AS y,
        "Postleitzahl" AS plz,
        "Bruttoleistung" AS power,
        "Nettonennleistung" AS power_net,
        NULL::float8 AS capacity
    FROM raw.solar_units
    WHERE "EinheitBetriebsstatus" = '35'
    UNION ALL
    SELECT
        'wind',
        CASE WHEN "WindAnLandOderAufSee" = '889' THEN 'auf_see' ELSE 'an_land' END,
        "Laengengrad",
        "Breitengrad",
        "Postleitzahl",
        "Bruttoleistung",
        "Nettonennleistung",
        NULL
    FROM raw.wind_units
    WHERE "EinheitBetriebsstatus" = '35'
    UNION ALL
    SELECT
        'batterie',
        'alle',
        u."Laengengrad",
        u."Breitengrad",
        u."Postleitzahl",
        u."Bruttoleistung",
        u."Nettonennleistung",
        -- The plant's capacity, split between its units by their power, where plausible (battery-charts.de: more than
        -- 0.3 kWh and 0.3 kW, full in 6 minutes to 12 hours)
        CASE WHEN b.capacity > 0.3 AND b.power > 0.3 AND b.capacity / b.power BETWEEN 0.1 AND 12
            THEN b.capacity * u."Bruttoleistung" / b.power END
    FROM raw.storage_units u
    LEFT JOIN battery_plants b USING ("SpeMastrNummer")
    WHERE u."Technologie" = '524'  -- Batterie
      AND u."EinheitBetriebsstatus" = '35'
),
located AS (
    -- At its coordinates (site) or its postcode (area)
    SELECT
        u.*,
        p.lon AS plz_lon,
        p.lat AS plz_lat,
        p.sigma_km,
        COALESCE(u.x BETWEEN 5.5 AND 15.5 AND u.y BETWEEN 47 AND 55.5 AND (
            u.anlagenart = 'auf_see'
            OR p.plz IS NULL
            -- km on the ground: a degree of latitude is 111.2 km, one of longitude that times the cosine of the latitude
            OR 111.2 * sqrt(((u.x - p.lon) * cos(radians(u.y))) ^ 2 + (u.y - p.lat) ^ 2) <= 3 * sqrt(p.qkm) + 5
        ), false) AS exact
    FROM units u
    LEFT JOIN plz p ON p.plz = u.plz
),
sites AS (
    SELECT
        technology,
        anlagenart,
        'site' AS kind,
        -- The cell, about 1 km × 1 km in Germany: its column and row in one number
        floor(x / 0.015)::bigint * 100000 + floor(y / 0.01)::bigint AS point,
        -- Its power-weighted centre: a single large plant keeps its own location
        COALESCE(sum(x * power) / NULLIF(sum(power), 0), avg(x)) AS lon,
        COALESCE(sum(y * power) / NULLIF(sum(power), 0), avg(y)) AS lat,
        0.35 AS sigma_km,
        count(*) AS units,
        sum(power) AS power,
        sum(power_net) AS power_net,
        sum(capacity) AS capacity
    FROM located
    WHERE exact
    GROUP BY technology, anlagenart, 4
),
areas AS (
    SELECT
        technology,
        anlagenart,
        'area' AS kind,
        plz::bigint AS point,
        min(plz_lon) AS lon,
        min(plz_lat) AS lat,
        min(sigma_km) AS sigma_km,
        count(*) AS units,
        sum(power) AS power,
        sum(power_net) AS power_net,
        sum(capacity) AS capacity
    FROM located
    WHERE NOT exact AND plz_lon IS NOT NULL
    GROUP BY technology, anlagenart, plz
)
SELECT
    technology,
    anlagenart,
    kind,
    point,
    -- Floating point, not NUMERIC: the API sums them per point for every request
    round(lon::numeric, 5)::float8 AS lon,
    round(lat::numeric, 5)::float8 AS lat,
    round(sigma_km::numeric, 2)::float8 AS sigma_km,
    CAST(units AS INTEGER) AS units,
    COALESCE(power, 0)::float8 AS power,  -- kW, Brutto
    COALESCE(power_net, 0)::float8 AS power_net,  -- kW, Netto
    COALESCE(capacity, 0)::float8 AS capacity  -- kWh, batteries
FROM (SELECT * FROM sites UNION ALL SELECT * FROM areas) AS points
ORDER BY technology, kind, point, anlagenart;

-- One technology per request, its Anlagenarten summed per point: read in this order, the sum needs no sorting
CREATE UNIQUE INDEX ON mrt.heatmap_points (technology, kind, point, anlagenart);
