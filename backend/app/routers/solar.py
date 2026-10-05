from typing import Annotated, Literal, get_args

from fastapi import APIRouter, Depends, Response
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.db.database import get_db
from app.models.analyses import (
    HeatmapPoint,
    PvSpeicher,
    SizeDistribution,
    SolarOrientation,
    SolarZubauRegion,
    SpeicherPv,
)
from app.models.regions import RegionLevel, SolarRegionStats
from app.models.solar import SolarRollupStats, SolarUnit
from app.schemas.analyses import (
    CACHE_CONTROL,
    HeatmapPoints,
    OrientationShare,
    PvSpeicherData,
    Region,
    Regions,
    RegionTable,
    SizeClassShare,
    ZubauYear,
    regions,
)
from app.schemas.selection import SolarSelection, solar_selection
from app.schemas.solar import SolarFilter, SolarResponse

Selection = Annotated[SolarSelection, Depends(solar_selection)]

# The PLZ levels of the rollup: the key that is set and the one that is NULL on its rows
PLZ_LEVELS = {"plz2": ("plz2", "plz3"), "plz3": ("plz3", "plz5"), "plz5": ("plz5", None)}

router = APIRouter(prefix="/solar", tags=["Solar Data"])

ALLOWED_GROUP_COLUMNS = {"Postleitzahl", "Inbetriebnahmedatum", "ArtDerSolaranlage"}


@router.get("/", response_model=list[SolarResponse])
async def get_solar_data(filters: SolarFilter = Depends(), db: Session = Depends(get_db)):
    # base query SELECT * FROM stg.solar_units
    query = db.query(SolarUnit)

    if filters.min_power is not None:
        query = query.filter(SolarUnit.Bruttoleistung >= filters.min_power)

    if filters.plz_list is not None:
        query = query.filter(SolarUnit.Postleitzahl.in_(filters.plz_list))

    return query.limit(filters.limit).all()


def summed(db: Session, model, keys: tuple, filters: tuple, selection: SolarSelection, measures: tuple) -> list[dict]:
    """The rows of a solar view for the chosen Anlagenarten, summed per region, in Brutto or Netto: under the usual
    names (total_power, ...), whichever measure. The views give each Anlagenart the region's whole area and population,
    so the values per km² and per inhabitant add up too."""
    rows = (
        db.query(
            *keys,
            func.sum(model.total_units).label("total_units"),
            *(func.sum(selection.column(model, name)).label(name) for name in measures),
        )
        .filter(model.anlagenart.in_(selection.anlagenarten), *filters)
        .group_by(*keys)
        .all()
    )
    return [row._asdict() for row in rows]


# TODO: Define response_model
@router.get("/dashboard-stats", response_model=None)
def get_dashboard_stats(
    level: Literal["bundesland", "landkreis", "gemeinde", "plz2", "plz3", "plz5"],
    selection: Selection,
    db: Session = Depends(get_db),
):
    """Solar per Bundesland, Landkreis or Gemeinde, or per postcode, for the chosen Anlagenarten, Brutto or Netto."""
    measures = ("total_power", "relative_area_power", "relative_population_power")
    if level in get_args(RegionLevel):
        model = SolarRegionStats
        keys = (model.bundesland, model.landkreis, model.gemeinde)
        return summed(db, model, keys, model.at_level(level), selection, (*measures, "added_12m_power"))

    model = SolarRollupStats
    keys = (model.plz2, model.plz3, model.plz5)
    key, finer = PLZ_LEVELS[level]
    filters = (getattr(model, key).isnot(None), *((getattr(model, finer).is_(None),) if finer else ()))
    return summed(db, model, keys, filters, selection, measures)


@router.get("/heatmap", response_model=HeatmapPoints)
def get_heatmap(response: Response, db: Annotated[Session, Depends(get_db)], selection: Selection):
    """Where the solar power lies, for the continuous map: units with coordinates per cell of about 1 km, the others per
    postcode, in kW (mrt.heatmap_points)."""
    response.headers["Cache-Control"] = CACHE_CONTROL
    return HeatmapPoint.of(db, "solar", selection.anlagenarten, "power_net" if selection.netto else "power")


@router.get("/size-distribution", response_model=list[SizeClassShare])
def get_size_distribution(
    response: Response, db: Annotated[Session, Depends(get_db)], selection: Selection, region: Region = "DE"
):
    """Units and power per size class (Balkon-PV to Solarpark), for Deutschland, a Land or a Kreis."""
    response.headers["Cache-Control"] = CACHE_CONTROL
    return SizeDistribution.of(db, "solar", region, selection.anlagenarten, selection.netto)


@router.get("/orientation", response_model=list[OrientationShare])
def get_orientation(
    response: Response, db: Annotated[Session, Depends(get_db)], selection: Selection, region: Region = "DE"
):
    """Units and power per main orientation of the modules (8 directions, ost_west, nachgefuehrt, unbekannt)."""
    response.headers["Cache-Control"] = CACHE_CONTROL
    return SolarOrientation.of(db, region, selection.anlagenarten, selection.netto)


@router.get("/zubau", response_model=list[ZubauYear])
def get_zubau(response: Response, db: Annotated[Session, Depends(get_db)], selection: Selection, region: Region = "DE"):
    """Zubau and Bestand per year since 2000 in a region, per chosen Anlagenart (mrt.solar_zubau_regions)."""
    response.headers["Cache-Control"] = CACHE_CONTROL
    return SolarZubauRegion.of(db, region, selection.anlagenarten, selection.netto)


@router.get("/size-distribution/regions", response_model=RegionTable)
def get_size_distribution_regions(
    response: Response,
    db: Annotated[Session, Depends(get_db)],
    scope: Annotated[Regions, Depends(regions)],
    selection: Selection,
):
    """Units and power per size class for every Land, Kreis or Gemeinde (optionally within one)."""
    response.headers["Cache-Control"] = CACHE_CONTROL
    return SizeDistribution.table(db, "solar", scope.level, scope.within, selection.anlagenarten, selection.netto)


@router.get("/orientation/regions", response_model=RegionTable)
def get_orientation_regions(
    response: Response,
    db: Annotated[Session, Depends(get_db)],
    scope: Annotated[Regions, Depends(regions)],
    selection: Selection,
):
    """Units and power per orientation for every Land, Kreis or Gemeinde (optionally within one)."""
    response.headers["Cache-Control"] = CACHE_CONTROL
    return SolarOrientation.table(db, scope.level, scope.within, selection.anlagenarten, selection.netto)


@router.get("/pv-speicher", response_model=PvSpeicherData)
def get_pv_speicher(response: Response, db: Annotated[Session, Depends(get_db)]):
    """Solar units and batteries at the same Lokation, Germany-wide: the solar units per Anlagenart, size class and year
    with the batteries at their Lokation, and the batteries per size class with or without solar there. Every value
    adds up; the page sums what it shows."""
    response.headers["Cache-Control"] = CACHE_CONTROL
    return {"pv": db.query(PvSpeicher).all(), "speicher": db.query(SpeicherPv).all()}
