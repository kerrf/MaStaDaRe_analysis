"""
Reload the tables of the Netzanschlüsse from the bulk export: the Netzanschlusspunkte, the grid operators and the units
of the other technologies (biomass, combustion, nuclear, geothermal), which place the Netzanschlusspunkte. The nightly
update (update.py) keeps them current, but only once they are in the database: it can't fetch millions of
Netzanschlusspunkte through the API. For a database without them, or to start them afresh.

From the newest bulk export (the "Gesamtdatenauszug vom Vortag", about 3.2 GB): downloads it into data/raw unless it's
there already, unpacks only these tables' files, replaces each table (db_migrate: one transaction each, the views
built on it stay) and notes the export in the table's comment. Then it recomputes the views that read the tables and
deletes the unpacked files (the zip stays, for another run).

    cd backend
    uv run python -m app.etl.export_tables

deploy/push_raw_tables.sh then puts the same tables on the server.
"""

import re
import shutil
import sys
import time
from logging import getLogger
from pathlib import Path
from zipfile import ZipFile

import requests
from sqlalchemy import text
from sqlalchemy.engine import Engine

from app.etl.db_migrate import (
    EXPORT_FILES,
    RAW_SCHEMA,
    add_constraints_and_indexes,
    connect_to_db,
    migrate_all_files,
    raw_table,
)
from app.services.logger import setup_logging

logger = getLogger(__name__)

DOWNLOAD_PAGE = "https://www.marktstammdatenregister.de/MaStR/Datendownload"
# The daily export, e.g. Gesamtdatenexport_20261018_26.2.zip (the ones of past Stichtage live under /Stichtag/)
DAILY_EXPORT = re.compile(
    r'href="(https://download\.marktstammdatenregister\.de/(Gesamtdatenexport_\d{8}_[\d.]+)\.zip)"'
)
DOWNLOAD_DIR = Path(__file__).resolve().parents[2] / "data" / "raw"
CHUNK = 8 * 1024 * 1024
LOG_EVERY = 256 * 1024 * 1024  # bytes between two progress lines


# What aggregate_netzanschluesse.sql reads besides the units the update had before (solar, wind, water, storage), in
# the order of db_migrate (smallest first)
TABLES = [
    "nuclear_units",
    "geothermal_units",
    "biomass_units",
    "combustion_units",
    "grid_operators",
    "grid_connection_points",
]


def newest_export() -> tuple[str, str]:
    """The download link and name (without .zip) of the newest daily export."""
    page = requests.get(DOWNLOAD_PAGE, timeout=60)
    page.raise_for_status()
    found = DAILY_EXPORT.search(page.text)
    if not found:
        raise RuntimeError(f"no link to the daily export on {DOWNLOAD_PAGE}: has the page changed?")
    return found.group(1), found.group(2)


def download(url: str, target: Path) -> None:
    """The export into `target`, unless it's there complete already. Into a .partial file first: an interrupted
    download never looks complete."""
    with requests.get(url, stream=True, timeout=(30, 300)) as answer:
        answer.raise_for_status()
        size = int(answer.headers.get("content-length", 0))
        if target.exists() and target.stat().st_size == size:
            logger.info(f"{target.name} is here already ({size / 1e9:.1f} GB)")
            return
        logger.info(f"Downloading {target.name} ({size / 1e9:.1f} GB) into {target.parent}")
        partial = target.with_suffix(".zip.partial")
        done, logged, start = 0, 0, time.perf_counter()
        with open(partial, "wb") as file:
            for chunk in answer.iter_content(CHUNK):
                file.write(chunk)
                done += len(chunk)
                if done - logged >= LOG_EVERY:
                    logged = done
                    speed = done / (time.perf_counter() - start) / 1e6
                    logger.info(f"{done / 1e9:.1f} of {size / 1e9:.1f} GB ({speed:.0f} MB/s)")
    if size and partial.stat().st_size != size:
        raise RuntimeError(f"the download stopped at {partial.stat().st_size:,} of {size:,} bytes: run it again")
    partial.rename(target)


