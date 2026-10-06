from app.etl.transform import QUERIES, VIEW_FILES, staged, stamp_of, views_of

SQL = """
CREATE SCHEMA IF NOT EXISTS mrt;
DROP MATERIALIZED VIEW IF EXISTS mrt.pv_speicher;
-- Like mrt.battery_region_stats; reads mrt.plz_einwohner
CREATE MATERIALIZED VIEW mrt.pv_speicher AS SELECT * FROM raw.solar_units JOIN mrt.plz_einwohner USING (plz);
CREATE UNIQUE INDEX ON mrt.pv_speicher (plz);
create materialized view mrt.speicher_pv as select 1 as x;
CREATE INDEX ON mrt.speicher_pv (x);
"""


def test_views_of_finds_every_view_a_file_creates():
    assert views_of(SQL) == ["pv_speicher", "speicher_pv"]


def test_staged_moves_only_the_files_own_views():
    sql = staged(SQL, views_of(SQL))
    assert "CREATE MATERIALIZED VIEW mrt_next.pv_speicher AS" in sql
    assert "DROP MATERIALIZED VIEW IF EXISTS mrt_next.pv_speicher;" in sql
    assert "CREATE UNIQUE INDEX ON mrt_next.pv_speicher (plz);" in sql
    assert "create materialized view mrt_next.speicher_pv" in sql
    # What it reads stays where it is, and so does the schema it creates
    assert "JOIN mrt.plz_einwohner" in sql
    assert "mrt.battery_region_stats" in sql
    assert "CREATE SCHEMA IF NOT EXISTS mrt;" in sql


def test_stamp_changes_with_the_file():
    assert stamp_of("a.sql", SQL) == stamp_of("a.sql", SQL)
    assert stamp_of("a.sql", SQL) != stamp_of("a.sql", SQL + " ")


def test_every_view_file_exists_and_creates_a_view():
    for file_name in VIEW_FILES:
        assert views_of((QUERIES / file_name).read_text(encoding="utf-8")), file_name
