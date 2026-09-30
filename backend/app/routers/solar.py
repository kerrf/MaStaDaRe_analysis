from typing import Annotated, Literal, get_args

from fastapi import APIRouter, Depends, Response
from sqlalchemy.orm import Session

from app.models.regions import RegionLevel, SolarRegionStats
from app.models.solar import SolarUnit, SolarRollupStats
from app.schemas.solar import SolarResponse, SolarFilter
from app.db.database import get_db
from app.models.analyses import SizeDistribution, SolarOrientation
from app.schemas.analyses import CACHE_CONTROL, OrientationShare, Region, Regions, RegionTable, SizeClassShare, regions

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


@router.get("/size-distribution", response_model=list[SizeClassShare])
def get_size_distribution(response: Response, db: Annotated[Session, Depends(get_db)], region: Region = "DE"):
    """Units and power per size class (Balkon-PV to Solarpark), for Deutschland, a Land or a Kreis."""
    response.headers["Cache-Control"] = CACHE_CONTROL
    return SizeDistribution.of(db, "solar", region)


@router.get("/orientation", response_model=list[OrientationShare])
def get_orientation(response: Response, db: Annotated[Session, Depends(get_db)], region: Region = "DE"):
    """Units and power per main orientation of the modules (8 directions, ost_west, nachgefuehrt, unbekannt)."""
    response.headers["Cache-Control"] = CACHE_CONTROL
    return SolarOrientation.of(db, region)


@router.get("/size-distribution/regions", response_model=RegionTable)
def get_size_distribution_regions(
    response: Response, db: Annotated[Session, Depends(get_db)], scope: Annotated[Regions, Depends(regions)]
):
    """Units and power per size class for every Land, Kreis or Gemeinde (optionally within one)."""
    response.headers["Cache-Control"] = CACHE_CONTROL
    return SizeDistribution.table(db, "solar", scope.level, scope.within)


@router.get("/orientation/regions", response_model=RegionTable)
def get_orientation_regions(
    response: Response, db: Annotated[Session, Depends(get_db)], scope: Annotated[Regions, Depends(regions)]
):
    """Units and power per orientation for every Land, Kreis or Gemeinde (optionally within one)."""
    response.headers["Cache-Control"] = CACHE_CONTROL
    return SolarOrientation.table(db, scope.level, scope.within)
