from dataclasses import dataclass
from typing import Annotated, Literal, get_args

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.db.database import get_db
from app.models.regions import RegionLevel
from app.schemas.selection import Anlagenart, BiomasseArt, GeothermieArt, KwkTraeger, Lage, Leistung, SpeicherArt

router = APIRouter(prefix="/karte", tags=["Map in time"])

Kennzahl = Literal["bestand", "zubau", "stilllegung", "geplant"]


@dataclass(frozen=True)
class Technik:
    """A technology of the map in time (mrt.karte_zeit): the parameter its kinds come in (the same as on its
    dashboard-stats route), their ids, and its measures besides power."""

    param: str | None = None
    arten: tuple[str, ...] = ("alle",)
    capacity: bool = False
    heat: bool = False


TECHNIKEN = {
    "solar": Technik("anlagenart", get_args(Anlagenart)),
    "wind": Technik("lage", get_args(Lage)),
    "water": Technik(),
    "biomass": Technik("art", get_args(BiomasseArt)),
    "geothermal": Technik("art", get_args(GeothermieArt)),
    "kwk": Technik("energietraeger", get_args(KwkTraeger), heat=True),
    "battery": Technik(capacity=True),
    "other_storage": Technik("art", get_args(SpeicherArt), capacity=True),
}
TechnikId = Literal["solar", "wind", "water", "biomass", "geothermal", "kwk", "battery", "other_storage"]

KEY_LENGTH = {"bundesland": 2, "landkreis": 5, "gemeinde": 8}

# The rows of the Kennzahl in the period, each with its sign: the Bestand at the end of a month is the one at the end
# of the year before plus that year's Zubau and minus its Stilllegungen up to the month
ROWS = {
    "bestand_jahr": "SELECT 1 AS sign, * FROM mrt.karte_zeit WHERE kennzahl = 'bestand' AND year = :jahr",
    "bestand_monat": """
        SELECT 1 AS sign, * FROM mrt.karte_zeit WHERE kennzahl = 'bestand' AND year = :jahr - 1
        UNION ALL
        SELECT CASE kennzahl WHEN 'zubau' THEN 1 ELSE -1 END, *
        FROM mrt.karte_zeit
        WHERE kennzahl IN ('zubau', 'stilllegung') AND year = :jahr AND month BETWEEN 1 AND :monat
    """,
    "zeitraum": """
        SELECT 1 AS sign, * FROM mrt.karte_zeit
        WHERE kennzahl = :kennzahl AND year = :jahr AND month IS NOT DISTINCT FROM :monat
    """,
    "geplant": "SELECT 1 AS sign, * FROM mrt.karte_zeit WHERE kennzahl = 'geplant'",
    "heute": "SELECT 1 AS sign, * FROM mrt.karte_zeit WHERE kennzahl = 'heute'",
}

QUERY = """
WITH chosen AS ({rows}),
summed AS (
    -- Per region of the level: the Gemeinden by their key's prefix, the plants with a Land only in their Land, the sea
    SELECT CASE WHEN area = 'offshore' THEN area ELSE LEFT(area, :n) END AS region,
        sum(sign * units) AS units, sum(sign * {power}) AS power, sum(sign * capacity) AS capacity, sum(sign * heat) AS heat
    FROM chosen
    WHERE technology = :technik AND art = ANY(:arten) AND area <> 'ohne_ort' AND (area = 'offshore' OR length(area) >= :n)
    GROUP BY 1
),
areas AS (
    -- Area and population of the regions, also without any units (the sea: only with offshore wind)
    SELECT LEFT(ags, :n) AS region, sum(qkm) AS qkm, sum(einwohner) AS einwohner FROM geo.gemeinden GROUP BY 1
    UNION ALL
    SELECT 'offshore', qkm, NULL FROM geo.offshore WHERE :offshore
)
SELECT COALESCE(a.region, s.region) AS region, COALESCE(s.units, 0) AS units, COALESCE(s.power, 0) AS power,
    COALESCE(s.capacity, 0) AS capacity, COALESCE(s.heat, 0) AS heat, a.qkm, a.einwohner
FROM areas a
FULL JOIN summed s ON s.region = a.region
"""


