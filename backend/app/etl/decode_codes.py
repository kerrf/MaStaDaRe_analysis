"""
Turn the codes in the raw tables into their texts: EinheitBetriebsstatus 35 becomes "In Betrieb", by the export's
Katalogwerte.xml (codes.KATALOG; Lokationtyp, Marktfunktion and EegAnlagentyp by the lists of their own files). For a
database whose tables came with codes: db_migrate loads them as texts since, and the nightly update writes texts. Once
that is done it finds nothing to do and changes nothing.

A table with codes is written once anew, as raw.<table>__texts: every column as it is, the code columns through a small
lookup of their catalog's codes (two columns of numbers, the tilt of solar modules, become text columns on the way).
Then its key and indexes, and in one short transaction the swap: the old table goes aside as raw.<table>__codes, the new
one takes its name. The views (schema mrt) keep reading the old one until transform.py builds them again: their stamp
is cleared, so it builds every one of them, from their new SQL, which reads texts. The deploy runs this, then that
(deploy/deploy_backend.sh); the website goes on meanwhile (it reads only mrt). Then this once more: the tables aside, no
view reading them any more, go (cleanup). Needs free disk for one more copy of the tables with codes until then.

    cd backend
    uv run python -m app.etl.decode_codes

No arguments. Nothing else may write into the tables meanwhile: not the nightly update, not db_migrate. Exits with 0 when
there was nothing to do, with 3 when it turned codes into texts (deploy/deploy_backend.sh tells them apart), with 4 when
it found codes, but not every table the views read (transform.py): it changes nothing then. Those views couldn't be
built, and the old ones, which compare codes, would show nothing after the next refresh: load or push the tables first
(db_migrate, deploy/push_raw_tables.sh).
"""

import json
import sys
import time
from logging import getLogger

from sqlalchemy import Connection, text
from sqlalchemy.engine import Engine

from app.codes import KATALOG, LISTEN, SEPARATOR, TABLE_SPECS, CodeSpec
from app.etl.db_migrate import RAW_SCHEMA, connect_to_db, raw_table, table_columns
from app.etl.transform import QUERIES, VIEW_FILES, missing_raw_tables
from app.services.logger import setup_logging

logger = getLogger(__name__)

DONE = 3  # the exit code when it turned codes into texts (0: there were none)
TABLES_MISSING = 4  # the exit code when it changed nothing: tables the views read are missing
NEW, OLD = "__texts", "__codes"  # the new table until the swap, the old one after it
# A cell with codes, also a list of them: "35", "813, 3186", "332, 333, " – a text has letters
CODES = r"^[\s,]*\d+[\s\d,]*$"
CATALOG_OF = {code: kategorie for kategorie, (_, values) in KATALOG.items() for code in values}


def run(conn: Connection, sql: str) -> None:
    """A statement as it is: no parameters, so neither a colon nor a percent sign in a text ("Ja, auf 70%") is one."""
    conn.exec_driver_sql(sql.replace("%", "%%"))


def literal(value: str) -> str:
    return "'" + value.replace("'", "''") + "'"


def texts_for(spec: CodeSpec, column: str) -> dict[str, str]:
    """code -> text for one column: every value of the catalogs its codes belong to (also codes newer than the API
    catalog in codes.py), or of the list of its own file."""
    if column in spec.texts:
        return {str(code): text for code, text in LISTEN[spec.texts[column]].items()}
    kategorien = {CATALOG_OF[code] for code in spec.columns[column] if code in CATALOG_OF}
    return {str(code): text for kategorie in kategorien for code, text in KATALOG[kategorie][1].items()}


def converted(spec: CodeSpec, column: str, data_type: str) -> str:
    """SQL: the column of the new table. A code becomes its text; a text, or a code without one, stays."""
    cell = f'"{column}"' if data_type == "text" else f'CAST(CAST("{column}" AS bigint) AS text)'  # 806.0 -> "806"
    texts = texts_for(spec, column)
    if column not in spec.multi:
        whens = " ".join(f"WHEN {literal(code)} THEN {literal(text)}" for code, text in texts.items())
        return f'CASE btrim({cell}) {whens} ELSE {cell} END AS "{column}"'
    # Several codes: in the order of the export, a list ending with a comma ("332, …, 345, ") without its empty part
    lookup = literal(json.dumps(texts, ensure_ascii=False)) + "::jsonb"
    return f"""CASE WHEN {cell} ~ '{CODES}' THEN array_to_string(ARRAY(
            SELECT COALESCE({lookup} ->> btrim(part), btrim(part))
            FROM unnest(string_to_array({cell}, ',')) WITH ORDINALITY AS parts(part, i)
            WHERE btrim(part) <> ''
            ORDER BY i
        ), '{SEPARATOR}') ELSE {cell} END AS "{column}\""""


