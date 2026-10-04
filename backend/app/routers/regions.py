from typing import Annotated

from fastapi import APIRouter, Depends, Response
from pydantic import BaseModel, ConfigDict
from sqlalchemy import func, null
from sqlalchemy.orm import Session

from app.db.database import get_db
from app.models.analyses import DIGITS
from app.models.regions import Gemeinde
from app.schemas.analyses import CACHE_CONTROL, Regions, regions

router = APIRouter(prefix="/regions", tags=["Regions"])


class RegionArea(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    region: str  # the Gemeindeschlüssel prefix of the level
    name: str | None  # Gemeinden only
    qkm: float
    einwohner: int


@router.get("/areas", response_model=list[RegionArea])
def get_areas(response: Response, db: Annotated[Session, Depends(get_db)], scope: Annotated[Regions, Depends(regions)]):
    """Area (km²) and population of every Bundesland, Landkreis or Gemeinde, optionally within one Land or Kreis
    (geo.gemeinden, VG250-EW): to compare a region's values per km² and per inhabitant with those of the regions around
    it. Gemeinden come with their name."""
    response.headers["Cache-Control"] = CACHE_CONTROL
    key = func.left(Gemeinde.ags, DIGITS[scope.level])
    # A Gemeinde is one row of its own: its name. Länder and Kreise have theirs elsewhere (config/regions.js, boundaries).
    name = func.max(Gemeinde.name) if scope.level == "gemeinde" else null()
    query = db.query(
        key.label("region"),
        name.label("name"),
        func.sum(Gemeinde.qkm).label("qkm"),
        func.sum(Gemeinde.einwohner).label("einwohner"),
    )
    if scope.within:
        query = query.filter(Gemeinde.ags.startswith(scope.within))
    return query.group_by(key).order_by(key).all()
