from typing import Annotated

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.db.database import get_db
from app.models.zubau import Technology, Zubau

router = APIRouter(prefix="/zubau", tags=["Zubau"])


@router.get("/zeitverlauf", response_model=None)
async def get_zeitverlauf(
    technology: Annotated[list[Technology] | None, Query()] = None,
    db: Session = Depends(get_db)
):
    """Zubau and Bestand per month and year in Germany, for the given series (default: all)."""
    query = db.query(Zubau)
    if technology:
        query = query.filter(Zubau.technology.in_(technology))
    return query.order_by(Zubau.technology, Zubau.year, Zubau.month.nulls_first()).all()
