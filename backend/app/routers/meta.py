from datetime import date, datetime

from fastapi import APIRouter, Depends, Response
from pydantic import BaseModel
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.db.database import get_db

router = APIRouter(prefix="/meta", tags=["Meta"])


class Datenstand(BaseModel):
    datenstand: date | None  # the data includes every change of the register up to this day
    last_update: datetime | None  # when the nightly update that brought it finished


@router.get("/datenstand", response_model=Datenstand)
def get_datenstand(response: Response, db: Session = Depends(get_db)):
    """The Datenstand noted by the last complete nightly update (app.etl.update); null until one has run."""
    response.headers["Cache-Control"] = "public, max-age=900"  # changes once a night
    if db.execute(text("SELECT to_regclass('meta.update_runs')")).scalar() is None:
        return Datenstand(datenstand=None, last_update=None)
    row = db.execute(text("SELECT datenstand, finished_at FROM meta.update_runs ORDER BY finished_at DESC LIMIT 1")).first()
    return Datenstand(datenstand=row.datenstand if row else None, last_update=row.finished_at if row else None)
