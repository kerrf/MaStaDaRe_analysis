from datetime import date
from typing import Any

from pydantic import BaseModel, Field


class SolarResponse(BaseModel):
    EinheitMastrNummer: str
    Inbetriebnahmedatum: date | None
    Bruttoleistung: float | None
    Postleitzahl: str | None

    class Config:
        from_attributes = True


class SolarFilter(BaseModel):
    min_power: float | None = Field(None, description="Minimum Bruttoleistung")
    plz: str | None = Field(None, description="Postal ode filter")
    limit: int = Field(100, le=10000, description="Max rows to return (hard cap at 10000)")


class DynamicAggregationRequest(BaseModel):
    group_by_columns: list[str] = Field(default=None, description="Columns to group data by")

    min_power: float | None = None
    plz: str | None = None


class AggregationResponse(BaseModel):
    dimensions: dict[str, Any]

    total_units: int
    total_power: float
