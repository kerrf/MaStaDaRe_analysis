"""
Builds the dashboard's materialized views (schema mrt) from their SQL files in queries/: every view whose file changed
since it was built, and every one that doesn't exist yet. The others stay as they are; the nightly update refreshes
their data (update.py).

How a view is built without the website noticing: its file runs with the view renamed into the schema mrt_next, while
the old one keeps answering; then, in one short transaction, the old one goes and the new one moves into mrt. A failed
build leaves the old view as it was. The view's comment notes its file and the file's SHA-256: that is how the next
run knows whether the file changed. A view built some other way (by hand with psql) has no such comment and is built
again.

The deploy runs it on the server with the image of the new version, before that version goes live
(deploy/deploy_backend.sh): the views a change of the code needs are there when it starts. Locally, after changing a
file (no arguments):

    cd backend
    uv run python -m app.etl.transform

Between two versions, views only grow (new views, new columns): the version before keeps working with them, also after
a rollback. A column or view that goes: first a version whose code no longer reads it, then one without it in the SQL.
"""

import hashlib
import re
import time
from logging import getLogger
from pathlib import Path

from sqlalchemy import Engine, text
from sqlalchemy.exc import OperationalError

from app.db.database import engine
from app.services.logger import setup_logging

logger = getLogger(__name__)

QUERIES = Path(__file__).parent / "queries"
SCHEMA = "mrt"
STAGING = "mrt_next"  # where a view is built before it replaces the live one
# The swap waits at most this long for queries on the old view, then tries again (the nightly refresh holds it longer)
SWAP_LOCK_TIMEOUT = "30s"
SWAP_TRIES = 5
# Held for a whole run (pg_advisory_lock): a second run on the same database would clear the first one's staging schema
RUN_LOCK = 4_726_431

# The files of the views, in the order they are built. Each one creates one or more views: CREATE MATERIALIZED VIEW
# mrt.<name>, with its indexes.
VIEW_FILES = [
    # Per postcode (PLZ 2, 3 and 5), needs the table mrt.plz_einwohner
    "aggregate_pv_by_plz_power.sql",
    # Bundesland > Landkreis > Gemeinde, needs geo.gemeinden and geo.offshore (db_migrate.migrate_regions)
    "aggregate_pv_by_region_power.sql",
    "aggregate_wind_by_region_power.sql",
    "aggregate_bat_by_region_power.sql",
    "aggregate_water_by_region_power.sql",
    # Needs raw.storage_plants (AnlagenStromSpeicher) for the storage capacity
    "aggregate_pumpspeicher.sql",
    # Zubau im Zeitverlauf (Germany-wide, per month and year); battery capacity also from raw.storage_plants
    "aggregate_zubau.sql",
    # Analyses per Deutschland / Land / Kreis: size classes (solar, wind, hydro) and orientation of the solar modules
    "aggregate_size_distribution.sql",
    "aggregate_solar_orientation.sql",
    # Solar Zubau and Bestand per year in every region (the Landkreis/Gemeinde page)
    "aggregate_solar_zubau_regions.sql",
    # The same for batteries, and their size classes by capacity (the Landkreis/Gemeinde page of the Speicher)
    "aggregate_battery_zubau_regions.sql",
    "aggregate_battery_size_distribution.sql",
    # Where the power lies, for the continuous map (heatmap): solar, wind and batteries at their coordinates or postcode
    "aggregate_heatmap_points.sql",
    # Solar units and batteries at the same Lokation (Germany-wide), needs raw.storage_plants for the capacity
    "aggregate_pv_speicher.sql",
    # Gas producers and gas storages at their location (raw.gas_producer_units, gas_storage_units, gas_storage_plants)
    "aggregate_gas.sql",
    # Registrations in the MaStR per year and technology (every dashboard's Analysen)
    "aggregate_registrierungen.sql",
    # How long after going into operation units were registered, per technology and year of commissioning
    "aggregate_registrierungsverzug.sql",
]


def stamp_of(file_name: str, sql: str) -> str:
    """What a view's comment says about the file it was built from: the file and the SHA-256 of its text."""
    return f"{file_name} sha256:{hashlib.sha256(sql.encode()).hexdigest()}"


def views_of(sql: str) -> list[str]:
    """The views a file creates (CREATE MATERIALIZED VIEW mrt.<name>)."""
    return re.findall(rf"CREATE\s+MATERIALIZED\s+VIEW\s+{SCHEMA}\.(\w+)", sql, flags=re.IGNORECASE)


