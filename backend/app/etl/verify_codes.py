"""
Check app/codes.py against the live MaStR API.

The bulk export stores catalog fields as numeric codes, the SOAP API returns the decoded values.
For every code found in the database this script picks a few units carrying it, fetches them from
the API and compares: code in the export <-> value in the API.

    cd backend
    uv run python -m app.etl.verify_codes                    # report for solar
    uv run python -m app.etl.verify_codes wind --suggest     # + dict entries for codes missing in codes.py

API answers are cached in data/cache/mastr_api/, so re-runs cost no API calls.
A unit that changed after the export was made (API DatumLetzteAktualisierung newer than the export's)
is not trusted, since its code and its API value may describe different states.
"""

import argparse
import json
import logging
from collections import Counter, defaultdict
from datetime import datetime
from pathlib import Path

from sqlalchemy import text

from app import codes
from app.db.database import engine
from app.etl.mastr_api import MastrApi

log = logging.getLogger(__name__)

CACHE_DIR = Path("data/cache/mastr_api")
SAMPLES_PER_CODE = 3

# unit type -> (table, API detail method, spec from codes.py)
TARGETS = {
    "solar": ("raw.solar_units", "GetEinheitSolar", codes.SOLAR),
    "wind": ("raw.wind_units", "GetEinheitWind", codes.WIND),
    "water": ("raw.water_units", "GetEinheitWasser", codes.WATER),
    "storage": ("raw.storage_units", "GetEinheitStromSpeicher", codes.STORAGE),
    "gas_producer": ("raw.gas_producer_units", "GetEinheitGasErzeuger", codes.GAS_PRODUCER),
    "gas_storage": ("raw.gas_storage_units", "GetEinheitGasSpeicher", codes.GAS_STORAGE),
}


def cached_details(api: MastrApi, method: str, ids: list[str]) -> dict[str, dict | None]:
    """One detail call per unit, cached on disk (datetimes become ISO strings)."""
    cache_file = CACHE_DIR / f"{method}.json"
    cache = json.loads(cache_file.read_text()) if cache_file.exists() else {}
    missing = [nr for nr in ids if nr not in cache]
    if missing:
        log.info("Fetching %d units from the API (%d cached)", len(missing), len(ids) - len(missing))
        answers = api.details(method, missing)
        cache.update((nr, json.loads(json.dumps(answer, default=str))) for nr, answer in zip(missing, answers))
        CACHE_DIR.mkdir(parents=True, exist_ok=True)
        cache_file.write_text(json.dumps(cache, ensure_ascii=False))
    return {nr: cache[nr] for nr in ids}


# -------------------------------------------------------------------------------------- database


def sample_units(table: str, column: str, multi: bool) -> list[tuple[str, str]]:
    """(code, unit) pairs: up to SAMPLES_PER_CODE units per code, least recently updated first."""
    col = f'"{column}"'
    order = '"DatumLetzteAktualisierung", "EinheitMastrNummer"'  # unique order -> same sample on every run
    if multi:  # prefer units with as few codes as possible, they are easiest to match
        code, source = "trim(c)", f"{table}, unnest(string_to_array({col}, ',')) AS c"
        order = f"cardinality(string_to_array({col}, ',')), {order}"
    else:
        code, source = f"{col}::text", table
    sql = f"""
        SELECT code, "EinheitMastrNummer" FROM (
            SELECT {code} AS code, "EinheitMastrNummer",
                   row_number() OVER (PARTITION BY {code} ORDER BY {order}) AS rn
            FROM {source} WHERE {col} IS NOT NULL) ranked
        WHERE rn <= :n"""
    with engine.connect() as conn:
        return [tuple(r) for r in conn.execute(text(sql), {"n": SAMPLES_PER_CODE})]


def load_rows(table: str, ids: set[str], columns: list[str]) -> dict[str, dict]:
    cols = ", ".join(f'"{c}"' for c in ["EinheitMastrNummer", "DatumLetzteAktualisierung", *columns])
    sql = f'SELECT {cols} FROM {table} WHERE "EinheitMastrNummer" = ANY(:ids)'
    with engine.connect() as conn:
        return {r["EinheitMastrNummer"]: dict(r) for r in conn.execute(text(sql), {"ids": list(ids)}).mappings()}


# -------------------------------------------------------------------------------------- analysis


def to_code(raw) -> int:
    return int(float(raw))


def split_codes(raw) -> list[int]:
    return [to_code(c) for c in str(raw).split(",") if c.strip()]


def resolve_multi(observations: list[tuple[list[int], set[str]]]) -> dict[int, str]:
    """Match codes to values by elimination: a unit with one unknown code and one unmatched value pins both."""
    known: dict[int, str] = {}
    progress = True
    while progress:
        progress = False
        for unit_codes, values in observations:
            open_codes = [c for c in unit_codes if c not in known]
            open_values = values - set(known.values())
            if len(open_codes) == 1 and len(open_values) == 1:
                known[open_codes[0]] = open_values.pop()
                progress = True
    return known


