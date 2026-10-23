from typing import Annotated, Literal

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.db.database import get_db
from app.models.analyses import BatteryKind, BatterySizeDistribution, BatteryZubauRegion, HeatmapPoint
from app.models.regions import BatteryRegionStats, RegionLevel
from app.schemas.analyses import (
    BatterySizeClass,
    BatteryZubauYear,
    HeatmapPoints,
    KindShare,
    Region,
    Regions,
    RegionTable,
    regions,
)
from app.schemas.selection import batterie_groessen

router = APIRouter(prefix="/battery", tags=["Battery Storage Data"])


Groessen = Annotated[tuple[str, ...], Depends(batterie_groessen)]
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
def get_dashboard_stats(level: RegionLevel, groessen: Groessen, db: Session = Depends(get_db)):
    """Battery storage power and capacity per Bundesland, Landkreis or Gemeinde, for the chosen size classes
    (?groesse=heimspeicher, gewerbespeicher, grossspeicher: like the Zubau)."""
    return BatteryRegionStats.summed(db, level, groessen, MEASURES)


@router.get("/zubau", response_model=list[BatteryZubauYear])
def get_zubau(db: Annotated[Session, Depends(get_db)], region: Region = "DE"):
    """Zubau and Bestand per year since 2013 in a region, per size class (mrt.battery_zubau_regions)."""
    return BatteryZubauRegion.of(db, region)


@router.get("/size-distribution", response_model=list[BatterySizeClass])
def get_size_distribution(db: Annotated[Session, Depends(get_db)], region: Region = "DE"):
    """Units, power and capacity per size class of the plant's capacity in a region (mrt.battery_size_distribution)."""
    return BatterySizeDistribution.of(db, region)


@router.get("/size-distribution/regions", response_model=RegionTable)
def get_size_distribution_regions(db: Annotated[Session, Depends(get_db)], scope: Annotated[Regions, Depends(regions)]):
    """Units, power and capacity per size class of the plant's capacity for every Land, Kreis or Gemeinde (optionally
    within one)."""
    return BatterySizeDistribution.table(db, scope.level, scope.within)


@router.get("/kinds", response_model=list[KindShare])
def get_kinds(db: Annotated[Session, Depends(get_db)], region: Region = "DE"):
    """Units, power and capacity in a region by battery technology (technologie) and by coupling (kopplung: AC or DC),
    the kinds that occur (mrt.battery_kinds)."""
    return BatteryKind.of(db, region)


@router.get("/heatmap", response_model=HeatmapPoints)
def get_heatmap(
    db: Annotated[Session, Depends(get_db)], groessen: Groessen, measure: Literal["power", "capacity"] = "power"
):
    """Where the batteries lie, for the continuous map: large ones per cell of about 1 km, home batteries per postcode,
    as power (kW) or usable capacity (kWh, where plausible) (mrt.heatmap_points)."""
    return HeatmapPoint.of(db, "batterie", groessen, measure=measure)
