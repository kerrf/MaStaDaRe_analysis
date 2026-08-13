from pydantic import BaseModel, Field
from typing import Optional, List, Dict, Any
from datetime import date

class SolarResponse(BaseModel):
    EinheitMastrNummer : str
    Inbetriebnahmedatum: Optional[date]
    Bruttoleistung     : Optional[float]
    Postleitzahl       : Optional[str]
    
    class Config:
        from_attributes = True

class SolarFilter(BaseModel):
    min_power: Optional[float] = Field(None, description = "Minimum Bruttoleistung")
    plz      : Optional[str]   = Field(None, description = "Postal ode filter")
    limit    : int             = Field(100, le           = 10000, description = "Max rows to return (hard cap at 10000)")
    
    
class DynamicAggregationRequest(BaseModel):
    group_by_columns: List[str] = Field(
        default=None,
        description="Columns to group data by"
    )
    
    min_power: Optional[float] = None
    plz      : Optional[str]   = None

class AggregationResponse(BaseModel):
    dimensions : Dict[str, Any]
    
    total_units: int
    total_power: float