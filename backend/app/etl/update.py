"""
Nightly update: bring the raw tables up to date with the MaStR API.

db_migrate builds the raw tables from the bulk export, this job keeps them current, solar first (it has by far the most
changes). For every unit type it
1. lists the units changed since the day up to which the table is complete (meta.sync_state), including new grid
   operator checks, which don't change a unit's own date. List calls are cheap: 2,000 units each.
2. sorts them (sync.triage) into new units, changed units, and units the table has in that version already. Those need
   no detail call, which saves almost all of them.
3. fetches the new units of every type first, then the changed ones (1 API call per unit), translates them into the
   format of the raw tables (codes.encode: the export's, with the texts of its codes) and upserts them, 5,000 at a time:
   an interruption loses one slice at most.
4. notes up to when the table is complete. When the API quota cuts a run short, the next one continues there.

Storage units have no capacity: the register keeps it on their Speicheranlage (raw.storage_plants). With the new units
the job fetches the plants still missing, with the changed units their plants (1 API call per plant, GetStromSpeicher),
and upserts them the same way. Gas storage units and their Gasspeicher (raw.gas_storage_plants, GetGasSpeicher)
likewise, and the EEG and KWK plants of biomass, combustion and geothermal units (raw.biomass_eeg_plants,
geothermal_eeg_plants, kwk_plants: GetAnlageEeg…, GetAnlageKwk). The plant of a brand-new unit is sometimes not published
yet ("Objekt nicht gefunden"): every run tries again.

Gas producers and gas storage units come from one list call, told apart by their Einheittyp. Like the export, the gas
producer table also lists the gas storage units (their general fields): the job copies them over from the storage units.
The units of many Energieträger (biomass, combustion, nuclear, geothermal) are listed by their type instead.

Then the Netzanschlüsse: the Netzanschlusspunkte changed since the table is complete come from one list call with all
their fields (2,000 per call, no detail calls); the grid operators changed since, and those a point names that the
table doesn't have yet, one call each (GetMarktakteur). Both are upserted like the units.

A table that isn't in the database yet (loaded from the bulk export: db_migrate, deploy/push_raw_tables.sh) is skipped
with a warning.

Every run also re-fetches a few units the table has (SANITY_SAMPLE per type). They have to come back identical, which
tests the whole chain (API -> format -> database): the sanity check in the log.

Afterwards it refreshes the dashboard's materialized views (schema mrt), so the website shows the new data. If nothing
failed, it notes the Datenstand in meta.update_runs: the day up to which the data includes every change of the register.
The API serves it (GET /meta/datenstand), the website shows it.

    cd backend
    uv run python -m app.etl.update             # --dry-run: only list and sort the changes, no detail calls, no writes

On the server it runs every night at 1:00 (deploy/mastr-update.timer).
"""

import argparse
import csv
import io
import random
import sys
import time
from collections.abc import Iterable, Iterator
from dataclasses import dataclass
from datetime import date, datetime
from logging import getLogger

from sqlalchemy import Connection, text
from sqlalchemy.engine import Engine

from app.codes import (
    BIOMASS,
    BIOMASS_EEG_PLANT,
    COMBUSTION,
    GAS_PRODUCER,
    GAS_STORAGE,
    GAS_STORAGE_PLANT,
    GEOTHERMAL,
    GEOTHERMAL_EEG_PLANT,
    GRID_CONNECTION_POINT_LIST,
    GRID_OPERATOR,
    KWK_PLANT,
    MARKTFUNKTIONEN,
    NUCLEAR,
    SEPARATOR,
    SOLAR,
    STORAGE,
    STORAGE_PLANT,
    WATER,
    WIND,
    CodeSpec,
    encode,
)
from app.etl.db_migrate import connect_to_db, copy_chunk, raw_table, table_columns
from app.etl.extract import Chunk
from app.etl.mastr_api import MastrApi
from app.etl.sync import Todo, triage
from app.services.logger import setup_logging

logger = getLogger(__name__)

QUOTA_RESERVE = 1_000  # API calls left over for anything else on the same day
PROGRESS_EVERY = 5_000  # units between two progress lines
SLICE = 5_000  # units fetched and upserted together: an interruption loses one slice at most
SANITY_SAMPLE = 25  # units the table has, re-fetched per type: they must come back identical


