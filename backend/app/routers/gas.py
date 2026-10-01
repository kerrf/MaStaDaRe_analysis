from typing import Annotated

from fastapi import APIRouter, Depends, Response
from sqlalchemy.orm import Session

from app.db.database import get_db
from app.models.gas import GasProducer, GasStorage
from app.schemas.analyses import CACHE_CONTROL
from app.schemas.gas import GasProducerSite, GasStorageSite

router = APIRouter(prefix="/gas", tags=["Gas"])

Db = Annotated[Session, Depends(get_db)]


@router.get("/erzeuger", response_model=list[GasProducerSite])
def get_producers(response: Response, db: Db):
    """Every gas producer with its location, technology and Erzeugungsleistung (MW), the largest first."""
    response.headers["Cache-Control"] = CACHE_CONTROL
    return db.query(GasProducer).order_by(GasProducer.total_power.desc().nulls_last(), GasProducer.mastr_nummer).all()


@router.get("/speicher", response_model=list[GasStorageSite])
def get_storages(response: Response, db: Db):
    """Every gas storage with its location, working gas (GWh, Mio. m³) and Aus-/Einspeicherleistung (MW), the largest first."""
    response.headers["Cache-Control"] = CACHE_CONTROL
    return db.query(GasStorage).order_by(GasStorage.total_capacity.desc().nulls_last(), GasStorage.mastr_nummer).all()
