from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.db.database import get_db
from app.models.regions import BatteryRegionStats, RegionLevel

router = APIRouter(prefix="/battery", tags=["Battery Storage Data"])


@router.get("/dashboard-stats", response_model=None)
async def get_dashboard_stats(
    level: RegionLevel,
    db: Session = Depends(get_db)
):
    """Battery storage power per Bundesland, Landkreis or Gemeinde."""
    return db.query(BatteryRegionStats).filter(*BatteryRegionStats.at_level(level)).all()
