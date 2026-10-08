from typing import Annotated, Literal

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.db.database import get_db
from app.models.gas import GasProducer, GasStorage
from app.schemas.analyses import GasSizeClass, KindShare, Region
from app.schemas.gas import GasProducerSite, GasStorageSite

router = APIRouter(prefix="/gas", tags=["Gas"])

Db = Annotated[Session, Depends(get_db)]
# The website's choice of kinds (its filters, ?technik=…&technik=…); none: all
Technik = Annotated[list[Literal["biomethan", "erdgas", "lng", "wasserstoff", "methan"]] | None, Query()]
Speicherart = Annotated[list[Literal["kaverne", "pore", "aquifer"]] | None, Query()]


@router.get("/erzeuger", response_model=list[GasProducerSite])
def get_producers(db: Db):
    """Every gas producer with its location, technology and Erzeugungsleistung (MW), the largest first."""
    return db.query(GasProducer).order_by(GasProducer.total_power.desc().nulls_last(), GasProducer.mastr_nummer).all()


@router.get("/speicher", response_model=list[GasStorageSite])
def get_storages(db: Db):
    """Every gas storage with its location, working gas (GWh, Mio. m³) and Aus-/Einspeicherleistung (MW), the largest first."""
    return db.query(GasStorage).order_by(GasStorage.total_capacity.desc().nulls_last(), GasStorage.mastr_nummer).all()


@router.get("/erzeuger/size-distribution", response_model=list[GasSizeClass])
def get_producer_sizes(db: Db, region: Region = "DE", technik: Technik = None):
    """Producers in operation in a region per class of their Erzeugungsleistung (MW), every class."""
    return GasProducer.size_classes(db, region, technik)


@router.get("/erzeuger/kinds", response_model=list[KindShare])
def get_producer_kinds(db: Db, region: Region = "DE", technik: Technik = None):
    """Producers in operation in a region by technology, the ones that occur."""
    return GasProducer.kinds(db, region, technik)


@router.get("/speicher/size-distribution", response_model=list[GasSizeClass])
def get_storage_sizes(db: Db, region: Region = "DE", speicherart: Speicherart = None):
    """Storages in operation in a region per class of their working gas (GWh), every class."""
    return GasStorage.size_classes(db, region, speicherart)


@router.get("/speicher/kinds", response_model=list[KindShare])
def get_storage_kinds(db: Db, region: Region = "DE", speicherart: Speicherart = None):
    """Storages in operation in a region by storage type, the ones that occur."""
    return GasStorage.kinds(db, region, speicherart)