@dataclass(frozen=True)
class UnitType:
    table: str  # in the raw schema
    energietraeger: str | None  # what the power units' list call filters by; None: a gas unit type or by_type
    einheittyp: str
    detail_call: str
    spec: CodeSpec  # how the API's format differs from the export's
    # Which rows of the table are the type's own (SQL), where the table also holds others
    own_rows: str = "TRUE"
    by_type: bool = False  # listed by its Einheittyp: the types of many Energieträger

    @property
    def list_call(self) -> str:
        """The list call that finds the changed units. The gas list names producers and storage units alike."""
        if self.by_type:
            return "GetListeLetzteAktualisierung"
        return "GetGefilterteListeStromErzeuger" if self.energietraeger else "GetGefilterteListeGasErzeuger"


@dataclass(frozen=True)
class PlantType:
    """The plants (Anlagen) that group units of one type, and hold what the units don't (e.g. the storage capacity)."""

    table: str  # in the raw schema
    unit_column: str  # the units' column naming their plant
    detail_call: str
    spec: CodeSpec
    key: str = "MaStRNummer"  # the plant's number, the table's key
    id_field: str = "speMastrNummer"  # the detail call's parameter for it
    units_field: str = "VerknuepfteEinheit"  # the answer's list of the plant's units


STORAGE_UNITS = UnitType("storage_units", "Speicher", "Stromspeichereinheit", "GetEinheitStromSpeicher", STORAGE)
# The gas producer table also lists the gas storage units (with their SpeicherMaStRNummer), which are copies
GAS_PRODUCERS = UnitType(
    "gas_producer_units",
    None,
    "Gaserzeugungseinheit",
    "GetEinheitGasErzeuger",
    GAS_PRODUCER,
    own_rows='"SpeicherMaStRNummer" IS NULL',
)
GAS_STORAGE_UNITS = UnitType("gas_storage_units", None, "Gasspeichereinheit", "GetEinheitGasSpeicher", GAS_STORAGE)
UNIT_TYPES = (  # in this order; solar first, it has by far the most changes
    UnitType("solar_units", "SolareStrahlungsenergie", "Solareinheit", "GetEinheitSolar", SOLAR),
    UnitType("wind_units", "Wind", "Windeinheit", "GetEinheitWind", WIND),
    UnitType("water_units", "Wasser", "Wasser", "GetEinheitWasser", WATER),
    STORAGE_UNITS,
    GAS_PRODUCERS,
    GAS_STORAGE_UNITS,
    # The other power units, which place the Netzanschlusspunkte of their Lokationen
    UnitType("biomass_units", None, "Biomasse", "GetEinheitBiomasse", BIOMASS, by_type=True),
    UnitType("combustion_units", None, "Verbrennung", "GetEinheitVerbrennung", COMBUSTION, by_type=True),
    UnitType("nuclear_units", None, "Kernenergie", "GetEinheitKernkraft", NUCLEAR, by_type=True),
    # Geothermie, Solarthermie, Grubengas, Klärschlamm and Druckentspannung: one type in the API
    UnitType(
        "geothermal_units",
        None,
        "Geothermie",
        "GetEinheitGeothermieGrubengasDruckentspannung",
        GEOTHERMAL,
        by_type=True,
    ),
)
# The plants of the EEG and of the KWK: the KWK plants group units of three types
KWK_PLANTS = PlantType(
    "kwk_plants",
    "KwkMaStRNummer",
    "GetAnlageKwk",
    KWK_PLANT,
    key="KwkMastrNummer",
    id_field="kwkMastrNummer",
    units_field="VerknuepfteEinheiten",
)
EEG_PLANT = {"unit_column": "EegMaStRNummer", "key": "EegMaStRNummer", "id_field": "eegMastrNummer"}
# unit table -> the plants of its units
PLANT_TYPES = {
    STORAGE_UNITS.table: (PlantType("storage_plants", "SpeMastrNummer", "GetStromSpeicher", STORAGE_PLANT),),
    GAS_STORAGE_UNITS.table: (
        PlantType("gas_storage_plants", "SpeicherMaStRNummer", "GetGasSpeicher", GAS_STORAGE_PLANT),
    ),
    "biomass_units": (
        PlantType("biomass_eeg_plants", detail_call="GetAnlageEegBiomasse", spec=BIOMASS_EEG_PLANT, **EEG_PLANT),
        KWK_PLANTS,
    ),
    "combustion_units": (KWK_PLANTS,),
    "geothermal_units": (
        PlantType(
            "geothermal_eeg_plants",
            detail_call="GetAnlageEegGeothermieGrubengasDruckentspannung",
            spec=GEOTHERMAL_EEG_PLANT,
            **EEG_PLANT,
        ),
        KWK_PLANTS,
    ),
}
UNIT_KEY = "EinheitMastrNummer"


