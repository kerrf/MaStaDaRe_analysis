from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.db.database import get_db
from app.models.pumped_storage import PumpedStoragePlant

router = APIRouter(prefix="/pumped-storage", tags=["Pumped Storage Data"])


@router.get("/plants", response_model=None)
async def get_plants(db: Session = Depends(get_db)):
    """Every pumped-storage plant with its location, power and storage capacity."""
    return db.query(PumpedStoragePlant).order_by(PumpedStoragePlant.total_capacity.desc().nulls_last()).all()
