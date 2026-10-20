from typing import Annotated

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.db.database import get_db
from app.models.analyses import SizeDistribution
from app.models.regions import GeothermalRegionStats, RegionLevel
from app.schemas.analyses import Region, Regions, RegionTable, SizeClassShare, regions
from app.schemas.selection import geothermie_arten

router = APIRouter(prefix="/geothermal", tags=["Geothermal Data"])

Arten = Annotated[tuple[str, ...], Depends(geothermie_arten)]
MEASURES = ("total_power", "relative_area_power", "relative_population_power", "added_12m_power")


@router.get("/dashboard-stats", response_model=None)
def get_dashboard_stats(level: RegionLevel, arten: Arten, db: Session = Depends(get_db)):
    """Geothermie, Grubengas, Klärschlamm, Druckentspannung and Solarthermie units in operation per Bundesland,
    Landkreis or Gemeinde, for the chosen Energieträger (?art=…)."""
    return GeothermalRegionStats.summed(db, level, arten, MEASURES)


@router.get("/size-distribution", response_model=list[SizeClassShare])
def get_size_distribution(db: Annotated[Session, Depends(get_db)], region: Region = "DE"):
    """Their units and power per size class, for Deutschland, a Land or a Kreis."""
    return SizeDistribution.of(db, "geothermal", region)


@router.get("/size-distribution/regions", response_model=RegionTable)
def get_size_distribution_regions(db: Annotated[Session, Depends(get_db)], scope: Annotated[Regions, Depends(regions)]):
    """Their units and power per size class for every Land, Kreis or Gemeinde (optionally within one)."""
    return SizeDistribution.table(db, "geothermal", scope.level, scope.within)