@dataclass(frozen=True)
class Table:
    """A table the update keeps current that holds no units: its key and the date of a row's last change."""

    name: str  # in the raw schema
    key: str
    changed: str
    spec: CodeSpec


POINTS = Table("grid_connection_points", "NetzanschlusspunktMastrNummer", "LetzteAenderung", GRID_CONNECTION_POINT_LIST)
# sic, the Marktakteure's date drops the "t"
OPERATORS = Table("grid_operators", "MastrNummer", "DatumLetzeAktualisierung", GRID_OPERATOR)
# The Marktfunktionen of the grid operators the table holds (db_migrate.ROW_FILTERS), as the API names them, and their
# texts in the table (Marktfunktionen.xml: 1, 8)
GRID_OPERATOR_FUNCTIONS = ("Stromnetzbetreiber", "Gasnetzbetreiber")
GRID_OPERATOR_TEXTS = (MARKTFUNKTIONEN[1], MARKTFUNKTIONEN[8])
# What the export leaves out of the gas storage units it lists among the gas producers
GAS_STORAGE_ADDRESS = (
    "Strasse",
    "StrasseNichtGefunden",
    "Hausnummer",
    "Hausnummer_nv",
    "HausnummerNichtGefunden",
    "Adresszusatz",
    "Gemarkung",
    "FlurFlurstuecknummern",
    "Laengengrad",
    "Breitengrad",
)
DASHBOARD_SCHEMA = "mrt"  # the materialized views the API serves
LOAD_HINT = "(load it from the bulk export: db_migrate, or deploy/push_raw_tables.sh on the server)"

# A row is unchanged if these dates are (those the table has): the grid operator's check doesn't move
# DatumLetzteAktualisierung
CHANGE_DATES = ("DatumLetzteAktualisierung", "NetzbetreiberpruefungDatum")


def plan(unit_type: UnitType, api: MastrApi, engine: Engine) -> Todo:
    """List the units changed since the day up to which the table is complete, and sort them into new, changed and
    those the table has already. Listing from the start of that day costs a few list calls and gives the sanity check
    units to compare."""
    table = unit_type.table
    with engine.connect() as conn:
        complete = read_synced_until(conn, unit_type)
    since = complete.replace(hour=0, minute=0, second=0, microsecond=0)
    until = api.server_time()  # what changes from now on is the next run's job
    listed = api.changed_units(unit_type.einheittyp, since, unit_type.list_call, unit_type.energietraeger)
    with engine.connect() as conn:
        stored = dict(
            conn.execute(
                text(
                    f'SELECT "{UNIT_KEY}", "DatumLetzteAktualisierung" FROM {raw_table(table)} WHERE "{UNIT_KEY}" = ANY(:ids)'
                ),
                {"ids": list(listed)},
            ).all()
        )
    todo = triage(listed, stored, complete, until)
    logger.info(
        f"{table}: {len(listed):,} units changed since {since:%Y-%m-%d} (complete up to {complete:%Y-%m-%d %H:%M}): "
        f"{len(todo.new):,} new, {len(todo.changed):,} changed, {len(todo.up_to_date):,} up to date already"
    )
    return todo


def fetch_and_load(
    unit_type: UnitType, todo: Todo, units: list[str], api: MastrApi, engine: Engine, sample: list[str] | None = None
) -> None:
    """Fetch `units` in this order, as far as the API quota allows, and upsert them slice by slice, noting after each
    one up to when the table is complete. `sample`: units the table has, re-fetched for the sanity check."""
    table, sample = unit_type.table, sample or []
    budget = calls_left(api)
    if len(units) + len(sample) > budget:
        sample = []  # the sanity check goes first
        if len(units) > budget:  # e.g. after the server was down for weeks: catch up over several nights
            logger.warning(
                f"{table}: only {budget:,} API calls left today, fetching {budget:,} of {len(units):,} units. The next run continues with the rest."
            )
            units = units[:budget]
    with engine.connect() as conn:
        columns = table_columns(conn, table)

    ids, in_sample = [*units, *sample], set(sample)
    for start in range(0, len(ids), SLICE):
        part = ids[start : start + SLICE]
        chunk = to_chunk(fetch(api, unit_type, part, todo.until), columns)
        if chunk:
            with engine.begin() as conn:
                load(conn, table, chunk, unit_type.spec, UNIT_KEY, sanity=not in_sample.isdisjoint(part))
        todo.done.update(part)
        save_synced_until(engine, table, todo.synced_until())
    save_synced_until(engine, table, todo.synced_until())  # also when there was nothing to fetch