def analyse(spec: codes.CodeSpec, rows: dict[str, dict], answers: dict[str, dict | None]):
    """-> (column -> code -> Counter(value) of trusted units, same for untrusted, multi matches, boolean pairs)."""
    trusted_obs = defaultdict(lambda: defaultdict(Counter))
    untrusted_obs = defaultdict(lambda: defaultdict(Counter))
    multi_obs = defaultdict(list)
    bool_pairs = defaultdict(Counter)

    for nr, row in rows.items():
        api = answers.get(nr)
        if api is None:
            continue
        trusted = datetime.fromisoformat(api["DatumLetzteAktualisierung"]) <= row["DatumLetzteAktualisierung"]
        for column in spec.columns:
            raw = row[column]
            if raw is None:
                continue
            value = api.get(spec.api_name(column))
            if isinstance(value, dict):  # a catalog value (e.g. Hersteller) comes as {"Id": ..., "Wert": ...}
                value = value["Wert"]
            if column in spec.multi:
                if trusted:
                    multi_obs[column].append((split_codes(raw), set(value or [])))
            else:
                target = trusted_obs if trusted else untrusted_obs
                target[column][to_code(raw)][value] += 1
        for column in spec.booleans:
            if trusted and row[column] is not None:
                bool_pairs[column][(row[column], api.get(spec.api_name(column)))] += 1

    for column, observations in multi_obs.items():
        known = resolve_multi(observations)
        for unit_codes, values in observations:
            consistent = {known.get(c) for c in unit_codes} == values
            for c in unit_codes:
                trusted_obs[column][c][known.get(c) if consistent else f"<conflict: {sorted(values)}>"] += 1
    return trusted_obs, untrusted_obs, bool_pairs


# ---------------------------------------------------------------------------------------- report


def report(target: str, suggest: bool) -> int:
    table, method, spec = TARGETS[target]
    api = MastrApi()
    used_before, _ = api.quota()

    samples = {column: sample_units(table, column, column in spec.multi) for column in [*spec.columns, *spec.booleans]}
    ids = {nr for pairs in samples.values() for _, nr in pairs}
    rows = load_rows(table, ids, [*spec.columns, *spec.booleans])
    answers = cached_details(api, method, sorted(ids))
    trusted, untrusted, bool_pairs = analyse(spec, rows, answers)

    problems = 0
    suggestions = defaultdict(dict)
    print(
        f"\n{target}: {len(ids)} representative units, {sum(a is None for a in answers.values())} not found in the API\n"
    )
    for column, catalog in spec.columns.items():
        codes_in_db = sorted(
            {to_code(c) for c, _ in samples[column]}
            if column not in spec.multi
            else {int(c) for c, _ in samples[column]}
        )
        print(f"{column}")
        for code in codes_in_db:
            expected = catalog.get(code)
            counts = trusted[column][code]
            if not counts:  # every sampled unit changed after the export: weak evidence at best
                later = dict(untrusted[column][code])
                verdict = (
                    "ok, but only via units changed since the export" if set(later) == {expected} else "UNVERIFIED"
                )
                print(f"  {code:>5} -> {expected!r:45} {verdict} (now: {later})")
                continue
            value, n = counts.most_common(1)[0]
            total = sum(counts.values())
            if value is None:
                status = "?? no API value"
            elif expected is None:
                status = "NEW"
                suggestions[column][code] = value
            elif expected != value:
                status = f"MISMATCH (codes.py: {expected!r})"
            else:
                status = "ok"
            if n / total < 2 / 3:
                status += "  NO CLEAR MAJORITY"
            problems += status != "ok"
            if len(counts) > 1:  # e.g. the grid operator checked the unit after the export
                status += f"  (changed later: {dict(counts)})"
            print(f"  {code:>5} -> {value!s:45} {n}/{total}  {status}")
        for code in sorted(set(catalog) - set(codes_in_db)):
            print(f"  {code:>5} -> {catalog[code]!r:45} not in the data, cannot verify")
        print()

    print("Boolean columns (export value, API value): count")
    for column in spec.booleans:
        pairs = bool_pairs[column]
        ok = all((raw == "1") == value for (raw, value) in pairs if value is not None)
        problems += not ok
        print(f"  {column:45} {dict(pairs)}  {'ok' if ok else 'MISMATCH'}")

    if suggest and suggestions:
        enum_types = api.enum_types(method)
        print("\n# Suggested entries for codes.py (value = API value, comment = official label)")
        for column, entries in suggestions.items():
            enum_name = enum_types.get(spec.api_name(column), "")
            labels = api.enum_labels(enum_name) if enum_name else {}
            print(f"\n# {column} ({enum_name})")
            for code, value in sorted(entries.items()):
                print(f'    {code}: "{value}",  # {labels.get(value, "")}')

    used_after, _ = api.quota()
    print(f"\nAPI calls used: {used_after - used_before} (today: {used_after:,})")
    print("All codes verified." if not problems else f"{problems} code(s) need attention.")
    return problems


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("target", nargs="?", default="solar", choices=TARGETS)
    parser.add_argument("--suggest", action="store_true", help="print dict entries for codes missing in codes.py")
    args = parser.parse_args()
    raise SystemExit(1 if report(args.target, args.suggest) else 0)
