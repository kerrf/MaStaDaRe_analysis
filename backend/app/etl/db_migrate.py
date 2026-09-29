"""
Migrate data into the database: the MaStR bulk export into the raw schema (plus regions, PLZ population and shapes).

    cd backend
    uv run python -m app.etl.db_migrate
"""

import io
import sys
import time
from logging import getLogger
from pathlib import Path

import geopandas as gpd
import pandas as pd
from sqlalchemy import Connection, create_engine, inspect, text
from sqlalchemy.engine import Engine
from sqlalchemy.exc import OperationalError

from app.core.config import settings
from app.etl.extract import Chunk, find_export_files, parse_files
from app.services.logger import setup_logging

logger = getLogger(__name__)

# The unzipped bulk export from https://www.marktstammdatenregister.de/MaStR/Datendownload
EXPORT_DIR = Path("/media/kerf/8FD4-A961/Gesamtdatenexport_20260926_26.1")

# raw table -> file name in the export. Smallest first, so problems show up within seconds.
EXPORT_FILES = {
    "wind_units": "EinheitenWind",
    "water_units": "EinheitenWasser",
    "storage_units": "EinheitenStromSpeicher",
    "storage_plants": "AnlagenStromSpeicher",  # the Speicheranlagen of the storage units, with their capacity (kWh)
    "solar_units": "EinheitenSolar",
}
# Anlagen are identified by their own MaStR number; every other raw table holds units (EinheitMastrNummer)
PRIMARY_KEYS = {"storage_plants": "MaStRNummer"}

RAW_SCHEMA = "raw"

NUMERIC_COLUMNS = [
    'Bruttoleistung',
    'Nettonennleistung',
    'ZugeordneteWirkleistungWechselrichter',
    'AnzahlModule',
    'HauptausrichtungNeigungswinkel',
    'NebenausrichtungNeigungswinkel',
    'GroesseDerInAnspruchGenommenenFlaecheInHektar',
    'Laengengrad',
    'Breitengrad',
    'LichteHoehe',
    # storage
    'ZugeordnenteWirkleistungWechselrichter',  # sic, that's how the export spells it for storage units
    'PumpbetriebLeistungsaufnahme',
    'NutzbareSpeicherkapazitaet',
    # wind
    'GroesseDerInAnspruchGenommenenFlaeche',
    'Nabenhoehe',
    'Rotordurchmesser',
    'Wassertiefe',
    'Kuestenentfernung',
]
DATE_COLUMNS = ['Registrierungsdatum', 'Inbetriebnahmedatum']
DATETIME_COLUMNS = ['DatumLetzteAktualisierung']


# TODO: rename, col plz text
def migrate_plz_file(directory_path: Path, table_name: str, engine: Engine) -> None:

    # shouldn't read plz as int or float, dtype
    df = pd.read_csv(directory_path, dtype={'plz': str})

    df.to_sql(
        name      = table_name,
        con       = engine,
        if_exists = "replace",
        schema    = 'mrt',
        index     = False,
        chunksize = 10000
    )

    logger.info(f"Table {table_name} successfully created")


def migrate_regions(directory_path: Path, engine: Engine) -> None:
    """Area and population of every Gemeinde and of the sea (offshore) into the geo schema.

    The CSV files come from scripts/geo/build_boundaries.py, which builds the map from the same data.
    Emptied and refilled instead of replaced, so the mrt views built on the tables survive.
    """
    for table_name, dtype in [("gemeinden", {"ags": str}), ("offshore", None)]:
        df = pd.read_csv(directory_path / f"{table_name}.csv", dtype=dtype)
        with engine.begin() as conn:
            conn.execute(text("CREATE SCHEMA IF NOT EXISTS geo"))
            if inspect(conn).has_table(table_name, schema="geo"):
                conn.execute(text(f'TRUNCATE geo."{table_name}"'))
            df.to_sql(table_name, conn, schema="geo", if_exists="append", index=False)
        logger.info(f"Table geo.{table_name} successfully loaded ({len(df):,} rows)")


