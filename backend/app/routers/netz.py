from typing import Annotated

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel
from sqlalchemy import func, text
from sqlalchemy.orm import Session

from app.db.database import get_db
from app.models.netz import TECHNOLOGIEN, NetzAnschluss
from app.models.regions import NetzRegionStats, RegionLevel
from app.schemas.selection import netz_ebenen

router = APIRouter(prefix="/netz", tags=["Netzanschlüsse"])

Ebenen = Annotated[tuple[str, ...], Depends(netz_ebenen)]
# The scope of the analyses: all of Germany, a Bundesland or a Landkreis
NetzScope = Annotated[
    str,
    Query(pattern=r"^(DE|\d{2}|\d{5})$", description='"DE", a Bundesland (e.g. "09") or a Landkreis (e.g. "09175")'),
]
MEASURES = (
    "total_units",
    "total_power",
    "relative_area_units",
    "relative_population_units",
    "relative_area_power",
    "relative_population_power",
    "added_12m_units",
    "added_12m_power",
    "planned_units",
)


class NetzEbene(BaseModel):
    """Points in operation, the power of all units of their Lokationen (MW), in total and per technology, and points in
    planning of one Netzebene."""

    netzebene: int  # 1 (Höchstspannung) to 7 (Niederspannung), each voltage and the transformation below it
    punkte: int
    leistung: float
    technologien: dict[
        str, float
    ]  # MW per technology: solar, wind, wasser, speicher, biomasse, erdgas, kohle, sonstige
    geplant: int


class Netzbetreiber(BaseModel):
    netzbetreiber: str | None  # its MaStR number (SNB…)
    name: str | None
    netz: str  # its grid: uebertragungsnetz (Übertragungsnetzbetreiber) or verteilnetz
    punkte: int
    leistung: float
    geplant: int


@router.get("/dashboard-stats", response_model=None)
def get_dashboard_stats(level: RegionLevel, ebenen: Ebenen, db: Session = Depends(get_db)):
    """Netzanschlusspunkte der Stromerzeugung per Bundesland, Landkreis or Gemeinde, for the chosen Spannungsebenen: those
    in operation, the power of their units (MW), per km² and per 1,000 inhabitants, the new ones of the last 12 months
    and those in planning. Every Spannungsebene's row carries its region's whole area and population, so they add up."""
    model = NetzRegionStats
    keys = (model.bundesland, model.landkreis, model.gemeinde)
    rows = (
        db.query(*keys, *(func.sum(getattr(model, name)).label(name) for name in MEASURES))
        .filter(model.ebene.in_(ebenen), *model.at_level(level))
        .group_by(*keys)
        .all()
    )
    return [row._asdict() for row in rows]


@router.get("/ebenen", response_model=list[NetzEbene])
def get_ebenen(db: Annotated[Session, Depends(get_db)], region: NetzScope = "DE"):
    """The Netzanschlusspunkte der Stromerzeugung per Netzebene, in Deutschland, a Land or a Kreis, with the power of all
    units of their Lokationen per technology."""
    rows = NetzAnschluss.summed(db, region, NetzAnschluss.netzebene, technologien=True)
    return [{**row, "technologien": {t: row.pop(f"leistung_{t}") or 0 for t in TECHNOLOGIEN}} for row in rows]


@router.get("/netzbetreiber", response_model=list[Netzbetreiber])
def get_netzbetreiber(db: Annotated[Session, Depends(get_db)], region: NetzScope = "DE"):
    """The Netzanschlusspunkte der Stromerzeugung per grid operator in Deutschland, a Land or a Kreis, with its grid
    (Übertragungs- or Verteilnetz), the largest by power first."""
    rows = NetzAnschluss.summed(
        db, region, NetzAnschluss.netzbetreiber, NetzAnschluss.netzbetreiber_name, NetzAnschluss.netz
    )
    rows = [{**row, "name": row.pop("netzbetreiber_name")} for row in rows]
    return sorted(rows, key=lambda row: row["leistung"] or 0, reverse=True)


