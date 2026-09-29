from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.db.database import get_db
from app.models.regions import RegionLevel, WindRegionStats

router = APIRouter(prefix="/wind", tags=["Wind Data"])


@router.get("/dashboard-stats", response_model=None)
async def get_dashboard_stats(
    level: RegionLevel,
    db: Session = Depends(get_db)
):
    """Wind power per Bundesland, Landkreis or Gemeinde. Offshore wind is the region "offshore" on every level."""
    return db.query(WindRegionStats).filter(*WindRegionStats.at_level(level)).all()
