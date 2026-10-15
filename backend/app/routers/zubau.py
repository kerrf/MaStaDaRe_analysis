from typing import Annotated

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel, ConfigDict
from sqlalchemy.orm import Session

from app.db.database import get_db
from app.models.zubau import GeplantRegion, RegistrierungenRegion, RegistrierungsverzugRegion, Technology, ZubauRegion

router = APIRouter(prefix="/zubau", tags=["Zubau"])

# The scope of the Zubau page: all of Germany, a Bundesland or a Landkreis (no Gemeinden: the monthly series per
# Gemeinde would make the views too large)
ZubauScope = Annotated[
    str,
    Query(pattern=r"^(DE|\d{2}|\d{5})$", description='"DE", a Bundesland (e.g. "09") or a Landkreis (e.g. "09175")'),
]


@router.get("/zeitverlauf", response_model=None)
async def get_zeitverlauf(
    technology: Annotated[list[Technology] | None, Query()] = None,
    yearly: Annotated[bool, Query(description="Only the rows per year, without the months")] = False,
    region: ZubauScope = "DE",
    db: Session = Depends(get_db),
):
    """Zubau and Bestand per month and year in Germany, a Land or a Kreis, for the given series (default: all)."""
    query = db.query(ZubauRegion).filter(ZubauRegion.region == region)
    if technology:
        query = query.filter(ZubauRegion.technology.in_(technology))
    if yearly:
        query = query.filter(ZubauRegion.month.is_(None))
    return query.order_by(ZubauRegion.technology, ZubauRegion.year, ZubauRegion.month.nulls_first()).all()


@router.get("/geplant", response_model=None)
async def get_geplant(
    technology: Annotated[list[Technology] | None, Query()] = None,
    yearly: Annotated[bool, Query(description="Only the rows per year, without the months")] = False,
    region: ZubauScope = "DE",
    db: Session = Depends(get_db),
):
    """Units in planning by their planned commissioning date, per month and year, in Germany, a Land or a Kreis: the
    power planned to come in the period (added) and all planned up to its end (installed), for the given series."""
    query = db.query(GeplantRegion).filter(GeplantRegion.region == region)
    if technology:
        query = query.filter(GeplantRegion.technology.in_(technology))
    if yearly:
        query = query.filter(GeplantRegion.month.is_(None))
    return query.order_by(GeplantRegion.technology, GeplantRegion.year, GeplantRegion.month.nulls_first()).all()


class RegistrationPeriod(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    technology: str
    year: int
    month: int | None  # None: the whole year
    units: int  # registered within the period
    total: int  # registered up to its end


@router.get("/registrierungen", response_model=list[RegistrationPeriod])
def get_registrierungen(
    db: Annotated[Session, Depends(get_db)],
    technology: Annotated[list[str] | None, Query(description="Only these technologies (default: all)")] = None,
    yearly: Annotated[bool, Query(description="Only the rows per year, without the months")] = False,
    region: ZubauScope = "DE",
):
    """Units registered in the Marktstammdatenregister per month and year and technology, in Germany, a Land or a Kreis,
    from the first registration on: in the period, and all up to its end."""
    model = RegistrierungenRegion
    query = db.query(model).filter(model.region == region)
    if technology:
        query = query.filter(model.technology.in_(technology))
    if yearly:
        query = query.filter(model.month.is_(None))
    return query.order_by(model.technology, model.year, model.month.nulls_first()).all()


class RegistrationDelay(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    technology: str
    year: int
    units: int
    vorab: int
    bis_1_monat: int
    bis_3_monate: int
    bis_12_monate: int
    spaeter: int
    median_days: int


@router.get("/registrierungsverzug", response_model=list[RegistrationDelay])
def get_registrierungsverzug(db: Annotated[Session, Depends(get_db)], region: ZubauScope = "DE"):
    """Units per year of commissioning and technology, in Germany, a Land or a Kreis, by the time from going into
    operation to the registration: before, within a month (the deadline), 1–3 months, 3–12 months, later. Since the
    register started (31.01.2019)."""
    model = RegistrierungsverzugRegion
    return db.query(model).filter(model.region == region).order_by(model.technology, model.year).all()