def update_plants(
    unit_type: UnitType,
    plants: PlantType,
    api: MastrApi,
    engine: Engine,
    units: list[str] | None = None,
    sample: list[str] | None = None,
) -> None:
    """Upsert plants: without `units` those still missing for a unit (the new units' plants among them), else the plants
    of `units`. `sample`: units whose plants are re-fetched for the sanity check."""
    table, unit_column, key, sample = plants.table, plants.unit_column, plants.key, sample or []
    which = f'plant."{key}" IS NULL' if units is None else f'unit."{UNIT_KEY}" = ANY(:units)'
    with engine.connect() as conn:
        columns = table_columns(conn, table)
        ids = (
            conn.execute(
                text(f"""
            SELECT DISTINCT unit."{unit_column}"
            FROM {raw_table(unit_type.table)} AS unit
            LEFT JOIN {raw_table(table)} AS plant ON plant."{key}" = unit."{unit_column}"
            WHERE unit."{unit_column}" IS NOT NULL AND ({which})
            ORDER BY 1
        """),
                {"units": [*(units or []), *sample]},
            )
            .scalars()
            .all()
        )
    logger.info(
        f"{table}: {len(ids):,} plants {'still missing for a unit' if units is None else 'of the changed units'}"
    )

    budget = calls_left(api)
    if len(ids) > budget:  # the missing ones come again next night
        logger.warning(f"{table}: only {budget:,} API calls left today, fetching {budget:,} of {len(ids):,} plants")
        ids = ids[:budget]

    chunk = to_chunk(fetch_plants(api, plants, ids), columns)
    if chunk:
        with engine.begin() as conn:
            load(conn, table, chunk, plants.spec, key, sanity=bool(sample))


def update_points(api: MastrApi, engine: Engine) -> datetime:
    """Upsert the Netzanschlusspunkte changed since the day up to which the table is complete: one list call has all
    their fields (2,000 per call), no detail calls. Points the register deleted stay: the list only names those there
    are. Returns up to when the table is complete now."""
    with engine.connect() as conn:
        complete = read_table_synced_until(conn, POINTS)
        columns = table_columns(conn, POINTS.name)
    since = complete.replace(hour=0, minute=0, second=0, microsecond=0)
    until = api.server_time()  # what changes from now on is the next run's job
    rows = [encode(point, POINTS.spec) for point in api.changed_points(since)]
    logger.info(f"{POINTS.name}: {len(rows):,} points changed since {since:%Y-%m-%d}")
    for start in range(0, len(rows), 10 * SLICE):
        chunk = to_chunk(rows[start : start + 10 * SLICE], columns)
        if chunk:
            with engine.begin() as conn:
                load(conn, POINTS.name, chunk, POINTS.spec, POINTS.key, sanity=False, dates=(POINTS.changed,))
    save_synced_until(engine, POINTS.name, until)
    return until


def update_operators(api: MastrApi, engine: Engine) -> datetime:
    """Upsert the grid operators changed since the day up to which the table is complete, and those a
    Netzanschlusspunkt names that the table doesn't have yet (1 API call each, a few a day). Returns up to when the
    table is complete now."""
    with engine.connect() as conn:
        complete = read_table_synced_until(conn, OPERATORS)
        columns = table_columns(conn, OPERATORS.name)
        missing = []
        if exists(engine, POINTS.name):
            missing = (
                conn.execute(
                    text(f"""
                SELECT DISTINCT point."NetzbetreiberMaStRNummer"
                FROM {raw_table(POINTS.name)} AS point
                WHERE point."NetzbetreiberMaStRNummer" IS NOT NULL AND NOT EXISTS (
                    SELECT FROM {raw_table(OPERATORS.name)} AS operator
                    WHERE operator."{OPERATORS.key}" = point."NetzbetreiberMaStRNummer"
                )
            """)
                )
                .scalars()
                .all()
            )
    since = complete.replace(hour=0, minute=0, second=0, microsecond=0)
    until = api.server_time()
    changed = api.changed_grid_operators(since, GRID_OPERATOR_FUNCTIONS)
    ids = sorted(set(changed) | set(missing))
    logger.info(
        f"{OPERATORS.name}: {len(changed):,} grid operators changed since {since:%Y-%m-%d}, "
        f"{len(missing):,} named by a Netzanschlusspunkt but not in the table"
    )
    if len(ids) > calls_left(api):
        raise RuntimeError(
            f"{OPERATORS.name}: only {calls_left(api):,} API calls left today for {len(ids):,} operators"
        )

    rows = []
    for mastr_nummer in ids:
        actor = api.grid_operator(mastr_nummer)
        if actor is None:
            continue
        row = encode(actor, OPERATORS.spec)
        if row.get("Marktfunktion") in GRID_OPERATOR_TEXTS:  # the grid operators, like db_migrate.ROW_FILTERS
            rows.append(row)
    chunk = to_chunk(rows, columns)
    if chunk:
        with engine.begin() as conn:
            load(conn, OPERATORS.name, chunk, OPERATORS.spec, OPERATORS.key, sanity=False, dates=(OPERATORS.changed,))
    save_synced_until(engine, OPERATORS.name, until)
    return until


