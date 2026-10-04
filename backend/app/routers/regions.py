from typing import Annotated

from fastapi import APIRouter, Depends, Response
from pydantic import BaseModel, ConfigDict
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.db.database import get_db
from app.models.analyses import DIGITS
from app.models.regions import Gemeinde, RegionLevel
from app.schemas.analyses import CACHE_CONTROL

router = APIRouter(prefix="/regions", tags=["Regions"])


class RegionArea(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    region: str  # the Gemeindeschlüssel prefix of the level
    qkm: float
    einwohner: int


@router.get("/areas", response_model=list[RegionArea])
def get_areas(level: RegionLevel, response: Response, db: Annotated[Session, Depends(get_db)]):
    """Area (km²) and population of every Bundesland, Landkreis or Gemeinde (geo.gemeinden, VG250-EW): to compare
    a region's values per km² and per inhabitant with those of the regions around it."""
    response.headers["Cache-Control"] = CACHE_CONTROL
    key = func.left(Gemeinde.ags, DIGITS[level])
    return (
        db.query(
            key.label("region"), func.sum(Gemeinde.qkm).label("qkm"), func.sum(Gemeinde.einwohner).label("einwohner")
        )
        .group_by(key)
        .order_by(key)
        .all()
    )
