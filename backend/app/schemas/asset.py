from pydantic import BaseModel, Field


class PowerAggregationResult(BaseModel):
    group_key: str = Field(..., description="The PLZ or Installation Date")
    total_power: float = Field(..., description="Sum of Bruttoleistung")
    unit_count: int = Field(..., description="Number of installations")
    # TODO: make this better
    class Config:
        # Read data directly from SQLAlchemy objects = True
        from_attributes = True
