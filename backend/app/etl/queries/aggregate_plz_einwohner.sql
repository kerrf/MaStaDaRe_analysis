CREATE SCHEMA IF NOT EXISTS mrt;

DROP TABLE IF EXISTS mrt.plz_einwohner_agg_2;

CREATE TABLE mrt.plz_einwohner_agg_2 AS
    SELECT
        LEFT("plz", 2) AS plz_region,
        SUM("einwohner") as einwohner
    FROM mrt."plz_einwohner"
    GROUP BY LEFT("plz", 2)
    ORDER BY plz_region;

ALTER TABLE mrt.plz_einwohner_agg_2 ADD PRIMARY KEY (plz_region)