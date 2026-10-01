CREATE SCHEMA IF NOT EXISTS mrt;

DROP MATERIALIZED VIEW IF EXISTS mrt.pv_speicher;
DROP MATERIALIZED VIEW IF EXISTS mrt.speicher_pv;

-- Solaranlagen und Batteriespeicher am selben Ort: units in operation in Germany that share their Lokation
-- (LokationMaStRNummer, the grid connection the register groups a site's units by). Germany-wide; every value adds up,
-- so the API and the page can sum any combination.

-- mrt.pv_speicher: the solar units per Anlagenart, size class and year of commissioning, how many of them have a battery
-- at their Lokation, and that battery's power and capacity, split between the Lokation's solar units by their power.
CREATE MATERIALIZED VIEW mrt.pv_speicher AS
WITH classes (size_class, above, up_to, label) AS (
    -- The solar size classes of aggregate_size_distribution.sql (kWp; the lower bound excluded, the upper included)
    VALUES
        (1, '-Infinity'::float8, 2::float8, 'bis 2 kWp'),
        (2, 2, 7, '2–7 kWp'),
        (3, 7, 12, '7–12 kWp'),
        (4, 12, 40, '12–40 kWp'),
        (5, 40, 100, '40–100 kWp'),
        (6, 100, 1000, '0,1–1 MWp'),
        (7, 1000, 10000, '1–10 MWp'),
        (8, 10000, 'Infinity', 'über 10 MWp')
),
battery_plants AS (
    -- Usable capacity (kWh, registered per storage plant) and power (kW, the sum of its units), like aggregate_zubau.sql
    SELECT u."SpeMastrNummer", max(p."NutzbareSpeicherkapazitaet") AS capacity, sum(u."Bruttoleistung") AS power
    FROM raw.storage_units u
    JOIN raw.storage_plants p ON p."MaStRNummer" = u."SpeMastrNummer"
    WHERE u."Technologie" = '524'  -- Batterie
    GROUP BY u."SpeMastrNummer"
),
batteries AS (
    -- The batteries in operation per Lokation: power (kW), usable capacity (kWh; plausible ones only, like
    -- battery-charts.de: full in 6 minutes to 12 hours) and when the first of them went into operation
    SELECT
        u."LokationMaStRNummer" AS lokation,
        sum(u."Bruttoleistung") AS power,
        sum(b.capacity * u."Bruttoleistung" / b.power) FILTER (
            WHERE b.capacity > 0.3 AND b.power > 0.3 AND b.capacity / b.power BETWEEN 0.1 AND 12
        ) AS capacity,
        min(u."Inbetriebnahmedatum") AS first_on
    FROM raw.storage_units u
    LEFT JOIN battery_plants b USING ("SpeMastrNummer")
    WHERE u."Technologie" = '524'
      AND u."EinheitBetriebsstatus" = '35'
      AND u."LokationMaStRNummer" IS NOT NULL
    GROUP BY 1
),
solar_at_batteries AS (
    -- The solar power (kW) of each Lokation with a battery: the battery is split between its solar units by it
    SELECT s."LokationMaStRNummer" AS lokation, sum(s."Bruttoleistung") AS power
    FROM raw.solar_units s
    JOIN batteries b ON b.lokation = s."LokationMaStRNummer"
    WHERE s."EinheitBetriebsstatus" = '35'
      AND s."Land" = '84'
    GROUP BY 1
),
pv AS (
    -- Solar units in operation in Germany, with their share of the battery at their Lokation (if any).
    -- Anlagenart as in aggregate_pv_by_region_power.sql.
    SELECT
        CASE WHEN s."ArtDerSolaranlage" = '852' THEN 'freiflaeche' ELSE 'gebaeude' END AS anlagenart,
        c.size_class,
        c.label AS size_label,
        CAST(EXTRACT(YEAR FROM s."Inbetriebnahmedatum") AS INTEGER) AS year,
        s."Bruttoleistung" AS power,
        s."Nettonennleistung" AS power_net,
        s."SpeicherAmGleichenOrt" = '1' AS flagged,  -- the operator's own statement: "a storage at the same place"
        b.lokation IS NOT NULL AS with_battery,
        b.first_on > s."Inbetriebnahmedatum" + 30 AS retrofit,  -- the battery came more than a month after the solar unit
        -- its share of the Lokation's battery
        b.power * s."Bruttoleistung" / NULLIF(a.power, 0) AS battery_power,
        b.capacity * s."Bruttoleistung" / NULLIF(a.power, 0) AS battery_capacity
    FROM raw.solar_units s
    JOIN classes c ON s."Bruttoleistung" > c.above AND s."Bruttoleistung" <= c.up_to
    LEFT JOIN batteries b ON b.lokation = s."LokationMaStRNummer"
    LEFT JOIN solar_at_batteries a ON a.lokation = s."LokationMaStRNummer"
    WHERE s."EinheitBetriebsstatus" = '35'
      AND s."Land" = '84'
)
SELECT
    pv.anlagenart,
    pv.size_class,
    pv.size_label,
    pv.year,
    count(*) AS pv_units,
    CAST(sum(pv.power) / 1000 AS NUMERIC(12,3)) AS pv_power,  -- MW
    CAST(sum(pv.power_net) / 1000 AS NUMERIC(12,3)) AS pv_power_net,
    count(*) FILTER (WHERE pv.with_battery) AS with_battery_units,
    CAST(COALESCE(sum(pv.power) FILTER (WHERE pv.with_battery), 0) / 1000 AS NUMERIC(12,3)) AS with_battery_power,
    CAST(COALESCE(sum(pv.power_net) FILTER (WHERE pv.with_battery), 0) / 1000 AS NUMERIC(12,3)) AS with_battery_power_net,
    CAST(COALESCE(sum(pv.battery_power), 0) / 1000 AS NUMERIC(12,3)) AS battery_power,  -- MW
    CAST(COALESCE(sum(pv.battery_capacity), 0) / 1000 AS NUMERIC(12,3)) AS battery_capacity,  -- MWh
    count(*) FILTER (WHERE pv.retrofit) AS retrofit_units,
    count(*) FILTER (WHERE pv.flagged) AS flagged_units,
    count(*) FILTER (WHERE pv.flagged AND pv.with_battery) AS flagged_with_battery_units
FROM pv
GROUP BY pv.anlagenart, pv.size_class, pv.size_label, pv.year;

-- One Anlagenart, size class and year per row
CREATE UNIQUE INDEX ON mrt.pv_speicher (anlagenart, size_class, year);


-- mrt.speicher_pv: the batteries in operation in Germany per size class, with or without a solar unit in operation at
-- their Lokation. Size classes of battery-charts.de like aggregate_zubau.sql, by the plant's capacity and power; plants
-- without a plausible capacity by their power alone.
CREATE MATERIALIZED VIEW mrt.speicher_pv AS
WITH battery_plants AS (
    SELECT u."SpeMastrNummer", max(p."NutzbareSpeicherkapazitaet") AS capacity, sum(u."Bruttoleistung") AS power
    FROM raw.storage_units u
    JOIN raw.storage_plants p ON p."MaStRNummer" = u."SpeMastrNummer"
    WHERE u."Technologie" = '524'
    GROUP BY u."SpeMastrNummer"
),
solar_lokationen AS (
    -- Every Lokation with a solar unit in operation
    SELECT DISTINCT "LokationMaStRNummer" AS lokation
    FROM raw.solar_units
    WHERE "EinheitBetriebsstatus" = '35'
      AND "LokationMaStRNummer" IS NOT NULL
),
batteries AS (
    SELECT
        u."LokationMaStRNummer" AS lokation,
        u."Bruttoleistung" AS power,
        CASE WHEN plausible THEN b.capacity * u."Bruttoleistung" / b.power END AS capacity,
        CASE
            WHEN plausible AND b.capacity < 30 AND b.power < 30 THEN 'heimspeicher'
            WHEN plausible AND (b.capacity >= 1000 OR b.power >= 1000) THEN 'grossspeicher'
            WHEN plausible THEN 'gewerbespeicher'
            WHEN COALESCE(b.power, u."Bruttoleistung") < 30 THEN 'heimspeicher'
            WHEN COALESCE(b.power, u."Bruttoleistung") >= 1000 THEN 'grossspeicher'
            ELSE 'gewerbespeicher'
        END AS size_class
    FROM raw.storage_units u
    LEFT JOIN battery_plants b USING ("SpeMastrNummer")
    CROSS JOIN LATERAL (
        SELECT COALESCE(b.capacity > 0.3 AND b.power > 0.3 AND b.capacity / b.power BETWEEN 0.1 AND 12, FALSE) AS plausible
    ) check_
    WHERE u."Technologie" = '524'
      AND u."EinheitBetriebsstatus" = '35'
      AND u."Land" = '84'
)
SELECT
    b.size_class,
    s.lokation IS NOT NULL AS with_pv,
    count(*) AS units,
    CAST(sum(b.power) / 1000 AS NUMERIC(12,3)) AS power,  -- MW
    CAST(COALESCE(sum(b.capacity), 0) / 1000 AS NUMERIC(12,3)) AS capacity  -- MWh, plausible ones
FROM batteries b
LEFT JOIN solar_lokationen s ON s.lokation = b.lokation
GROUP BY 1, 2;

CREATE UNIQUE INDEX ON mrt.speicher_pv (size_class, with_pv);
