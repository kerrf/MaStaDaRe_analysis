"""
Nightly update: bring the raw tables up to date with the MaStR API.

db_migrate builds the raw tables from the bulk export, this job keeps them current. For every unit type it
1. starts at the beginning of the day of the newest DatumLetzteAktualisierung in the table,
2. lists every unit changed since then (including new grid operator checks, which don't change that date)
   and fetches all of their fields (1 API call per unit),
3. translates them into the export's format (codes.encode) and upserts them into the table.

Starting at the beginning of that day re-fetches units the table already has. They have to come back identical,
which tests the whole chain (API -> format -> database) on every run: the sanity check in the log.

    cd backend
    uv run python -m app.etl.update

On the server it runs every night at 1:00 (deploy/mastr-update.timer).
"""

import csv
import io
import sys
import time
from collections.abc import Iterable, Iterator
from dataclasses import dataclass
from datetime import datetime
from logging import getLogger

from sqlalchemy import Connection, text
from sqlalchemy.engine import Engine

from app.codes import SOLAR, STORAGE, WIND, CodeSpec, encode
from app.etl.db_migrate import connect_to_db, copy_chunk, raw_table, table_columns
from app.etl.extract import Chunk
from app.etl.mastr_api import MastrApi
from app.services.logger import setup_logging

logger = getLogger(__name__)

QUOTA_RESERVE = 1_000  # API calls left over for anything else on the same day
PROGRESS_EVERY = 5_000  # units between two progress lines


@dataclass(frozen=True)
class UnitType:
    table: str  # in the raw schema
    energietraeger: str  # what the list calls filter by
    einheittyp: str
    detail_call: str
    spec: CodeSpec  # how the API's format differs from the export's


UNIT_TYPES = (
    UnitType("wind_units", "Wind", "Windeinheit", "GetEinheitWind", WIND),
    UnitType("storage_units", "Speicher", "Stromspeichereinheit", "GetEinheitStromSpeicher", STORAGE),
    UnitType("solar_units", "SolareStrahlungsenergie", "Solareinheit", "GetEinheitSolar", SOLAR),
)

# A unit is unchanged if both dates are: the grid operator's check doesn't move DatumLetzteAktualisierung
CHANGE_DATES = ("DatumLetzteAktualisierung", "NetzbetreiberpruefungDatum")


def update(unit_type: UnitType, api: MastrApi, engine: Engine) -> None:
    """Upsert every unit changed since the start of the day of the newest unit in the table."""
    table = unit_type.table
    with engine.connect() as conn:
        newest = newest_change(conn, table)
        columns = table_columns(conn, table)
    since = newest.replace(hour=0, minute=0, second=0, microsecond=0)
    until = api.server_time()  # what changes from now on is the next run's job
    changed = api.changed_units(unit_type.energietraeger, unit_type.einheittyp, since)
    logger.info(f"{table}: {len(changed):,} units changed since {since:%Y-%m-%d} (newest in the table: {newest:%Y-%m-%d %H:%M})")

    ids = sorted(changed, key=changed.get)  # oldest change first
    budget = calls_left(api)
    if len(ids) > budget:  # e.g. after the server was down for weeks: catch up over several nights
        until = changed[ids[budget]]
        ids = ids[:budget]
        logger.warning(f"{table}: only {budget:,} API calls left today, fetching the changes before {until:%Y-%m-%d %H:%M}. The next run continues from there.")

    chunk = to_chunk(fetch(api, unit_type, ids, until), columns)
    if chunk:
        with engine.begin() as conn:
            load(conn, table, chunk, unit_type.spec)


def newest_change(conn: Connection, table_name: str) -> datetime:
    newest = conn.execute(text(f'SELECT max("DatumLetzteAktualisierung") FROM {raw_table(table_name)}')).scalar()
    if newest is None:
        raise RuntimeError(f"{raw_table(table_name)} is empty, build it from the bulk export first (db_migrate)")
    return newest


def calls_left(api: MastrApi) -> int:
    used, limit = api.quota()
    if limit < 0:  # the API's way of saying the account has no limit
        return sys.maxsize
    return max(limit - used - QUOTA_RESERVE, 0)


def fetch(api: MastrApi, unit_type: UnitType, ids: list[str], until: datetime) -> Iterator[dict[str, str | None]]:
    """All fields of the units, in the export's format. Units that changed again after `until` wait for the next run,
    so the newest date in the table never gets ahead of a change that wasn't fetched yet."""
    table = unit_type.table
    gone, later = 0, 0
    start = time.perf_counter()
    for i, unit in enumerate(api.details(unit_type.detail_call, ids), start=1):
        if unit is None:
            gone += 1
        elif unit["DatumLetzteAktualisierung"] >= until:
            later += 1
        else:
            yield encode(unit, unit_type.spec)
        if i % PROGRESS_EVERY == 0:
            logger.info(f"{table}: {i:,} / {len(ids):,} units fetched")

    logger.info(f"{table}: fetched {len(ids):,} units in {time.perf_counter() - start:.0f} s")
    if gone:
        logger.warning(f"{table}: {gone:,} listed units are no longer in the register")
    if later:
        logger.info(f"{table}: {later:,} units changed again during the run, the next run takes them")


