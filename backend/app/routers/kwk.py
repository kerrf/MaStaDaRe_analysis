from typing import Annotated

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.db.database import get_db
from app.models.analyses import SizeDistribution
from app.models.regions import KwkRegionStats, RegionLevel
from app.schemas.analyses import Region, Regions, RegionTable, SizeClassShare, regions
from app.schemas.selection import kwk_traeger

router = APIRouter(prefix="/kwk", tags=["KWK Data"])

Traeger = Annotated[tuple[str, ...], Depends(kwk_traeger)]
MEASURES = (
    "total_power",
    "relative_area_power",
    "relative_population_power",
    "total_heat",
    "relative_area_heat",
    "relative_population_heat",
    "added_12m_power",
)


@router.get("/dashboard-stats", response_model=None)
def get_dashboard_stats(level: RegionLevel, traeger: Traeger, db: Session = Depends(get_db)):
    """KWK plants in operation per Bundesland, Landkreis or Gemeinde, their electrical (total_power) and thermal
    power (total_heat), for the chosen Energieträger of their largest unit (?energietraeger=…)."""
    return KwkRegionStats.summed(db, level, traeger, MEASURES)


@router.get("/size-distribution", response_model=list[SizeClassShare])
def get_size_distribution(db: Annotated[Session, Depends(get_db)], region: Region = "DE"):
    """KWK plants and their electrical power per size class, for Deutschland, a Land or a Kreis."""
    return SizeDistribution.of(db, "kwk", region)


@router.get("/size-distribution/regions", response_model=RegionTable)
def get_size_distribution_regions(db: Annotated[Session, Depends(get_db)], scope: Annotated[Regions, Depends(regions)]):
    """KWK plants and their electrical power per size class for every Land, Kreis or Gemeinde (optionally within one)."""
    return SizeDistribution.table(db, "kwk", scope.level, scope.within)