def columns_of(conn: Connection, table: str) -> list[tuple[str, str]]:
    """(column, data type) in the table's order."""
    return conn.execute(
        text("""
        SELECT column_name, data_type FROM information_schema.columns
        WHERE table_schema = :schema AND table_name = :table ORDER BY ordinal_position
    """),
        {"schema": RAW_SCHEMA, "table": table},
    ).all()


def build_new(conn: Connection, table: str, spec: CodeSpec) -> None:
    """raw.<table>__texts: the table with texts, its key and indexes under names of its own until the swap."""
    new = f"{table}{NEW}"
    select = ",\n    ".join(
        converted(spec, column, data_type) if column in spec.columns else f'"{column}"'
        for column, data_type in columns_of(conn, table)
    )
    run(conn, f'DROP TABLE IF EXISTS {RAW_SCHEMA}."{new}"')  # left by an aborted run
    run(conn, f'CREATE TABLE {RAW_SCHEMA}."{new}" AS SELECT\n    {select}\nFROM {raw_table(table)}')
    for name, definition in constraints_of(conn, table):
        run(conn, f'ALTER TABLE {RAW_SCHEMA}."{new}" ADD CONSTRAINT "{name}{NEW}" {definition}')
    for name, definition in indexes_of(conn, table):
        # "CREATE [UNIQUE] INDEX name ON raw.table USING btree (…)": the same on the new table, under a name of its own
        unique = "UNIQUE " if definition.startswith("CREATE UNIQUE") else ""
        method = definition.split(" USING ", 1)[1]
        run(conn, f'CREATE {unique}INDEX "{name}{NEW}" ON {RAW_SCHEMA}."{new}" USING {method}')
    run(conn, f'ANALYZE {RAW_SCHEMA}."{new}"')


def constraints_of(conn: Connection, table: str) -> list[tuple[str, str]]:
    """The table's primary key (and any other constraint): name, definition."""
    return conn.execute(
        text("SELECT conname, pg_get_constraintdef(oid) FROM pg_constraint WHERE conrelid = CAST(:table AS regclass)"),
        {"table": raw_table(table)},
    ).all()


def indexes_of(conn: Connection, table: str) -> list[tuple[str, str]]:
    """The table's indexes that no constraint makes: name, CREATE INDEX statement."""
    return conn.execute(
        text("""
        SELECT c.relname, pg_get_indexdef(i.indexrelid)
        FROM pg_index i JOIN pg_class c ON c.oid = i.indexrelid
        WHERE i.indrelid = CAST(:table AS regclass)
          AND NOT EXISTS (SELECT FROM pg_constraint k WHERE k.conindid = i.indexrelid)
    """),
        {"table": raw_table(table)},
    ).all()


def views_on(conn: Connection, table: str) -> list[str]:
    """The materialized views that read a table (schema-qualified)."""
    return (
        conn.execute(
            text("""
            SELECT DISTINCT format('%I.%I', n.nspname, v.relname)
            FROM pg_depend d
            JOIN pg_rewrite r ON r.oid = d.objid
            JOIN pg_class v ON v.oid = r.ev_class
            JOIN pg_namespace n ON n.oid = v.relnamespace
            WHERE d.refobjid = CAST(:table AS regclass) AND v.relkind = 'm'
        """),
            {"table": table},
        )
        .scalars()
        .all()
    )


