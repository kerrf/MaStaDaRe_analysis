from typing import Annotated

from fastapi import APIRouter, Depends, Query, Response
from pydantic import BaseModel, ConfigDict
from sqlalchemy.orm import Session

from app.db.database import get_db
from app.models.zubau import Registrierungen, Technology, Zubau
from app.schemas.analyses import CACHE_CONTROL

router = APIRouter(prefix="/zubau", tags=["Zubau"])


@router.get("/zeitverlauf", response_model=None)
async def get_zeitverlauf(
    technology: Annotated[list[Technology] | None, Query()] = None,
    yearly: Annotated[bool, Query(description="Only the rows per year, without the months")] = False,
    db: Session = Depends(get_db)
):
    """Zubau and Bestand per month and year in Germany, for the given series (default: all)."""
    query = db.query(Zubau)
    if technology:
        query = query.filter(Zubau.technology.in_(technology))
    if yearly:
        query = query.filter(Zubau.month.is_(None))
    return query.order_by(Zubau.technology, Zubau.year, Zubau.month.nulls_first()).all()


class RegistrationYear(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    technology: str
    year: int
    units: int


@router.get("/registrierungen", response_model=list[RegistrationYear])
def get_registrierungen(response: Response, db: Annotated[Session, Depends(get_db)]):
    """Units registered in the Marktstammdatenregister per year and technology, from the first registration on."""
    response.headers["Cache-Control"] = CACHE_CONTROL
    return db.query(Registrierungen).order_by(Registrierungen.technology, Registrierungen.year).all()
