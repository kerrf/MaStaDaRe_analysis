from typing import Annotated

from fastapi import APIRouter, Depends, Response
from sqlalchemy.orm import Session

from app.db.database import get_db
from app.models.analyses import SizeDistribution
from app.models.regions import RegionLevel, WindRegionStats
from app.schemas.analyses import (
    CACHE_CONTROL,
    Region,
    Regions,
    RegionTable,
    SizeClassShare,
    regions,
)

router = APIRouter(prefix="/wind", tags=["Wind Data"])


@router.get("/dashboard-stats", response_model=None)
async def get_dashboard_stats(
    level: RegionLevel,
    db: Session = Depends(get_db)
):
    """Wind power per Bundesland, Landkreis or Gemeinde. Offshore wind is the region "offshore" on every level."""
    return db.query(WindRegionStats).filter(*WindRegionStats.at_level(level)).all()


@router.get("/size-distribution", response_model=list[SizeClassShare])
def get_size_distribution(response: Response, db: Annotated[Session, Depends(get_db)], region: Region = "DE"):
    """Turbines and power per size class (MW per turbine), for Deutschland (with offshore), a Land or a Kreis."""
    response.headers["Cache-Control"] = CACHE_CONTROL
    return SizeDistribution.of(db, "wind", region)


@router.get("/size-distribution/regions", response_model=RegionTable)
def get_size_distribution_regions(
    response: Response, db: Annotated[Session, Depends(get_db)], scope: Annotated[Regions, Depends(regions)]
):
    """Turbines and power per size class for every Land, Kreis or Gemeinde (optionally within one)."""
    response.headers["Cache-Control"] = CACHE_CONTROL
    return SizeDistribution.table(db, "wind", scope.level, scope.within)