def staged(sql: str, views: list[str]) -> str:
    """The file with its own views in the staging schema. What it reads stays: raw, geo, and other tables in mrt."""
    return re.sub(rf"\b{SCHEMA}\.({'|'.join(views)})\b", rf"{STAGING}.\1", sql)


def built_stamps(engine: Engine) -> dict[str, str | None]:
    """The views in mrt and the stamp in their comment (None: built some other way)."""
    with engine.connect() as conn:
        rows = conn.execute(
            text("""
            SELECT c.relname, obj_description(c.oid, 'pg_class')
            FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
            WHERE n.nspname = :schema AND c.relkind = 'm'
        """),
            {"schema": SCHEMA},
        ).all()
    return dict(rows)


def swap(engine: Engine, views: list[str], stamp: str) -> None:
    """The new views for the live ones, in one short transaction: the website sees either the old or the new ones."""
    for attempt in range(1, SWAP_TRIES + 1):
        try:
            with engine.begin() as conn:
                conn.execute(text(f"SET LOCAL lock_timeout = '{SWAP_LOCK_TIMEOUT}'"))
                for view in views:
                    conn.execute(text(f"DROP MATERIALIZED VIEW IF EXISTS {SCHEMA}.{view}"))
                    conn.execute(text(f"ALTER MATERIALIZED VIEW {STAGING}.{view} SET SCHEMA {SCHEMA}"))
                    # The stamp has only letters, digits and ".:_ " (file name, hash): safe as a literal
                    conn.execute(text(f"COMMENT ON MATERIALIZED VIEW {SCHEMA}.{view} IS '{stamp}'"))
            return
        except OperationalError as error:
            # 55P03 lock_not_available: a query or the nightly refresh holds the old view
            if attempt == SWAP_TRIES or getattr(error.orig, "pgcode", None) != "55P03":
                raise
            logger.warning(f"{', '.join(views)}: in use, swapping again in 30 s ({attempt} of {SWAP_TRIES})")
            time.sleep(30)


def build_views(engine: Engine) -> list[str]:
    """Builds the views whose file changed or that don't exist yet. Returns the files built."""
    stamps = built_stamps(engine)
    todo = []
    for file_name in VIEW_FILES:
        sql = (QUERIES / file_name).read_text(encoding="utf-8")
        views = views_of(sql)
        if not views:
            raise ValueError(f"{file_name} creates no view in {SCHEMA}")
        stamp = stamp_of(file_name, sql)
        if all(stamps.get(view) == stamp for view in views):
            continue
        reason = (
            "new"
            if any(view not in stamps for view in views)
            else "built without stamp"
            if any(stamps[view] is None for view in views)
            else "file changed"
        )
        todo.append((file_name, sql, views, stamp, reason))

    if not todo:
        logger.info(f"All {len(VIEW_FILES)} files' views are up to date")
        return []

    with engine.connect() as lock:
        lock.execution_options(isolation_level="AUTOCOMMIT")  # the lock is the session's: no transaction left open
        if not lock.execute(text("SELECT pg_try_advisory_lock(:key)"), {"key": RUN_LOCK}).scalar():
            raise RuntimeError("another run of transform.py is building views in this database: let it finish first")
        try:
            with engine.begin() as conn:
                # Whatever a broken earlier run left there
                conn.execute(text(f"DROP SCHEMA IF EXISTS {STAGING} CASCADE"))
                conn.execute(text(f"CREATE SCHEMA {STAGING}"))
            for file_name, sql, views, stamp, reason in todo:
                start = time.perf_counter()
                logger.info(f"{file_name} ({reason}): building {', '.join(views)}")
                with engine.begin() as conn:
                    conn.execute(text(staged(sql, views)))
                swap(engine, views, stamp)
                with engine.begin() as conn:
                    for view in views:
                        conn.execute(text(f"ANALYZE {SCHEMA}.{view}"))  # statistics for the query planner
                logger.info(f"{file_name}: live in {time.perf_counter() - start:.0f} s")
            with engine.begin() as conn:
                conn.execute(text(f"DROP SCHEMA IF EXISTS {STAGING} CASCADE"))
        finally:
            lock.execute(text("SELECT pg_advisory_unlock(:key)"), {"key": RUN_LOCK})
    return [file_name for file_name, *_ in todo]


if __name__ == "__main__":
    setup_logging()
    started = time.perf_counter()
    built = build_views(engine)
    logger.info(f"{len(built)} of {len(VIEW_FILES)} files built in {(time.perf_counter() - started) / 60:.1f} min")