def to_chunk(rows: Iterable[dict[str, str | None]], columns_in_table: set[str]) -> Chunk | None:
    """The rows as CSV for COPY, written as they come in: a fraction of the memory the dicts would need.

    Only the table's columns the API delivers. The others (e.g. AnschlussAnHoechstOderHochSpannung) keep their values.
    """
    buffer = io.StringIO()
    writer = csv.writer(buffer, lineterminator="\n")
    columns, count = (), 0
    for row in rows:
        if not columns:
            columns = tuple(column for column in row if column in columns_in_table)
        writer.writerow([row[column] for column in columns])
        count += 1
    return Chunk(columns, buffer.getvalue().encode(), count) if count else None


def load(conn: Connection, table_name: str, chunk: Chunk, spec: CodeSpec) -> None:
    """Upsert the rows through a staging table, which also lets the database compare them with what it has."""
    conn.execute(text(f"CREATE TEMP TABLE staging (LIKE {raw_table(table_name)}) ON COMMIT DROP"))  # same column types
    copy_chunk(conn, "staging", chunk)
    check(conn, table_name, chunk.columns, spec.multi)
    upsert(conn, table_name, chunk.columns)


def check(conn: Connection, table_name: str, columns: tuple[str, ...], multi: frozenset[str]) -> None:
    """Sort the fetched units into new / changed / unchanged and check that the unchanged ones are identical.

    Unchanged (same dates as in the table) means the API must return exactly what the table holds.
    A difference points at the translation into the export's format, or at the register itself.
    """
    unchanged = " AND ".join(f'staged."{date}" IS NOT DISTINCT FROM stored."{date}"' for date in CHANGE_DATES)
    per_column = []
    for column in columns:
        differs = f"{unchanged} AND {comparable('staged', column, multi)} IS DISTINCT FROM {comparable('stored', column, multi)}"
        per_column.append(f'count(*) FILTER (WHERE {differs}), min("EinheitMastrNummer") FILTER (WHERE {differs})')
    total, new, same, *differences = conn.execute(text(f"""
        SELECT count(*), count(*) FILTER (WHERE stored."EinheitMastrNummer" IS NULL), count(*) FILTER (WHERE {unchanged}),
               {", ".join(per_column)}
        FROM staging AS staged LEFT JOIN {raw_table(table_name)} AS stored USING ("EinheitMastrNummer")
    """)).one()
    logger.info(f"{table_name}: {new:,} new, {total - new - same:,} changed, {same:,} unchanged units")

    mismatches = [
        f"{column} ({n:,}, e.g. {example})"
        for column, n, example in zip(columns, differences[::2], differences[1::2])
        if n
    ]
    if mismatches:
        logger.warning(f"{table_name}: sanity check: unchanged units differ from the table in {', '.join(mismatches)}")
    elif same:
        logger.info(f"{table_name}: sanity check passed, all {same:,} unchanged units came back identical")
    else:
        logger.warning(f"{table_name}: no sanity check, none of the fetched units was unchanged")


def comparable(alias: str, column: str, multi: frozenset[str]) -> str:
    value = f'{alias}."{column}"'
    if column in multi:  # same codes, different order: the export keeps the order they were entered in, the API sorts
        return f"ARRAY(SELECT unnest(string_to_array({value}, ', ')) ORDER BY 1)"
    return value


def upsert(conn: Connection, table_name: str, columns: tuple[str, ...]) -> None:
    """Insert new units, overwrite changed ones. Identical rows are left alone (no needless writes)."""
    names = ", ".join(f'"{column}"' for column in columns)
    new_values = ", ".join(f'EXCLUDED."{column}"' for column in columns)
    written = conn.execute(text(f"""
        INSERT INTO {raw_table(table_name)} AS stored ({names}) SELECT {names} FROM staging
        ON CONFLICT ("EinheitMastrNummer") DO UPDATE SET ({names}) = ({new_values})
        WHERE ({", ".join(f'stored."{column}"' for column in columns)}) IS DISTINCT FROM ({new_values})
    """)).rowcount
    logger.info(f"{table_name}: {written:,} rows inserted or updated")


if __name__ == "__main__":
    setup_logging()
    started = time.perf_counter()

    api = MastrApi()
    engine = connect_to_db()
    used_before, limit = api.quota()
    logger.info(f"Update started, {used_before:,} of {limit:,} API calls used today")

    failed = []
    for unit_type in UNIT_TYPES:
        try:
            update(unit_type, api, engine)
        except Exception:  # one broken unit type shouldn't stop the others
            logger.exception(f"{unit_type.table}: update failed")
            failed.append(unit_type.table)

    used_after, _ = api.quota()
    summary = f"in {(time.perf_counter() - started) / 60:.1f} min, {used_after - used_before:,} API calls"
    if failed:
        logger.error(f"Update FAILED for {', '.join(failed)} {summary}")
        sys.exit(1)
    logger.info(f"Update done {summary}")
