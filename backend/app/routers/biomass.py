from typing import Annotated

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.db.database import get_db
from app.models.analyses import SizeDistribution
from app.models.regions import BiomassRegionStats, RegionLevel
from app.schemas.analyses import Region, Regions, RegionTable, SizeClassShare, regions
from app.schemas.selection import biomasse_arten

router = APIRouter(prefix="/biomass", tags=["Biomass Data"])

Arten = Annotated[tuple[str, ...], Depends(biomasse_arten)]
MEASURES = ("total_power", "relative_area_power", "relative_population_power", "added_12m_power")


@router.get("/dashboard-stats", response_model=None)
def get_dashboard_stats(level: RegionLevel, arten: Arten, db: Session = Depends(get_db)):
    """Biomass units in operation per Bundesland, Landkreis or Gemeinde, for the chosen Biomassearten (?art=…)."""
    return BiomassRegionStats.summed(db, level, arten, MEASURES)


@router.get("/size-distribution", response_model=list[SizeClassShare])
def get_size_distribution(db: Annotated[Session, Depends(get_db)], region: Region = "DE"):
    """Biomass units and power per size class, for Deutschland, a Land or a Kreis."""
    return SizeDistribution.of(db, "biomass", region)


@router.get("/size-distribution/regions", response_model=RegionTable)
def get_size_distribution_regions(db: Annotated[Session, Depends(get_db)], scope: Annotated[Regions, Depends(regions)]):
    """Biomass units and power per size class for every Land, Kreis or Gemeinde (optionally within one)."""
    return SizeDistribution.table(db, "biomass", scope.level, scope.within)
