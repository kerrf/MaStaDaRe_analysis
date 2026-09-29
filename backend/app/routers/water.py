from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.db.database import get_db
from app.models.regions import RegionLevel, WaterRegionStats

router = APIRouter(prefix="/water", tags=["Hydropower Data"])


@router.get("/dashboard-stats", response_model=None)
async def get_dashboard_stats(
    level: RegionLevel,
    db: Session = Depends(get_db)
):
    """Hydropower per Bundesland, Landkreis or Gemeinde."""
    return db.query(WaterRegionStats).filter(*WaterRegionStats.at_level(level)).all()