def unpack(archive: Path, target: Path, tables: list[str]) -> None:
    """Only the files of these tables (e.g. Netzanschlusspunkte_1.xml, _2, ...)."""
    patterns = [re.compile(rf"{re.escape(EXPORT_FILES[table])}(_\d+)?\.xml") for table in tables]
    with ZipFile(archive) as zip_file:
        members = [m for m in zip_file.namelist() if any(p.fullmatch(Path(m).name) for p in patterns)]
        for table, pattern in zip(tables, patterns, strict=True):
            if not any(pattern.fullmatch(Path(m).name) for m in members):
                raise RuntimeError(f"no {EXPORT_FILES[table]} files in {archive.name}: has the export changed?")
        size = sum(zip_file.getinfo(m).file_size for m in members)
        logger.info(f"Unpacking {len(members)} files ({size / 1e9:.1f} GB) into {target}")
        target.mkdir(parents=True, exist_ok=True)
        for member in members:
            with zip_file.open(member) as source, open(target / Path(member).name, "wb") as file:
                shutil.copyfileobj(source, file, CHUNK)


def note_export(engine: Engine, table: str, export: str) -> None:
    """Which export the table holds, in its comment: deploy/push_raw_tables.sh shows it, and it goes along to the
    server. And what the nightly update noted for it goes: its next run fetches every change since the export."""
    with engine.begin() as conn:
        conn.execute(text(f"COMMENT ON TABLE {raw_table(table)} IS '{export}'"))
        if conn.execute(text("SELECT to_regclass('meta.sync_state')")).scalar() is not None:
            conn.execute(text("DELETE FROM meta.sync_state WHERE table_name = :table"), {"table": table})


def refresh_dependent_views(engine: Engine, tables: list[str]) -> None:
    """Recompute the materialized views that read these tables (they don't follow a reload on their own)."""
    with engine.connect() as conn:
        views = (
            conn.execute(
                text("""
                SELECT DISTINCT format('%I.%I', n.nspname, v.relname)
                FROM pg_depend d
                JOIN pg_rewrite r ON r.oid = d.objid
                JOIN pg_class v ON v.oid = r.ev_class
                JOIN pg_namespace n ON n.oid = v.relnamespace
                WHERE d.refobjid = ANY(CAST(:tables AS regclass[])) AND v.relkind = 'm'
                ORDER BY 1
            """),
                {"tables": [f"{RAW_SCHEMA}.{table}" for table in tables]},
            )
            .scalars()
            .all()
        )
    for view in views:
        start = time.perf_counter()
        with engine.begin() as conn:
            conn.execute(text(f"REFRESH MATERIALIZED VIEW {view}"))
        logger.info(f"{view}: refreshed in {time.perf_counter() - start:.0f} s")


def busy_sessions(engine: Engine) -> int:
    """Other sessions doing something in the database: an update or a view rebuild, which a reload would block."""
    with engine.connect() as conn:
        return conn.execute(
            text("""
            SELECT count(*) FROM pg_stat_activity
            WHERE datname = current_database() AND pid <> pg_backend_pid() AND state NOT IN ('idle')
        """)
        ).scalar()


if __name__ == "__main__":
    setup_logging()
    started = time.perf_counter()
    engine = connect_to_db()
    if busy_sessions(engine):
        logger.error("Something is still running in the database (an update or a view rebuild?). Let it finish first.")
        sys.exit(1)

    url, export = newest_export()
    logger.info(f"Newest export: {export} · tables: {', '.join(TABLES)}")
    DOWNLOAD_DIR.mkdir(parents=True, exist_ok=True)
    archive = DOWNLOAD_DIR / f"{export}.zip"
    download(url, archive)

    unpacked = DOWNLOAD_DIR / export
    unpack(archive, unpacked, TABLES)
    for table in TABLES:
        migrate_all_files(unpacked, EXPORT_FILES[table], table, engine)
        add_constraints_and_indexes(RAW_SCHEMA, table, engine)
        note_export(engine, table, export)
    shutil.rmtree(unpacked)

    refresh_dependent_views(engine, TABLES)
    logger.info(
        f"Done in {(time.perf_counter() - started) / 60:.0f} min: {', '.join(TABLES)} hold {export}. "
        f"{archive.name} stays in {DOWNLOAD_DIR} (delete it when you like). Next: ./deploy/push_raw_tables.sh"
    )
