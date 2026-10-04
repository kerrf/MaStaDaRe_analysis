from typing import Annotated

from fastapi import APIRouter, Depends, Response
from sqlalchemy.orm import Session

from app.db.database import get_db
from app.models.analyses import SizeDistribution
from app.models.regions import RegionLevel, WaterRegionStats
from app.schemas.analyses import (
    CACHE_CONTROL,
    Region,
    Regions,
    RegionTable,
    SizeClassShare,
    regions,
)

router = APIRouter(prefix="/water", tags=["Hydropower Data"])


@router.get("/dashboard-stats", response_model=None)
async def get_dashboard_stats(level: RegionLevel, db: Session = Depends(get_db)):
    """Hydropower per Bundesland, Landkreis or Gemeinde."""
    return db.query(WaterRegionStats).filter(*WaterRegionStats.at_level(level)).all()


@router.get("/size-distribution", response_model=list[SizeClassShare])
def get_size_distribution(response: Response, db: Annotated[Session, Depends(get_db)], region: Region = "DE"):
    """Hydropower units and power per size class, for Deutschland, a Land or a Kreis."""
    response.headers["Cache-Control"] = CACHE_CONTROL
    return SizeDistribution.of(db, "water", region)


@router.get("/size-distribution/regions", response_model=RegionTable)
def get_size_distribution_regions(
    response: Response, db: Annotated[Session, Depends(get_db)], scope: Annotated[Regions, Depends(regions)]
):
    """Hydropower units and power per size class for every Land, Kreis or Gemeinde (optionally within one)."""
    response.headers["Cache-Control"] = CACHE_CONTROL
    return SizeDistribution.table(db, "water", scope.level, scope.within)
