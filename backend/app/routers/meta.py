from datetime import date, datetime
from typing import Annotated

from fastapi import APIRouter, Depends, Response
from pydantic import BaseModel, Field
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.db.database import get_db

router = APIRouter(prefix="/meta", tags=["Meta"])

LATEST_RUN = """
    SELECT datenstand, finished_at FROM meta.update_runs ORDER BY finished_at DESC LIMIT 1
"""


class Datenstand(BaseModel):
    datenstand: date | None = Field(description="The data includes every change of the register up to this day")
    last_update: datetime | None = Field(description="When the nightly update that brought it finished")


@router.get("/datenstand", response_model=Datenstand)
def get_datenstand(response: Response, db: Annotated[Session, Depends(get_db)]):
    """Noted by the last complete nightly update (app.etl.update); null until one ran."""
    response.headers["Cache-Control"] = "public, max-age=900"  # changes once a night
    if db.execute(text("SELECT to_regclass('meta.update_runs')")).scalar() is None:
        return Datenstand(datenstand=None, last_update=None)
    row = db.execute(text(LATEST_RUN)).first()
    return Datenstand(
        datenstand=row.datenstand if row else None,
        last_update=row.finished_at if row else None,
    )
