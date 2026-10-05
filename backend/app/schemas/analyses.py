from dataclasses import dataclass
from typing import Annotated

from fastapi import HTTPException, Query
from pydantic import BaseModel, ConfigDict

from app.models.analyses import DIGITS
from app.models.regions import RegionLevel

# The dashboard's scope: all of Germany, a Bundesland, a Landkreis or a Gemeinde, by its Gemeindeschlüssel (prefix)
Region = Annotated[
    str,
    Query(
        pattern=r"^(DE|\d{2}|\d{5}|\d{8})$",
        description='"DE", a Bundesland (e.g. "09"), a Landkreis (e.g. "09175") or a Gemeinde (e.g. "09175111")',
    ),
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


class ZubauYear(BaseModel):
    """Solar units of one Anlagenart in a region: those that went into operation in the year, and those in operation at
    its end (mrt.solar_zubau_regions)."""

    model_config = ConfigDict(from_attributes=True)

    year: int
    anlagenart: str
    added_units: int
    added: float  # MW
    installed_units: int
    installed: float  # MW


class BatteryZubauYear(BaseModel):
    """Battery units of one size class in a region: those that went into operation in the year, and those in operation
    at its end (mrt.battery_zubau_regions)."""

    model_config = ConfigDict(from_attributes=True)

    year: int
    size_class: str
    added_units: int
    added_power: float  # MW
    added_capacity: float  # MWh
    installed_units: int
    installed_power: float
    installed_capacity: float


class BatterySizeClass(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    size_class: int
    label: str
    hint: str | None
    total_units: int
    total_power: float  # MW
    total_capacity: float  # MWh


class HeatmapPoints(BaseModel):
    """Points for the continuous map as columns, one entry per point (mrt.heatmap_points): the website spreads each value
    with a Gaussian kernel of width sigma around its centre."""

    lon: list[float]
    lat: list[float]
    sigma: list[float]  # km
    value: list[float]  # kW, or kWh for the capacity of batteries


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


class PvSpeicherRow(BaseModel):
    """Solar units of one Anlagenart, size class and year, and the batteries at their Lokation (mrt.pv_speicher)."""

    model_config = ConfigDict(from_attributes=True)

    anlagenart: str
    size_class: int
    size_label: str
    year: int
    pv_units: int
    pv_power: float  # MW
    pv_power_net: float
    with_battery_units: int
    with_battery_power: float
    with_battery_power_net: float
    battery_power: float  # MW
    battery_capacity: float  # MWh
    retrofit_units: int
    flagged_units: int
    flagged_with_battery_units: int


class SpeicherPvRow(BaseModel):
    """Batteries of one size class, with or without solar at their Lokation (mrt.speicher_pv)."""

    model_config = ConfigDict(from_attributes=True)

    size_class: str
    with_pv: bool
    units: int
    power: float  # MW
    capacity: float  # MWh


class PvSpeicherData(BaseModel):
    pv: list[PvSpeicherRow]
    speicher: list[SpeicherPvRow]