def migrate_all_files(directory_path: Path, file_prefix: str, table_name: str, engine: Engine) -> None:
    """Replace raw.<table_name> with all <file_prefix> files of the export.

    One transaction for the whole table: if anything fails, the table keeps its old data.
    """
    xml_files = find_export_files(directory_path, file_prefix)
    if not xml_files:
        logger.warning(f"No {file_prefix} files found in {directory_path}.")
        return

    logger.info(f"Found {len(xml_files)} files to migrate into {RAW_SCHEMA}.{table_name}.")
    start, units = time.perf_counter(), 0

    with engine.begin() as conn:
        known_columns = prepare_table(conn, table_name)
        loaded_columns: set[str] = set()

        for i, (xml_file, chunks) in enumerate(parse_files(xml_files), start=1):
            file_columns = chunks[-1].columns if chunks else ()  # columns only grow within a file
            add_columns(conn, table_name, [column for column in file_columns if column not in known_columns])
            known_columns.update(file_columns)
            loaded_columns.update(file_columns)

            for chunk in chunks:
                copy_chunk(conn, raw_table(table_name), chunk)
                units += chunk.rows
            logger.info(f"Processed ({i}/{len(xml_files)}): {xml_file.name}")

        drop_stale_columns(conn, table_name, known_columns - loaded_columns)
        conn.execute(text(f"ANALYZE {raw_table(table_name)}"))

    logger.info(f"Migration to database successful! {units:,} units in {time.perf_counter() - start:.0f} s")


def prepare_table(conn: Connection, table_name: str) -> set[str]:
    """Empty the raw table for a full reload (creating it if needed) and return its columns.

    TRUNCATE instead of DROP keeps the views built on the table (e.g. the mrt materialized views) intact.
    The indexes go, building them once after the load is much faster than updating them row by row.
    """
    table = raw_table(table_name)
    conn.execute(text(f"CREATE SCHEMA IF NOT EXISTS {RAW_SCHEMA}"))
    conn.execute(text(f"CREATE TABLE IF NOT EXISTS {table} ()"))
    drop_constraints_and_indexes(conn, table)
    conn.execute(text(f"TRUNCATE {table}"))
    return table_columns(conn, table_name)


def table_columns(conn: Connection, table_name: str) -> set[str]:
    result = conn.execute(
        text("SELECT column_name FROM information_schema.columns WHERE table_schema = :schema AND table_name = :table"),
        {"schema": RAW_SCHEMA, "table": table_name},
    )
    return set(result.scalars())


def column_type(column: str) -> str:
    if column in NUMERIC_COLUMNS:
        return "DOUBLE PRECISION"
    if column in DATE_COLUMNS:
        return "DATE"
    if column in DATETIME_COLUMNS:
        return "TIMESTAMP"
    return "TEXT"  # everything else stays exactly as in the export: IDs, codes, names, 0/1 flags


def add_columns(conn: Connection, table_name: str, columns: list[str]) -> None:
    if not columns:
        return
    logger.info(f"Adding new columns: {', '.join(columns)}")
    additions = ", ".join(f'ADD COLUMN "{column}" {column_type(column)}' for column in columns)
    conn.execute(text(f"ALTER TABLE {raw_table(table_name)} {additions}"))


def copy_chunk(conn: Connection, table: str, chunk: Chunk) -> None:
    """Bulk insert with COPY, the fastest way into Postgres.

    FREEZE writes the rows as already frozen, which spares Postgres a later rewrite of the whole table.
    It's allowed because the table was created or truncated in this same transaction.
    """
    columns = ", ".join(f'"{column}"' for column in chunk.columns)
    sql = f"COPY {table} ({columns}) FROM STDIN WITH (FORMAT csv, FREEZE)"
    with conn.connection.cursor() as cursor:
        cursor.copy_expert(sql, io.BytesIO(chunk.csv), size=1 << 20)


def drop_stale_columns(conn: Connection, table_name: str, columns: set[str]) -> None:
    """Drop the columns the export no longer has (e.g. renamed fields), so the table mirrors the export.

    Columns a view still uses stay, they are just empty now.
    """
    if not columns:
        return
    table = raw_table(table_name)
    used_by_views = set(conn.execute(
        text("""
            SELECT attname FROM pg_attribute
            JOIN pg_depend ON refobjid = attrelid AND refobjsubid = attnum
            WHERE attrelid = CAST(:table AS regclass) AND attname = ANY(:columns)
        """),
        {"table": table, "columns": sorted(columns)},
    ).scalars())

    for column in sorted(columns - used_by_views):
        logger.info(f"Dropping column '{column}', the export no longer has it")
        conn.execute(text(f'ALTER TABLE {table} DROP COLUMN "{column}"'))
    for column in sorted(used_by_views):
        logger.warning(f"Column '{column}' is no longer in the export, but a view uses it, so it stays (empty)")