def copy_gas_storage_units(engine: Engine) -> None:
    """The export lists the gas storage units among the gas producers too, with their general fields, their name as
    NameGaserzeugungseinheit and their SpeicherMaStRNummer, but without address and coordinates: keep those rows the
    same as in raw.gas_storage_units."""
    producers, storages = GAS_PRODUCERS.table, GAS_STORAGE_UNITS.table
    with engine.begin() as conn:
        shared = sorted(table_columns(conn, producers) & table_columns(conn, storages) - set(GAS_STORAGE_ADDRESS))
        columns = [*shared, "NameGaserzeugungseinheit"]
        names = ", ".join(f'"{column}"' for column in columns)
        values = ", ".join([*(f'"{column}"' for column in shared), '"NameGasspeicher"'])
        new_values = ", ".join(f'EXCLUDED."{column}"' for column in columns)
        written = conn.execute(
            text(f"""
            INSERT INTO {raw_table(producers)} AS stored ({names}) SELECT {values} FROM {raw_table(storages)}
            ON CONFLICT ("{UNIT_KEY}") DO UPDATE SET ({names}) = ({new_values})
            WHERE ({", ".join(f'stored."{column}"' for column in columns)}) IS DISTINCT FROM ({new_values})
        """)
        ).rowcount
    logger.info(f"{producers}: {written:,} gas storage units copied over from {storages}")


def exists(engine: Engine, table_name: str) -> bool:
    with engine.connect() as conn:
        return conn.execute(text("SELECT to_regclass(:table)"), {"table": raw_table(table_name)}).scalar() is not None


def newest_change(
    conn: Connection, table_name: str, own_rows: str = "TRUE", column: str = "DatumLetzteAktualisierung"
) -> datetime:
    newest = conn.execute(text(f'SELECT max("{column}") FROM {raw_table(table_name)} WHERE {own_rows}')).scalar()
    if newest is None:
        raise RuntimeError(f"{raw_table(table_name)} is empty, build it from the bulk export first (db_migrate)")
    return newest


def read_synced_until(conn: Connection, unit_type: UnitType) -> datetime:
    """Every change of the register before this time is in the table (register time, like its dates). Until a run has
    noted it: the newest change in the table, as far as the bulk export or the runs before this bookkeeping got."""
    return noted_synced_until(conn, unit_type.table) or newest_change(conn, unit_type.table, unit_type.own_rows)


def read_table_synced_until(conn: Connection, table: Table) -> datetime:
    """The same for a table without units, by its own date column."""
    return noted_synced_until(conn, table.name) or newest_change(conn, table.name, column=table.changed)


def noted_synced_until(conn: Connection, table_name: str) -> datetime | None:
    if conn.execute(text("SELECT to_regclass('meta.sync_state')")).scalar() is None:
        return None
    return conn.execute(
        text("SELECT synced_until FROM meta.sync_state WHERE table_name = :table"), {"table": table_name}
    ).scalar()


def save_synced_until(engine: Engine, table_name: str, synced_until: datetime) -> None:
    with engine.begin() as conn:
        conn.execute(text("CREATE SCHEMA IF NOT EXISTS meta"))
        conn.execute(
            text("""
            CREATE TABLE IF NOT EXISTS meta.sync_state (
                table_name text PRIMARY KEY,
                synced_until timestamp NOT NULL,  -- register time: every change before it is in the table
                saved_at timestamptz NOT NULL DEFAULT now()
            )
        """)
        )
        conn.execute(
            text("""
            INSERT INTO meta.sync_state (table_name, synced_until) VALUES (:table, :until)
            ON CONFLICT (table_name) DO UPDATE SET synced_until = EXCLUDED.synced_until, saved_at = now()
        """),
            {"table": table_name, "until": synced_until},
        )


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