def swap(conn: Connection, table: str) -> None:
    """The new table takes the old one's name, key and index names; the old one goes aside, its views stay on it and
    lose their stamp, so transform.py builds them again (on the new one)."""
    old, new = f"{table}{OLD}", f"{table}{NEW}"
    comment = conn.execute(text("SELECT obj_description(CAST(:t AS regclass), 'pg_class')"), {"t": raw_table(table)})
    comment = comment.scalar()
    constraints, indexes = constraints_of(conn, table), indexes_of(conn, table)
    run(conn, f'ALTER TABLE {raw_table(table)} RENAME TO "{old}"')
    for name, _ in constraints:
        run(conn, f'ALTER TABLE {RAW_SCHEMA}."{old}" RENAME CONSTRAINT "{name}" TO "{name}{OLD}"')
        run(conn, f'ALTER TABLE {RAW_SCHEMA}."{new}" RENAME CONSTRAINT "{name}{NEW}" TO "{name}"')
    for name, _ in indexes:
        run(conn, f'ALTER INDEX {RAW_SCHEMA}."{name}" RENAME TO "{name}{OLD}"')
        run(conn, f'ALTER INDEX {RAW_SCHEMA}."{name}{NEW}" RENAME TO "{name}"')
    run(conn, f'ALTER TABLE {RAW_SCHEMA}."{new}" RENAME TO "{table}"')
    if comment:
        run(conn, f"COMMENT ON TABLE {raw_table(table)} IS {literal(comment)}")
    for view in views_on(conn, f'{RAW_SCHEMA}."{old}"'):
        run(conn, f"COMMENT ON MATERIALIZED VIEW {view} IS NULL")


def cleanup(engine: Engine) -> None:
    """The tables a run put aside (raw.<table>__codes), once no view reads them any more. A view transform.py doesn't
    build (an old one, not in VIEW_FILES) keeps its table: drop that view by hand, the next run drops the table."""
    for table in TABLE_SPECS:
        old = f'{RAW_SCHEMA}."{table}{OLD}"'
        with engine.begin() as conn:
            if conn.execute(text("SELECT to_regclass(:t)"), {"t": old}).scalar() is None:
                continue
            readers = views_on(conn, old)
            if readers:
                logger.warning(f"{old} stays: {', '.join(readers)} still read it (built again by transform.py?)")
                continue
            run(conn, f"DROP TABLE {old}")
            logger.info(f"{old}: dropped, its texts are in {raw_table(table)}")


def coded_tables(engine: Engine) -> list[str]:
    """The tables that hold a code still, by the first of their code columns (one look each; a few seconds a table once
    it has texts)."""
    coded = []
    for table, spec in TABLE_SPECS.items():
        with engine.connect() as conn:
            if not exists(conn, table):
                continue
            columns = [column for column in spec.columns if column in table_columns(conn, table)]
            if (
                columns
                and conn.execute(
                    text(
                        f"""SELECT EXISTS (SELECT FROM {raw_table(table)} WHERE CAST("{columns[0]}" AS text) ~ '{CODES}')"""
                    )
                ).scalar()
            ):
                coded.append(table)
    return coded


def tables_the_views_need(engine: Engine) -> list[str]:
    """The raw tables the views read (transform.VIEW_FILES) that the database doesn't have."""
    return sorted({table for file in VIEW_FILES for table in missing_raw_tables(engine, (QUERIES / file).read_text())})


def exists(conn: Connection, table: str) -> bool:
    return conn.execute(text("SELECT to_regclass(:table)"), {"table": raw_table(table)}).scalar() is not None


def decode_tables(engine: Engine, tables: list[str]) -> None:
    """These tables with texts instead of codes, one after the other."""
    for table in tables:
        start = time.perf_counter()
        with engine.begin() as conn:
            build_new(conn, table, TABLE_SPECS[table])
        with engine.begin() as conn:
            conn.execute(text("SET LOCAL lock_timeout = '60s'"))
            swap(conn, table)
        logger.info(f"{raw_table(table)}: texts instead of codes, in {time.perf_counter() - start:.0f} s")


if __name__ == "__main__":
    setup_logging()
    started = time.perf_counter()
    engine = connect_to_db()
    cleanup(engine)
    coded, lacking = coded_tables(engine), tables_the_views_need(engine)
    if not coded:
        logger.info("No codes left in the raw tables: nothing to do")
        sys.exit(0)
    if lacking:
        logger.error(
            f"Codes in raw.{', raw.'.join(coded)}, but the views also read raw.{', raw.'.join(lacking)}, which the database "
            "doesn't have: nothing changed. Load them first (db_migrate; on the server: deploy/push_raw_tables.sh)."
        )
        sys.exit(TABLES_MISSING)
    decode_tables(engine, coded)
    logger.info(
        f"{len(coded)} tables with texts instead of codes in {(time.perf_counter() - started) / 60:.1f} min. "
        "Next: the views (uv run python -m app.etl.transform), then this once more (it drops the old tables)"
    )
    sys.exit(DONE)
