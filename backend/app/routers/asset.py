from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy import select, func, String
from typing import List

from app.models.asset import SolarUnit
from app.schemas.asset import PowerAggregationResult
from app.db.database import (
    get_db,
)  # Assuming you have a dependency that yields a DB session

router = APIRouter(prefix="/assets", tags=["Assets"])

@router.get("/aggregation/power", response_model=List[PowerAggregationResult])
def get_power_aggregation(
    group_by: str     = Query("plz", description="Group by 'plz' or 'date'"),
    limit   : int     = Query(100, description="Limit results"),
    db      : Session = Depends(get_db)
):
    if group_by == "plz":
        group_col = SolarUnit.Postleitzahl
    elif group_by == "date":
        group_col = SolarUnit.Inbetriebnahmedatum
    else:
        raise HTTPException(status_code=400, detail="group_by must be 'plz' or 'date'")
    
    stmt = (
        select(
            func.cast(group_col, String).label("group_key"),
            func.sum(SolarUnit.Bruttoleistung).label("total_power"),
            func.count(SolarUnit.EinheitMastrNummer).label("unit_count")
        )
        .group_by(group_col)
        .filter(group_col.is_not(None))
        .order_by(func.sum(SolarUnit.Bruttoleistung).desc())
        .limit(limit)
    )
    
    results = db.execute(stmt).mappings().all()
    return results
