from typing import Annotated

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.db.database import get_db
from app.models.regions import OtherStorageRegionStats, RegionLevel
from app.schemas.selection import speicher_arten

router = APIRouter(prefix="/other-storage", tags=["Other Storage Data"])

Arten = Annotated[tuple[str, ...], Depends(speicher_arten)]
MEASURES = (
    "total_power",
    "relative_area_power",
    "relative_population_power",
    "total_capacity",
    "relative_area_capacity",
    "relative_population_capacity",
    "added_12m_power",
    "added_12m_capacity",
)


@router.get("/dashboard-stats", response_model=None)
def get_dashboard_stats(level: RegionLevel, arten: Arten, db: Session = Depends(get_db)):
    """Druckluft-, Schwungrad- and Wasserstoffspeicher in operation per Bundesland, Landkreis or Gemeinde, their power
    and capacity, for the chosen Technologien (?art=…)."""
    return OtherStorageRegionStats.summed(db, level, arten, MEASURES)
