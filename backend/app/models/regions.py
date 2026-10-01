from typing import Literal

from sqlalchemy import Column, Float, Integer, String

from app.models.solar import Base

RegionLevel = Literal["bundesland", "landkreis", "gemeinde"]


class RegionStats:
    """One row per Bundesland, Landkreis and Gemeinde (ROLLUP views in mrt, see etl/queries/*_by_region_power.sql).

    The key columns hold the Gemeindeschlüssel prefix of the row's level (2, 5 or 8 digits, or "offshore" for the
    sea); on a Landkreis row, gemeinde is NULL, on a Bundesland row, landkreis and gemeinde are.
    """

    bundesland = Column(String, primary_key=True)
    landkreis = Column(String, primary_key=True)
    gemeinde = Column(String, primary_key=True)

    total_units = Column(Integer)
    total_power = Column(Float)
    relative_area_power = Column(Float)
    relative_population_power = Column(Float)
    added_12m_power = Column(Float)  # Zubau: in operation since less than 12 months, MW

    @classmethod
    def at_level(cls, level: RegionLevel) -> tuple:
        """Filter for the rows of one level."""
        return {
            "bundesland": (cls.bundesland.isnot(None), cls.landkreis.is_(None)),
            "landkreis": (cls.landkreis.isnot(None), cls.gemeinde.is_(None)),
            "gemeinde": (cls.gemeinde.isnot(None),),
        }[level]


class SolarRegionStats(RegionStats, Base):
    """Per Anlagenart (gebaeude, freiflaeche), with Netto (AC) next to the Brutto (DC) power."""

    __tablename__ = "solar_region_stats"
    __table_args__ = {"schema": "mrt"}

    anlagenart = Column(String, primary_key=True)
    total_power_net = Column(Float)
    relative_area_power_net = Column(Float)
    relative_population_power_net = Column(Float)
    added_12m_power_net = Column(Float)


class WindRegionStats(RegionStats, Base):
    __tablename__ = "wind_region_stats"
    __table_args__ = {"schema": "mrt"}


class WaterRegionStats(RegionStats, Base):
    __tablename__ = "water_region_stats"
    __table_args__ = {"schema": "mrt"}


class BatteryRegionStats(RegionStats, Base):
    __tablename__ = "battery_region_stats"
    __table_args__ = {"schema": "mrt"}

    added_12m_capacity = Column(Float)  # usable capacity that went into operation in the last 12 months, MWh
