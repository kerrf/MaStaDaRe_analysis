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
}

QUERY = """
WITH chosen AS ({rows}),
summed AS (
    -- Per region of the level: the Gemeinden by their key's prefix, the plants with a Land only in their Land, the sea
    SELECT CASE WHEN area = 'offshore' THEN area ELSE LEFT(area, :n) END AS region,
        sum(sign * units) AS units, sum(sign * {power}) AS power, sum(sign * capacity) AS capacity, sum(sign * heat) AS heat
    FROM chosen
    WHERE technology = :technik AND art = ANY(:arten) AND (area = 'offshore' OR length(area) >= :n)
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
    chosen = {"anlagenart": anlagenart, "lage": lage, "art": art, "energietraeger": energietraeger}.get(spec.param)
    if kennzahl != "geplant" and jahr is None:
        raise HTTPException(422, "jahr is required, except for kennzahl=geplant")
    if kennzahl == "geplant":
        rows = ROWS["geplant"]
    elif kennzahl == "bestand":
        rows = ROWS["bestand_monat" if monat else "bestand_jahr"]
    else:
        rows = ROWS["zeitraum"]
    power = "power_net" if technik == "solar" and leistung == "netto" else "power"
    result = db.execute(
        text(QUERY.format(rows=rows, power=power)),
        {
            "technik": technik,
            "arten": _arten(spec, chosen),
            "kennzahl": kennzahl,
            "jahr": jahr,
            "monat": monat,
            "n": KEY_LENGTH[level],
            "offshore": technik == "wind",
        },
    )
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
