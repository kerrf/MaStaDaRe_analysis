CREATE SCHEMA IF NOT EXISTS mrt;

DROP MATERIALIZED VIEW IF EXISTS mrt.wind_turbines;

-- Every wind turbine on its own (not per Windpark): in operation, in planning and finally decommissioned, with its hub
-- height, rotor diameter and power, the year it went into operation (planned: the year planned), where it stands and
-- its manufacturer. For the Anlagen page of the Erzeuger: how the sizes relate, how they grew, and where the big ones
-- stand. Temporarily shut down units (a few dozen) are left out, like in the region views.
CREATE MATERIALIZED VIEW mrt.wind_turbines AS
SELECT
    "EinheitMastrNummer" AS mastr_nummer,
    CASE "EinheitBetriebsstatus" WHEN 'In Betrieb' THEN 'in_betrieb' WHEN 'In Planung' THEN 'geplant' ELSE 'stillgelegt' END
        AS status,
    CASE WHEN "WindAnLandOderAufSee" = 'Windkraft auf See' THEN 'auf_see' ELSE 'an_land' END AS lage,
    CAST(CASE
        WHEN "EinheitBetriebsstatus" = 'In Planung' AND "GeplantesInbetriebnahmedatum" ~ '^\d{4}-'
            THEN LEFT("GeplantesInbetriebnahmedatum", 4)
        ELSE TO_CHAR("Inbetriebnahmedatum", 'YYYY')
    END AS INTEGER) AS jahr,
    -- 0 and below is no size: unknown
    CASE WHEN "Nabenhoehe" > 0 THEN "Nabenhoehe" END AS nabenhoehe,  -- m
    CASE WHEN "Rotordurchmesser" > 0 THEN "Rotordurchmesser" END AS rotordurchmesser,  -- m
    "Bruttoleistung" AS leistung,  -- kW
    -- Offshore turbines lie in no Gemeinde
    CASE WHEN "WindAnLandOderAufSee" = 'Windkraft auf See' THEN NULL ELSE "Gemeindeschluessel" END AS ags,
    "Laengengrad" AS lon,
    "Breitengrad" AS lat,
    "Hersteller" AS hersteller  -- its name (models/wind.py groups them)
FROM raw.wind_units
WHERE "EinheitBetriebsstatus" IN ('In Betrieb', 'In Planung', 'Endgültig stillgelegt');

CREATE UNIQUE INDEX ON mrt.wind_turbines (mastr_nummer);