def fetch_plants(api: MastrApi, plants: PlantType, ids: list[str]) -> Iterator[dict[str, str | None]]:
    """All fields of the plants, in the format of the raw tables."""
    table = plants.table
    gone = 0
    start = time.perf_counter()
    for i, plant in enumerate(api.details(plants.detail_call, ids, id_field=plants.id_field), start=1):
        if plant is None:
            gone += 1
        else:
            # The export lists the plant's units as "SEE…, SEE…" (gas: "GEE…, GEE…"), the API as objects
            units = plant.pop(plants.units_field) or []
            plant["VerknuepfteEinheitenMaStRNummern"] = ", ".join(unit["MaStRNummer"] for unit in units) or None
            yield encode(plant, plants.spec)
        if i % PROGRESS_EVERY == 0:
            logger.info(f"{table}: {i:,} / {len(ids):,} plants fetched")

    logger.info(f"{table}: fetched {len(ids):,} plants in {time.perf_counter() - start:.0f} s")
    if gone:
        logger.warning(f"{table}: {gone:,} plants of units are not in the register")


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


def load(
    conn: Connection,
    table_name: str,
    chunk: Chunk,
    spec: CodeSpec,
    key: str,
    *,
    sanity: bool,
    dates: tuple[str, ...] = CHANGE_DATES,
) -> None:
    """Upsert the rows through a staging table, which also lets the database compare them with what it has.
    key: the table's primary key (EinheitMastrNummer, for plants their number). sanity: rows for the sanity check are in.
    dates: the columns that say a row changed (units: their own date and the grid operator's check)."""
    conn.execute(text(f"CREATE TEMP TABLE staging (LIKE {raw_table(table_name)}) ON COMMIT DROP"))  # same column types
    copy_chunk(conn, "staging", chunk)
    check(conn, table_name, chunk.columns, spec, key, sanity, dates)
    upsert(conn, table_name, chunk.columns, key)


def check(
    conn: Connection,
    table_name: str,
    columns: tuple[str, ...],
    spec: CodeSpec,
    key: str,
    sanity: bool,
    dates: tuple[str, ...] = CHANGE_DATES,
) -> None:
    """Sort the fetched units into new / changed / unchanged and check that the unchanged ones are identical.

    Unchanged (same dates as in the table) means the API must return exactly what the table holds.
    A difference points at the translation into the tables' format (codes.encode), or at the register itself.
    sanity: the rows include units re-fetched for this check, so some should be unchanged.
    """
    dates = [date for date in dates if date in columns]
    unchanged = " AND ".join(f'staged."{date}" IS NOT DISTINCT FROM stored."{date}"' for date in dates)
    per_column = []
    for column in columns:
        differs = f"{unchanged} AND {comparable('staged', column, spec)} IS DISTINCT FROM {comparable('stored', column, spec)}"
        per_column.append(f'count(*) FILTER (WHERE {differs}), min("{key}") FILTER (WHERE {differs})')
    total, new, same, *differences = conn.execute(
        text(f"""
        SELECT count(*), count(*) FILTER (WHERE stored."{key}" IS NULL), count(*) FILTER (WHERE {unchanged}),
               {", ".join(per_column)}
        FROM staging AS staged LEFT JOIN {raw_table(table_name)} AS stored USING ("{key}")
    """)
    ).one()
    logger.info(f"{table_name}: {new:,} new, {total - new - same:,} changed, {same:,} unchanged rows")

    mismatches = [
        f"{column} ({n:,}, e.g. {example})"
        for column, n, example in zip(columns, differences[::2], differences[1::2])
        if n
    ]
    if mismatches:
        logger.warning(f"{table_name}: sanity check: unchanged units differ from the table in {', '.join(mismatches)}")
    elif same:
        logger.info(f"{table_name}: sanity check passed, all {same:,} unchanged rows came back identical")
    elif sanity:
        logger.warning(f"{table_name}: no sanity check, none of the fetched rows was unchanged")


def comparable(alias: str, column: str, spec: CodeSpec) -> str:
    value = f'{alias}."{column}"'
    # Same values in another order: the export keeps the order they were entered in, the API sorts. The texts of several
    # codes ("…; …"), or numbers of units ("SEE…, SEE…")
    if column in spec.multi:
        separator = SEPARATOR if column in spec.columns else ", "
        return f"ARRAY(SELECT unnest(string_to_array({value}, '{separator}')) ORDER BY 1)"
    return value


