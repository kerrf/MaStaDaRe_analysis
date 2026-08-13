CREATE SCHEMA IF NOT EXISTS mrt;

DROP TABLE IF EXISTS mrt.solar_rollup_stats;

CREATE MATERIALIZED VIEW mrt.solar_rollup_stats AS
SELECT 
    LEFT(su."Postleitzahl", 2) AS plz2,
    LEFT(su."Postleitzahl", 3) AS plz3,
    su."Postleitzahl" AS plz5,
    COUNT(su."EinheitMastrNummer") AS total_units,
    SUM(su."Bruttoleistung") AS total_power
FROM stg.solar_units su
GROUP BY ROLLUP (
    LEFT(su."Postleitzahl", 2),
    LEFT(su."Postleitzahl", 3),
    su."Postleitzahl"
);