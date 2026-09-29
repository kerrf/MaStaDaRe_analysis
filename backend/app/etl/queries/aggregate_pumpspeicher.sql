CREATE SCHEMA IF NOT EXISTS mrt;

DROP MATERIALIZED VIEW IF EXISTS mrt.pumpkraftwerke;

-- One row per pumped-storage plant, aggregated from its machines (units). A plant is every machine connected by the
-- same location (Breitengrad/Laengengrad) or the same Speicheranlage (SpeMastrNummer), also through several steps:
-- the register lists some stations as two Speicheranlagen, and spreads others over several stations.
CREATE MATERIALIZED VIEW mrt.pumpkraftwerke AS
WITH RECURSIVE units AS (
    -- The machines that still exist: finally decommissioned ones (DatumEndgueltigeStilllegung) are gone for good
    SELECT
        *,
        string_to_array("NameStromerzeugungseinheit", ' ') AS words,
        -- the name without its last word ("Wehr MS A10" -> "Wehr"), for plants whose machines have different names
        regexp_replace("NameStromerzeugungseinheit", '(\s+(PSS|MS|Maschine|Turbine|-))*\s+\S+$', '') AS station
    FROM raw.storage_units
    WHERE "Technologie" = '1537'  -- Pumpspeicher
      AND "DatumEndgueltigeStilllegung" IS NULL
),
same_location AS (
    -- Speicheranlagen with machines at the same location
    SELECT DISTINCT a."SpeMastrNummer" AS anlage, b."SpeMastrNummer" AS other
    FROM units a
    JOIN units b USING ("Breitengrad", "Laengengrad")
),
reachable AS (
    -- Every Speicheranlage reachable from each one, location by location
    SELECT DISTINCT "SpeMastrNummer" AS anlage, "SpeMastrNummer" AS other FROM units
    UNION
    SELECT r.anlage, l.other
    FROM reachable r
    JOIN same_location l ON l.anlage = r.other
),
plant_units AS (
    -- Every machine with its plant: the lowest Speicheranlage connected to its own
    SELECT u.*, r.plant
    FROM units u
    JOIN (SELECT anlage, min(other) AS plant FROM reachable GROUP BY anlage) r ON r.anlage = u."SpeMastrNummer"
),
differing_words AS (
    -- Word positions where the machines of a plant differ, or where a name has ended
    SELECT plant, i
    FROM plant_units CROSS JOIN generate_series(1, 20) AS i
    GROUP BY plant, i
    HAVING count(DISTINCT words[i]) <> 1 OR count(words[i]) <> count(*)
),
shared AS (
    -- How many leading words all machines of a plant have in common: "PSW Goldisthal PSS A" / "... PSS B" -> 3.
    -- A plant with a single machine shares its whole name.
    SELECT plant, min(i) - 1 AS words
    FROM differing_words
    GROUP BY plant
),
plants AS (
    SELECT
        string_agg(DISTINCT u."SpeMastrNummer", ', ') AS spe_mastr_nummer,
        min(array_to_string(u.words[1:s.words], ' ')) AS shared_name,
        string_agg(DISTINCT u.station, ' / ') AS stations,
        CASE
            WHEN bool_and(u."GeplantesInbetriebnahmedatum" IS NOT NULL) THEN 'in Planung'  -- not built yet
            WHEN bool_and(u."EinheitBetriebsstatus" = '37') THEN 'vorübergehend stillgelegt'
            ELSE 'in Betrieb'
        END AS status,
        count(*) AS total_units,
        CAST(sum(u."Bruttoleistung") / 1000 AS NUMERIC(10,1)) AS total_power,                  -- turbine, MW
        CAST(sum(u."PumpbetriebLeistungsaufnahme") / 1000 AS NUMERIC(10,1)) AS pump_power,      -- pump, MW
        CAST(max(p."NutzbareSpeicherkapazitaet") / 1000 AS NUMERIC(12,1)) AS total_capacity,   -- per plant, MWh
        avg(u."Breitengrad") AS lat,
        avg(u."Laengengrad") AS lon,
        mode() WITHIN GROUP (ORDER BY u."Ort") AS ort,
        min(u."Gemeindeschluessel") AS ags,  -- empty for the plants in Austria and Luxembourg
        CASE min(u."Land") WHEN '84' THEN 'Deutschland' WHEN '206' THEN 'Österreich' WHEN '169' THEN 'Luxemburg'
            WHEN '231' THEN 'Schweiz' ELSE min(u."Land") END AS land
    FROM plant_units u
    JOIN shared s USING (plant)
    LEFT JOIN raw.storage_plants p ON p."MaStRNummer" = u."SpeMastrNummer"
    GROUP BY u.plant
    -- A handful of tiny registrations (a Pergola, a heat pump, a home battery: up to 33 kW, no location) are no
    -- pumped-storage plants; the smallest real one has 500 kW.
    HAVING sum(u."Bruttoleistung") >= 100
       AND avg(u."Breitengrad") IS NOT NULL
)
SELECT
    spe_mastr_nummer,
    -- The words all machines share are the plant's name, without trailing machine words ("PSW Goldisthal PSS" ->
    -- "PSW Goldisthal"). Where they say too little ("KW"), the plant's stations are listed instead.
    CASE
        WHEN length(shared_name) > 3 THEN regexp_replace(shared_name, '(\s+(PSS|MS|Maschine|Turbine|-))+$', '')
        ELSE stations
    END AS name,
    status,
    total_units,
    total_power,
    pump_power,
    total_capacity,
    lat,
    lon,
    ort,
    ags,
    land
FROM plants;