def upsert(conn: Connection, table_name: str, columns: tuple[str, ...], key: str) -> None:
    """Insert new rows, overwrite changed ones. Identical rows are left alone (no needless writes)."""
    names = ", ".join(f'"{column}"' for column in columns)
    new_values = ", ".join(f'EXCLUDED."{column}"' for column in columns)
    written = conn.execute(
        text(f"""
        INSERT INTO {raw_table(table_name)} AS stored ({names}) SELECT {names} FROM staging
        ON CONFLICT ("{key}") DO UPDATE SET ({names}) = ({new_values})
        WHERE ({", ".join(f'stored."{column}"' for column in columns)}) IS DISTINCT FROM ({new_values})
    """)
    ).rowcount
    logger.info(f"{table_name}: {written:,} rows inserted or updated")


def repair_gemeindeschluessel(engine: Engine) -> None:
    """Every Gemeindeschlüssel of the raw tables with 8 digits, as the views need it: they tell Gemeinde, Kreis and Land
    by the key's length, so a key of 5 digits counts twice as its Kreis and breaks their unique indexes (2026-10-21:
    a battery in Leipzig with "14713"). The register has such keys now and then. 5 digits that are a kreisfreie Stadt
    get their Gemeinde ("14713" → "14713000", if geo.gemeinden has it); every other odd key becomes empty: the unit
    still counts for Deutschland, its Land and Kreis only where the views find them. Never fails the update."""
    try:
        with engine.begin() as conn:
            conn.execute(text("SET LOCAL statement_timeout = '15min'"))
            tables = conn.execute(
                text("""
                    SELECT table_name FROM information_schema.columns
                    WHERE table_schema = 'raw' AND column_name = 'Gemeindeschluessel'
                      AND data_type IN ('text', 'character varying')
                    ORDER BY table_name
                """)
            ).scalars()
            for table in list(tables):
                repaired = conn.execute(
                    text(f"""
                        UPDATE {raw_table(table)} SET "Gemeindeschluessel" = (
                            SELECT g.ags FROM geo.gemeinden g
                            WHERE "Gemeindeschluessel" ~ '^[0-9]{{5}}$' AND g.ags = "Gemeindeschluessel" || '000'
                        )
                        WHERE "Gemeindeschluessel" !~ '^[0-9]{{8}}$'
                    """)
                ).rowcount
                if repaired:
                    logger.warning(f"{table}: {repaired:,} Gemeindeschlüssel without 8 digits repaired or emptied")
    except Exception:
        logger.exception("Repairing the Gemeindeschlüssel failed: the views may refuse odd keys")


def refresh_views(engine: Engine) -> list[str]:
    """Recompute the dashboard's materialized views from the updated tables. They read the raw and geo tables only,
    so the order doesn't matter. (transform.py builds them, with every deploy whose SQL changed.) Returns the failed ones."""
    with engine.connect() as conn:
        views = (
            conn.execute(
                text("SELECT matviewname FROM pg_matviews WHERE schemaname = :schema ORDER BY 1"),
                {"schema": DASHBOARD_SCHEMA},
            )
            .scalars()
            .all()
        )
    failed = []
    for view in views:
        name = f'{DASHBOARD_SCHEMA}."{view}"'
        start = time.perf_counter()
        try:
            with engine.begin() as conn:
                conn.execute(text(f"REFRESH MATERIALIZED VIEW {name}"))
        except Exception:  # the other views still get the new data
            logger.exception(f"{name}: refresh failed")
            failed.append(name)
            continue
        logger.info(f"{name}: refreshed in {time.perf_counter() - start:.0f} s")
    return failed


