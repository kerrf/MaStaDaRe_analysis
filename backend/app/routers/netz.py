from typing import Annotated

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel
from sqlalchemy import func
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
