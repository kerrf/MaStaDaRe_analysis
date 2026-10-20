CREATE SCHEMA IF NOT EXISTS mrt;

DROP MATERIALIZED VIEW IF EXISTS mrt.gaserzeuger;
DROP MATERIALIZED VIEW IF EXISTS mrt.gasspeicher;

-- Gas producers (Gaserzeugungseinheiten) at their location, one row per unit: biomethane plants, natural gas production,
-- LNG terminals and liquefaction plants, Power-to-Gas. The export lists the gas storage units among them too
-- (SpeicherMaStRNummer), and some storages have their outlet registered once more, as "Förderung fossilen Erdgases" in
-- the Gemeinde of the storage (Etzel, Epe, Staßfurt, ...): mrt.gasspeicher has both, they are no producers.
-- Erzeugungsleistung comes in kWh/h (LNG-Terminal Wilhelmshaven: 6,300,000 = 6.3 GW, about 5 bcm a year).
CREATE MATERIALIZED VIEW mrt.gaserzeuger AS
SELECT
    u."EinheitMastrNummer" AS mastr_nummer,
    u."NameGaserzeugungseinheit" AS name,
    CASE u."Technologie"
        WHEN 'Biomethan-Erzeugung' THEN 'biomethan'
        WHEN 'Förderung fossilen Erdgases' THEN 'erdgas'
        WHEN 'Liquefied Natural Gas' THEN 'lng'
        WHEN 'Power-to-Gas (Wasserstoff)' THEN 'wasserstoff'
        WHEN 'Power-to-Gas (Methan)' THEN 'methan'
    END AS technologie,
    CASE u."EinheitBetriebsstatus"
        WHEN 'In Betrieb' THEN 'in Betrieb'
        WHEN 'In Planung' THEN 'in Planung'
        WHEN 'Vorübergehend stillgelegt' THEN 'vorübergehend stillgelegt'
    END AS status,
    CAST(u."Erzeugungsleistung" / 1000 AS NUMERIC(12,1)) AS total_power,  -- MW
    u."Inbetriebnahmedatum" AS inbetriebnahme,
    u."Breitengrad" AS lat,
    u."Laengengrad" AS lon,
    u."Ort" AS ort,
    u."Gemeindeschluessel" AS ags,  -- empty abroad
    u."Land" AS land
FROM raw.gas_producer_units u
WHERE u."SpeicherMaStRNummer" IS NULL
  AND u."EinheitBetriebsstatus" <> 'Endgültig stillgelegt'  -- gone for good
  AND u."Breitengrad" IS NOT NULL
  AND NOT (u."Technologie" = 'Förderung fossilen Erdgases' AND EXISTS (
      SELECT FROM raw.gas_storage_units s WHERE s."Gemeindeschluessel" = u."Gemeindeschluessel"
  ));

CREATE UNIQUE INDEX ON mrt.gaserzeuger (mastr_nummer);

-- Gas storages (AnlagenGasSpeicher) at the location of their units (mostly one), one row per storage. Several operators
-- share the big sites (Etzel, Epe, Nüttermoor): each has its own storage there.
-- The register calls the capacity "maximal nutzbares Arbeitsgasvolumen", but it is energy in kWh: 236 TWh for Germany, as
-- AGSI+ reports. Divided by the average Brennwert (kWh/m³) it gives the volume. Ein- and Ausspeicherleistung in kWh/h.
CREATE MATERIALIZED VIEW mrt.gasspeicher AS
SELECT
    p."MaStRNummer" AS mastr_nummer,
    coalesce(p."Speichername", min(u."NameGasspeicher")) AS name,
    CASE mode() WITHIN GROUP (ORDER BY u."Speicherart")
        WHEN 'Kavernenspeicher' THEN 'kaverne'
        WHEN 'Porenspeicher' THEN 'pore'
        WHEN 'Aquiferspeicher' THEN 'aquifer'
    END AS speicherart,
    CASE p."AnlageBetriebsstatus"
        WHEN 'In Betrieb' THEN 'in Betrieb'
        WHEN 'In Planung' THEN 'in Planung'
        WHEN 'Vorübergehend stillgelegt' THEN 'vorübergehend stillgelegt'
    END AS status,
    count(*) AS total_units,
    CAST(sum(u."MaximalNutzbaresArbeitsgasvolumen") / 1e6 AS NUMERIC(12,1)) AS total_capacity,  -- GWh
    CAST(sum(u."MaximalNutzbaresArbeitsgasvolumen" / nullif(u."DurchschnittlicherBrennwert", 0)) / 1e6
         AS NUMERIC(12,1)) AS volume,  -- Mio. m³
    CAST(sum(u."MaximaleAusspeicherleistung") / 1000 AS NUMERIC(12,1)) AS total_power,  -- Ausspeicherleistung, MW
    CAST(sum(u."MaximaleEinspeicherleistung") / 1000 AS NUMERIC(12,1)) AS injection_power,  -- MW
    avg(u."Breitengrad") AS lat,
    avg(u."Laengengrad") AS lon,
    mode() WITHIN GROUP (ORDER BY u."Ort") AS ort,
    min(u."Gemeindeschluessel") AS ags,
    min(u."Land") AS land
FROM raw.gas_storage_plants p
JOIN raw.gas_storage_units u ON u."SpeicherMaStRNummer" = p."MaStRNummer"
WHERE p."AnlageBetriebsstatus" <> 'Endgültig stillgelegt'
  AND u."EinheitBetriebsstatus" <> 'Endgültig stillgelegt'
GROUP BY p."MaStRNummer", p."Speichername", p."AnlageBetriebsstatus"
HAVING avg(u."Breitengrad") IS NOT NULL;

CREATE UNIQUE INDEX ON mrt.gasspeicher (mastr_nummer);