def record_datenstand(engine: Engine, datenstand: date) -> None:
    """Note the day up to which the data includes every change of the register, one row per complete run."""
    with engine.begin() as conn:
        conn.execute(text("CREATE SCHEMA IF NOT EXISTS meta"))
        conn.execute(
            text("""
            CREATE TABLE IF NOT EXISTS meta.update_runs (
                finished_at timestamptz PRIMARY KEY DEFAULT now(),
                datenstand date NOT NULL
            )
        """)
        )
        conn.execute(text("INSERT INTO meta.update_runs (datenstand) VALUES (:datenstand)"), {"datenstand": datenstand})
    logger.info(f"Datenstand {datenstand:%d.%m.%Y} recorded")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Bring the raw tables up to date with the MaStR API.")
    parser.add_argument(
        "--dry-run", action="store_true", help="only list and sort the changes: no detail calls, no writes"
    )
    args = parser.parse_args()

    setup_logging()
    started = time.perf_counter()

    api = MastrApi()
    engine = connect_to_db()
    used_before, limit = api.quota()
    logger.info(f"Update started, {used_before:,} of {limit:,} API calls used today")

    # 1. What changed, per unit type
    failed, todos = [], []  # (unit type, what it needs)
    for unit_type in UNIT_TYPES:
        # Tables that came later: until they are loaded from the bulk export (DEPLOY.md), the update leaves them out.
        # The gas producers and storage units go together, with the storages.
        needed = (unit_type.table,)
        if unit_type in (GAS_PRODUCERS, GAS_STORAGE_UNITS):
            needed = (GAS_PRODUCERS.table, GAS_STORAGE_UNITS.table, PLANT_TYPES[GAS_STORAGE_UNITS.table][0].table)
        missing = [table for table in needed if not exists(engine, table)]
        if missing:
            logger.warning(
                f"{unit_type.table}: raw.{', raw.'.join(missing)} not in the database yet, skipped {LOAD_HINT}"
            )
            continue
        try:
            todos.append((unit_type, plan(unit_type, api, engine)))
        except Exception:  # one broken unit type shouldn't stop the others
            logger.exception(f"{unit_type.table}: listing the changes failed")
            failed.append(unit_type.table)

    if args.dry_run:
        needed = sum(len(todo.new) + len(todo.changed) for _, todo in todos)
        logger.info(
            f"Dry run: {needed:,} units to fetch (plus plants and the Netzanschlüsse, which it doesn't list), "
            f"{calls_left(api):,} API calls left today. Nothing written."
        )
        sys.exit(1 if failed else 0)

    # 2. The new units of every type first, then the changes of units the table has, each with the plants they need.
    #    Plants whose table isn't loaded yet wait for it (the units don't need them).
    missing = sorted(
        {plants.table for kinds in PLANT_TYPES.values() for plants in kinds if not exists(engine, plants.table)}
    )
    for table in missing:
        logger.warning(f"{table}: raw.{table} not in the database yet, skipped {LOAD_HINT}")
    plant_types = {
        table: tuple(plants for plants in kinds if plants.table not in missing) for table, kinds in PLANT_TYPES.items()
    }
    for batch in ("new", "changed"):
        for unit_type, todo in todos:
            table = unit_type.table
            if table in failed:
                continue
            units = todo.new if batch == "new" else todo.changed
            sample = (
                random.sample(todo.up_to_date, min(SANITY_SAMPLE, len(todo.up_to_date))) if batch == "changed" else []
            )
            try:
                fetch_and_load(unit_type, todo, units, api, engine, sample)
            except Exception:
                logger.exception(f"{table}: update failed")
                failed.append(table)
                continue
            for plants in plant_types.get(table, ()):
                if plants.table in failed:
                    continue
                try:
                    if batch == "new":
                        update_plants(unit_type, plants, api, engine)
                    else:
                        update_plants(
                            unit_type, plants, api, engine, [unit for unit in units if unit in todo.done], sample
                        )
                except Exception:
                    logger.exception(f"{plants.table}: update failed")
                    failed.append(plants.table)

    if any(unit_type is GAS_STORAGE_UNITS for unit_type, _ in todos) and GAS_STORAGE_UNITS.table not in failed:
        try:
            copy_gas_storage_units(engine)
        except Exception:
            logger.exception(f"{GAS_PRODUCERS.table}: copying the gas storage units failed")
            failed.append(GAS_PRODUCERS.table)

    # 3. The Netzanschlusspunkte and their grid operators
    synced = [todo.synced_until() for _, todo in todos]
    for table, update_table in ((POINTS, update_points), (OPERATORS, update_operators)):
        if not exists(engine, table.name):
            logger.warning(f"{table.name}: raw.{table.name} not in the database yet, skipped {LOAD_HINT}")
            continue
        try:
            synced.append(update_table(api, engine))
        except Exception:
            logger.exception(f"{table.name}: update failed")
            failed.append(table.name)

    # Also after a failure: what did update should reach the website – with clean Gemeindeschlüssel
    repair_gemeindeschluessel(engine)
    failed += refresh_views(engine)

    used_after, _ = api.quota()
    summary = f"in {(time.perf_counter() - started) / 60:.1f} min, {used_after - used_before:,} API calls"
    if failed:  # the Datenstand stays at the last complete run
        logger.error(f"Update FAILED for {', '.join(failed)} {summary}")
        sys.exit(1)
    # Usually the start of this run; earlier if the API quota cut it short
    record_datenstand(engine, min(synced).date())
    logger.info(f"Update done {summary}")
