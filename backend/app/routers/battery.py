from typing import Annotated

from fastapi import APIRouter, Depends, Response
from sqlalchemy.orm import Session

from app.db.database import get_db
from app.models.analyses import BatterySizeDistribution, BatteryZubauRegion
from app.models.regions import BatteryRegionStats, RegionLevel
from app.schemas.analyses import CACHE_CONTROL, BatterySizeClass, BatteryZubauYear, Region

router = APIRouter(prefix="/battery", tags=["Battery Storage Data"])


@router.get("/dashboard-stats", response_model=None)
async def get_dashboard_stats(level: RegionLevel, db: Session = Depends(get_db)):
    """Battery storage power and capacity per Bundesland, Landkreis or Gemeinde."""
    return db.query(BatteryRegionStats).filter(*BatteryRegionStats.at_level(level)).all()


@router.get("/zubau", response_model=list[BatteryZubauYear])
def get_zubau(response: Response, db: Annotated[Session, Depends(get_db)], region: Region = "DE"):
    """Zubau and Bestand per year since 2013 in a region, per size class (mrt.battery_zubau_regions)."""
    response.headers["Cache-Control"] = CACHE_CONTROL
    return BatteryZubauRegion.of(db, region)


@router.get("/size-distribution", response_model=list[BatterySizeClass])
def get_size_distribution(response: Response, db: Annotated[Session, Depends(get_db)], region: Region = "DE"):
    """Units, power and capacity per size class of the plant's capacity in a region (mrt.battery_size_distribution)."""
    response.headers["Cache-Control"] = CACHE_CONTROL
    return BatterySizeDistribution.of(db, region)
