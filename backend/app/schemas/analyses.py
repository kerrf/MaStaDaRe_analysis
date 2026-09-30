from dataclasses import dataclass
from typing import Annotated

from fastapi import HTTPException, Query
from pydantic import BaseModel, ConfigDict

from app.models.analyses import DIGITS
from app.models.regions import RegionLevel

# The dashboard's scope: all of Germany, a Bundesland or a Landkreis, by its Gemeindeschlüssel prefix
Region = Annotated[
    str,
    Query(pattern=r"^(DE|\d{2}|\d{5})$", description='"DE", a Bundesland (e.g. "09") or a Landkreis (e.g. "09175")'),
]

# The views change once a night (update.py refreshes them)
CACHE_CONTROL = "public, max-age=900"

Within = Annotated[
    str | None,
    Query(pattern=r"^(\d{2}|\d{5})$", description='Only the regions in this Land (e.g. "09") or Kreis (e.g. "09175")'),
]


@dataclass(frozen=True)
class Regions:
    """All regions of a level, or those within a Land or Kreis."""

    level: RegionLevel
    within: str | None


def regions(level: RegionLevel, within: Within = None) -> Regions:
    if within and len(within) >= DIGITS[level]:
        raise HTTPException(status_code=422, detail=f"The {level} level has no regions within {within}")
    return Regions(level, within)


class SizeClassShare(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    size_class: int
    label: str
    hint: str | None
    total_units: int
    total_power: float  # MW


class OrientationShare(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    orientation: str
    total_units: int
    total_power: float  # MW


class RegionColumn(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    key: str
    label: str
    hint: str | None = None


class RegionRow(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    region: str  # Gemeindeschlüssel of the Land, Kreis or Gemeinde
    units: list[int]  # per column
    power: list[float]  # MW, per column


class RegionTable(BaseModel):
    """One row per region, its values in the order of the columns."""

    model_config = ConfigDict(from_attributes=True)

    columns: list[RegionColumn]
    rows: list[RegionRow]
