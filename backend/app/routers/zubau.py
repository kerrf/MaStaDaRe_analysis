from typing import Annotated

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel, ConfigDict
from sqlalchemy.orm import Session

from app.db.database import get_db
from app.models.zubau import Registrierungen, Registrierungsverzug, Technology, Zubau

router = APIRouter(prefix="/zubau", tags=["Zubau"])


@router.get("/zeitverlauf", response_model=None)
async def get_zeitverlauf(
    technology: Annotated[list[Technology] | None, Query()] = None,
    yearly: Annotated[bool, Query(description="Only the rows per year, without the months")] = False,
    db: Session = Depends(get_db),
):
    """Zubau and Bestand per month and year in Germany, for the given series (default: all)."""
    query = db.query(Zubau)
    if technology:
        query = query.filter(Zubau.technology.in_(technology))
    if yearly:
        query = query.filter(Zubau.month.is_(None))
    return query.order_by(Zubau.technology, Zubau.year, Zubau.month.nulls_first()).all()


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
    yearly: Annotated[bool, Query(description="Only the rows per year, without the months")] = False,
):
    """Units registered in the Marktstammdatenregister per month and year and technology, from the first registration
    on: in the period, and all up to its end."""
    query = db.query(Registrierungen)
    if yearly:
        query = query.filter(Registrierungen.month.is_(None))
    return query.order_by(Registrierungen.technology, Registrierungen.year, Registrierungen.month.nulls_first()).all()


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
def get_registrierungsverzug(db: Annotated[Session, Depends(get_db)]):
    """Units per year of commissioning and technology by the time from going into operation to the registration:
    before, within a month (the deadline), 1–3 months, 3–12 months, later. Since the register started (31.01.2019)."""
    return db.query(Registrierungsverzug).order_by(Registrierungsverzug.technology, Registrierungsverzug.year).all()