# What of the chosen rows isn't on the map of a level, and why: no place in the register (ohne_ort), published with its
# Land only (nur_land: on the Länder map, not below), a Gemeinde key the boundaries don't have (unbekannt: merged since,
# or a wrong one)
OHNE_ORT_QUERY = """
WITH chosen AS ({rows}),
keys AS (SELECT DISTINCT LEFT(ags, :n) AS region FROM geo.gemeinden)
SELECT
    CASE
        WHEN area = 'ohne_ort' THEN 'ohne_ort'
        WHEN area = 'offshore' THEN 'auf_der_karte'
        WHEN length(area) < :n THEN 'nur_land'
        WHEN LEFT(area, :n) IN (SELECT region FROM keys) THEN 'auf_der_karte'
        ELSE 'unbekannt'
    END AS grund,
    sum(sign * units) AS units, sum(sign * {power}) AS power, sum(sign * capacity) AS capacity, sum(sign * heat) AS heat
FROM chosen
WHERE technology = :technik AND art = ANY(:arten)
GROUP BY 1
"""


def _arten(technik: Technik, chosen: list[str] | None) -> list[str]:
    """The chosen kinds of the technology (all by default); an unknown one is an error."""
    if not chosen:
        return list(technik.arten)
    unknown = sorted(set(chosen) - set(technik.arten))
    if unknown:
        raise HTTPException(422, f"unknown {technik.param}: {', '.join(unknown)} (known: {', '.join(technik.arten)})")
    return chosen


def _ratio(value: float, base: float | None, digits: int) -> float | None:
    return round(float(value) / float(base), digits) if base else None


def _request(technik, level, kennzahl, jahr, monat, leistung, kinds, query):
    """The SQL of a request (the map's or what isn't on it) and its parameters. kinds: the kinds of every parameter
    (anlagenart, lage, art, energietraeger); the technology's own one counts."""
    spec = TECHNIKEN[technik]
    chosen = dict(zip(("anlagenart", "lage", "art", "energietraeger"), kinds)).get(spec.param)
    if kennzahl not in ("geplant", "heute") and jahr is None:
        raise HTTPException(422, "jahr is required, except for kennzahl=geplant and heute")
    if kennzahl in ("geplant", "heute"):
        rows = ROWS[kennzahl]
    elif kennzahl == "bestand":
        rows = ROWS["bestand_monat" if monat else "bestand_jahr"]
    else:
        rows = ROWS["zeitraum"]
    power = "power_net" if technik == "solar" and leistung == "netto" else "power"
    params = {
        "technik": technik,
        "arten": _arten(spec, chosen),
        "kennzahl": kennzahl,
        "jahr": jahr,
        "monat": monat,
        "n": KEY_LENGTH[level],
        "offshore": technik == "wind",
    }
    return query.format(rows=rows, power=power), params


