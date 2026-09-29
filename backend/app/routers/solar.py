from typing import Literal, get_args

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.models.regions import RegionLevel, SolarRegionStats
from app.models.solar import SolarUnit, SolarRollupStats
from app.schemas.solar import SolarResponse, SolarFilter
from app.db.database import get_db

router = APIRouter(prefix="/solar", tags=["Solar Data"])

ALLOWED_GROUP_COLUMNS = {"Postleitzahl", "Inbetriebnahmedatum", "ArtDerSolaranlage"}

@router.get("/", response_model=list[SolarResponse])
async def get_solar_data(
    filters: SolarFilter = Depends(),
    db     : Session     = Depends(get_db)
):
    # base query SELECT * FROM stg.solar_units
    db.query(SolarUnit)
    
    if filters.min_power is not None:
        query = query.filter(SolarUnit.Bruttoleistung >= filters.min_power)
        
    if filters.plz_list is not None:
        query = query.filter(SolarUnit.Postleitzahl in filters.plz_list)
        
    return query.limit(filters.limit).all()

# TODO: Define response_model
@router.get("/dashboard-stats", response_model=None)
async def get_dashboard_stats(
    level: Literal["bundesland", "landkreis", "gemeinde", "plz2", "plz3", "plz5"],
    db: Session = Depends(get_db)
):
    if level in get_args(RegionLevel):
        return db.query(SolarRegionStats).filter(*SolarRegionStats.at_level(level)).all()

    query = db.query(SolarRollupStats)

    if level == "plz2":
        query = query.filter(
            SolarRollupStats.plz2.isnot(None),
            SolarRollupStats.plz3.is_(None)
        )
    elif level == "plz3":
        query = query.filter(
            SolarRollupStats.plz3.isnot(None),
            SolarRollupStats.plz5.is_(None)
        )
    elif level == "plz5":
        # The lowest level: nothing is NULL
        query = query.filter(SolarRollupStats.plz5.isnot(None))

    return query.all()