# What of the Netzanschlüsse isn't on the map of a level, for the chosen Spannungsebenen: the points in operation and
# their power at the level and on its map (keys the boundaries have, and the sea), those of the Länder, and the row
# 'ohne_ort' (no place in the register)
OHNE_ORT = """
WITH keys AS (SELECT DISTINCT LEFT(ags, :n) AS region FROM geo.gemeinden),
rows AS (
    SELECT s.*,
        CASE :level WHEN 'bundesland' THEN s.landkreis IS NULL AND s.bundesland IS NOT NULL AND s.bundesland <> 'ohne_ort'
            WHEN 'landkreis' THEN s.landkreis IS NOT NULL AND s.gemeinde IS NULL
            ELSE s.gemeinde IS NOT NULL END AS at_level,
        CASE :level WHEN 'bundesland' THEN s.bundesland WHEN 'landkreis' THEN s.landkreis ELSE s.gemeinde END AS region
    FROM mrt.netz_region_stats s
    WHERE s.ebene = ANY(:ebenen)
)
SELECT
    sum(total_units) FILTER (WHERE bundesland = 'ohne_ort' AND landkreis IS NULL) AS ohne_ort_units,
    sum(total_power) FILTER (WHERE bundesland = 'ohne_ort' AND landkreis IS NULL) AS ohne_ort_power,
    sum(total_units) FILTER (WHERE landkreis IS NULL AND bundesland IS NOT NULL AND bundesland <> 'ohne_ort') AS land_units,
    sum(total_power) FILTER (WHERE landkreis IS NULL AND bundesland IS NOT NULL AND bundesland <> 'ohne_ort') AS land_power,
    sum(total_units) FILTER (WHERE at_level) AS level_units,
    sum(total_power) FILTER (WHERE at_level) AS level_power,
    sum(total_units) FILTER (WHERE at_level AND (region = 'offshore' OR region IN (SELECT region FROM keys))) AS map_units,
    sum(total_power) FILTER (WHERE at_level AND (region = 'offshore' OR region IN (SELECT region FROM keys))) AS map_power
FROM rows
"""


@router.get("/ohne-ort", response_model=None)
def get_ohne_ort(level: RegionLevel, ebenen: Ebenen, db: Annotated[Session, Depends(get_db)]) -> dict:
    """What of the Netzanschlüsse in operation isn't on the map of a level, for the chosen Spannungsebenen (?spannung=):
    in total (points, MW) and why – ohne_ort (the Lokation has no place in the register), nur_land (published with its
    Land only: not in a Kreis or Gemeinde), unbekannt (a Gemeinde key the boundaries don't have); like /karte/…/ohne-ort."""
    row = db.execute(
        text(OHNE_ORT),
        {"level": level, "n": {"bundesland": 2, "landkreis": 5, "gemeinde": 8}[level], "ebenen": list(ebenen)},
    ).one()

    def part(units, power) -> dict | None:
        units, power = int(units or 0), round(float(power or 0), 3)
        return {"total_units": units, "total_power": power} if units or power else None

    gruende = {
        "ohne_ort": part(row.ohne_ort_units, row.ohne_ort_power),
        # The Länder's points that no row of the level has: those with their Land only (none on the Länder map itself)
        "nur_land": part(
            (row.land_units or 0) - (row.level_units or 0), (row.land_power or 0) - (row.level_power or 0)
        ),
        "unbekannt": part((row.level_units or 0) - (row.map_units or 0), (row.level_power or 0) - (row.map_power or 0)),
    }
    gruende = {k: v for k, v in gruende.items() if v}
    missing = {
        "total_units": sum(v["total_units"] for v in gruende.values()),
        "total_power": round(sum(v["total_power"] for v in gruende.values()), 3),
    }
    return {"nicht_zugeordnet": missing, "gruende": gruende, "auf_der_karte": part(row.map_units, row.map_power)}
