CREATE SCHEMA IF NOT EXISTS mrt;

DROP TABLE IF EXISTS mrt.plz_einwohner_rollup;

CREATE TABLE mrt.plz_einwohner_rollup AS
    SELECT
        LEFT("plz", 2) AS plz2,
        LEFT("plz", 3) AS plz3,
        "plz" AS plz5,
        SUM("einwohner") as einwohner
    FROM mrt."plz_einwohner"

    GROUP BY ROLLUP (
        LEFT("plz", 2),
        LEFT("plz", 3),
        "plz"
    )

    ORDER BY plz5;