from typing import Annotated

from fastapi import APIRouter, Depends
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session

from app.db.database import get_db
from app.models.analyses import HeatmapPoint, SizeDistribution
from app.models.regions import RegionLevel, WindRegionStats
from app.models.wind import WindTurbine
from app.schemas.analyses import (
    HeatmapPoints,
    Region,
    Regions,
    RegionTable,
    SizeClassShare,
    regions,
)
from app.schemas.selection import wind_lage

router = APIRouter(prefix="/wind", tags=["Wind Data"])

Lagen = Annotated[tuple[str, ...], Depends(wind_lage)]
OFFSHORE = "offshore"
MEASURES = ("total_units", "total_power", "relative_area_power", "relative_population_power", "added_12m_power")


def by_lage(rows: list[dict], lage: tuple[str, ...]) -> list[dict]:
    """The regions' wind of the chosen Lagen. Offshore wind is the region "offshore" on every level: without auf_see it
    is left out, without an_land the regions on land stay, with zeros (they have no wind at sea)."""
    if "auf_see" not in lage:
        return [row for row in rows if row["bundesland"] != OFFSHORE]
    if "an_land" not in lage:
        return [row if row["bundesland"] == OFFSHORE else {**row, **dict.fromkeys(MEASURES, 0)} for row in rows]
    return rows


@router.get("/dashboard-stats", response_model=None)
async def get_dashboard_stats(level: RegionLevel, lage: Lagen, db: Session = Depends(get_db)):
    """Wind power per Bundesland, Landkreis or Gemeinde, an Land and/or auf See (the region "offshore")."""
    rows = [
        {column: getattr(row, column) for column in ("bundesland", "landkreis", "gemeinde", *MEASURES)}
        for row in db.query(WindRegionStats).filter(*WindRegionStats.at_level(level))
    ]
    return by_lage(rows, lage)


@router.get("/heatmap", response_model=HeatmapPoints)
def get_heatmap(db: Annotated[Session, Depends(get_db)], lage: Lagen):
    """Where the wind power lies, for the continuous map: turbines per cell of about 1 km (offshore at sea), the few
    without coordinates per postcode, in kW (mrt.heatmap_points)."""
    return HeatmapPoint.of(db, "wind", lage)


@router.get("/size-distribution", response_model=list[SizeClassShare])
def get_size_distribution(db: Annotated[Session, Depends(get_db)], lage: Lagen, region: Region = "DE"):
    """Turbines and power per size class (MW per turbine), for Deutschland (with offshore), a Land or a Kreis."""
    return SizeDistribution.of(db, "wind", region, lage)


@router.get("/size-distribution/regions", response_model=RegionTable)
def get_size_distribution_regions(
    db: Annotated[Session, Depends(get_db)],
    scope: Annotated[Regions, Depends(regions)],
    lage: Lagen,
):
    """Turbines and power per size class for every Land, Kreis or Gemeinde (optionally within one)."""
    return SizeDistribution.table(db, "wind", scope.level, scope.within, lage)


@router.get("/turbines", response_model=None)
def get_turbines(db: Annotated[Session, Depends(get_db)]):
    """Every wind turbine on its own (not per Windpark), in operation, planned and decommissioned, as columns: status,
    Lage, year (planned: the year planned), hub height and rotor diameter (m), power (kW), Gemeindeschlüssel (number),
    coordinates and manufacturer (index into "hersteller"). The page filters by area, Lage and status itself."""
    # Straight to JSON: FastAPI's encoder would walk every one of the 440,000 values first
    return JSONResponse(WindTurbine.columns(db))