@router.get("/{technik}", response_model=None)
def get_map(
    technik: TechnikId,
    level: RegionLevel,
    kennzahl: Kennzahl,
    db: Annotated[Session, Depends(get_db)],
    jahr: Annotated[int | None, Query(ge=1900, le=2100, description="the year (not for geplant)")] = None,
    monat: Annotated[int | None, Query(ge=1, le=12, description="a month of the year; none: the whole year")] = None,
    anlagenart: Annotated[list[str] | None, Query(description="solar: gebaeude and/or freiflaeche")] = None,
    lage: Annotated[list[str] | None, Query(description="wind: an_land and/or auf_see")] = None,
    art: Annotated[list[str] | None, Query(description="biomass, geothermal, other_storage: their kinds")] = None,
    energietraeger: Annotated[list[str] | None, Query(description="kwk: Energieträger of the largest unit")] = None,
    leistung: Annotated[Leistung, Query(description="solar: Nettonennleistung (default) or Bruttoleistung")] = "netto",
) -> list[dict]:
    """The map of a technology in time, per Bundesland, Landkreis or Gemeinde, for its chosen kinds (the parameter of
    its dashboard-stats route): the Bestand at the end of a year or month (kennzahl=bestand), the Zubau or the
    Stilllegungen in a year or month (zubau, stilllegung), or what is in planning (geplant, without a period). Under
    the names of the dashboard-stats (total_units, total_power in MW, relative_area_power in kW/km²,
    relative_population_power in kW per inhabitant; total_capacity in MWh … for the storages, total_heat … for KWK),
    every region of the level, also those without units (mrt.karte_zeit)."""
    spec = TECHNIKEN[technik]
    sql, params = _request(
        technik, level, kennzahl, jahr, monat, leistung, (anlagenart, lage, art, energietraeger), QUERY
    )
    result = db.execute(text(sql), params)
    out = []
    for row in result:
        region = {level: row.region, "total_units": int(row.units), "total_power": round(row.power / 1000, 3)}
        region["relative_area_power"] = _ratio(row.power, row.qkm, 1)
        region["relative_population_power"] = _ratio(row.power, row.einwohner, 3)
        if spec.capacity:
            region["total_capacity"] = round(row.capacity / 1000, 3)
            region["relative_area_capacity"] = _ratio(row.capacity, row.qkm, 1)
            region["relative_population_capacity"] = _ratio(row.capacity, row.einwohner, 3)
        if spec.heat:
            region["total_heat"] = round(row.heat / 1000, 3)
            region["relative_area_heat"] = _ratio(row.heat, row.qkm, 1)
            region["relative_population_heat"] = _ratio(row.heat, row.einwohner, 3)
        out.append(region)
    return out


@router.get("/{technik}/ohne-ort", response_model=None)
def get_ohne_ort(
    technik: TechnikId,
    level: RegionLevel,
    kennzahl: Annotated[Literal["heute", "bestand", "zubau", "stilllegung", "geplant"], Query()],
    db: Annotated[Session, Depends(get_db)],
    jahr: Annotated[int | None, Query(ge=1900, le=2100)] = None,
    monat: Annotated[int | None, Query(ge=1, le=12)] = None,
    anlagenart: Annotated[list[str] | None, Query()] = None,
    lage: Annotated[list[str] | None, Query()] = None,
    art: Annotated[list[str] | None, Query()] = None,
    energietraeger: Annotated[list[str] | None, Query()] = None,
    leistung: Annotated[Leistung, Query()] = "netto",
) -> dict:
    """What of a technology isn't on its map of a level (the parameters of /karte/{technik}; kennzahl=heute: the map of
    today, the units in operation): in total (units, MW, MWh) and why – ohne_ort (no place in the register), nur_land
    (published with its Land only: not in a Kreis or Gemeinde), unbekannt (a Gemeinde key the boundaries don't have);
    besides, what is on it (auf_der_karte)."""
    spec = TECHNIKEN[technik]
    sql, params = _request(
        technik, level, kennzahl, jahr, monat, leistung, (anlagenart, lage, art, energietraeger), OHNE_ORT_QUERY
    )
    gruende = {}
    for row in db.execute(text(sql), params):
        gruende[row.grund] = {
            "total_units": int(row.units or 0),
            "total_power": round(float(row.power or 0) / 1000, 3),
            **({"total_capacity": round(float(row.capacity or 0) / 1000, 3)} if spec.capacity else {}),
            **({"total_heat": round(float(row.heat or 0) / 1000, 3)} if spec.heat else {}),
        }
    return _ohne_ort_summary(gruende)


def _ohne_ort_summary(gruende: dict) -> dict:
    """The reasons and, as their sum, what isn't on the map (nicht_zugeordnet), next to what is (auf_der_karte)."""
    reasons = {grund: gruende.get(grund) for grund in ("ohne_ort", "nur_land", "unbekannt")}
    fields = {field for values in gruende.values() for field in values}
    missing = {field: round(sum((values or {}).get(field, 0) for values in reasons.values()), 3) for field in fields}
    return {
        "nicht_zugeordnet": missing,
        "gruende": {k: v for k, v in reasons.items() if v},
        "auf_der_karte": gruende.get("auf_der_karte"),
    }