def drop_constraints_and_indexes(conn: Connection, table: str) -> None:
    """Counterpart of add_constraints_and_indexes, before a bulk load."""
    params = {"table": table}
    primary_keys = conn.execute(
        text("SELECT conname FROM pg_constraint WHERE conrelid = CAST(:table AS regclass) AND contype = 'p'"), params
    ).scalars().all()
    for name in primary_keys:
        conn.execute(text(f'ALTER TABLE {table} DROP CONSTRAINT "{name}"'))

    indexes = conn.execute(
        text("SELECT CAST(CAST(indexrelid AS regclass) AS text) FROM pg_index WHERE indrelid = CAST(:table AS regclass)"),
        params,
    ).scalars().all()
    for name in indexes:
        conn.execute(text(f"DROP INDEX {name}"))


def add_constraints_and_indexes(schema_name: str, table_name: str, engine: Engine) -> None:
    """ Add primary key, index, indexing postal codes"""
    logger.info("Configuring Primary Key and Indexes...")
    key = PRIMARY_KEYS.get(table_name, "EinheitMastrNummer")

    with engine.begin() as conn:
        conn.execute(text(f"""
            ALTER TABLE {schema_name}."{table_name}"
            ADD PRIMARY KEY ("{key}");
        """))

        if "Postleitzahl" in table_columns(conn, table_name):  # units have a location, Anlagen don't
            conn.execute(text(f"""
                CREATE INDEX IF NOT EXISTS idx_{table_name}_plz
                ON {schema_name}."{table_name}" ("Postleitzahl");
            """))

    logger.info("Primary Key and Indexing applied successfully.")


def raw_table(table_name: str) -> str:
    return f'{RAW_SCHEMA}."{table_name}"'


def connect_to_db(max_retries: int = 5, delay: int = 2) -> Engine:
    logger.info("Waiting for database connection...")
    engine = create_engine(settings.DATABASE_URL)
    for attempt in range(max_retries):
        try:
            # Just test the connection and immediately close it
            with engine.connect():
                logger.info("Connection sucessful!")
                return engine
        except OperationalError:
            logger.warning(f"Database not ready. Retrying in {delay} seconds ({attempt + 1}/{max_retries})...")
            time.sleep(delay)

    logger.error("Could not connect to database after maximum retries. Exiting.")
    sys.exit(1)


def migrate_shapefiles(engine: Engine, shp_path: Path, i: int) -> None:

    gdf = gpd.read_file(shp_path, dtype={'plz' : str})
    gdf = gdf.to_crs(epsg=4326)

    with engine.begin() as conn:
        # 1. Ensure public schema exists for the extension
        conn.execute(text("CREATE SCHEMA IF NOT EXISTS geo;"))

        # 2. Install PostGIS specifically into public
        conn.execute(text("CREATE EXTENSION IF NOT EXISTS postgis SCHEMA public;"))

    gdf.to_postgis(
        name=f"plz_shapes_{i}",
        schema="geo",
        con=engine,
        if_exists="replace",
        index=True,
        index_label="id"
    )

    logger.info("Shapefile successfully loaded into PostGIS!")


if __name__ == "__main__":
    setup_logging()

    engine = connect_to_db()

    for table_name, file_prefix in EXPORT_FILES.items():
        migrate_all_files(EXPORT_DIR, file_prefix, table_name, engine)
        add_constraints_and_indexes(RAW_SCHEMA, table_name, engine)

    # migrate_regions(Path("data/geo"), engine)

    # migrate_plz_file(Path("data/resources/plz_einwohner.csv"), "plz_einwohner", engine)

    # migrate_shapefiles(engine, "/home/kerf/energy_projects/mastadatregpv_korrekt-main/backend/data/geo/plz/plz-2stellig.shp/plz-2stellig.shp", 2)
    # migrate_shapefiles(engine, "/home/kerf/energy_projects/mastadatregpv_korrekt-main/backend/data/geo/plz/plz-3stellig.shp/plz-3stellig.shp", 3)
    # migrate_shapefiles(engine, "/home/kerf/energy_projects/mastadatregpv_korrekt-main/backend/data/geo/plz/plz-5stellig.shp/plz-5stellig.shp", 5)
