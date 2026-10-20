from typing import Literal

from sqlalchemy import Column, Float, Integer, String, func
from sqlalchemy.orm import Session

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


class KindRegionStats(RegionStats):
    """Region stats with one row per kind of the technology (art): every row carries its region's whole area and
    population, so the API sums the chosen kinds, the values per km² and per inhabitant too. Plants published with their
    Land only are in the Land's row alone (no Landkreis or Gemeinde of their own)."""

    art = Column(String, primary_key=True)

    @classmethod
    def summed(cls, db: Session, level: RegionLevel, arten: tuple[str, ...], measures: tuple[str, ...]) -> list[dict]:
        """The rows of one level for the chosen kinds, summed per region: total_units and the measures."""
        keys = (cls.bundesland, cls.landkreis, cls.gemeinde)
        rows = (
            db.query(
                *keys,
                func.sum(cls.total_units).label("total_units"),
                *(func.sum(getattr(cls, name)).label(name) for name in measures),
            )
            .filter(cls.art.in_(arten), *cls.at_level(level))
            .group_by(*keys)
            .all()
        )
        return [row._asdict() for row in rows]


class Gemeinde(Base):
    """Area and population of every Gemeinde (VG250-EW, scripts/geo/build_boundaries.py)."""

    __tablename__ = "gemeinden"
    __table_args__ = {"schema": "geo"}

    ags = Column(String, primary_key=True)
    name = Column(String)
    einwohner = Column(Integer)
    qkm = Column(Float)


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


class BiomassRegionStats(KindRegionStats, Base):
    """Per Biomasseart: gasfoermig, fest, fluessig (etl/queries/aggregate_biomass_by_region_power.sql)."""

    __tablename__ = "biomass_region_stats"
    __table_args__ = {"schema": "mrt"}


class GeothermalRegionStats(KindRegionStats, Base):
    """The units of raw.geothermal_units per Energieträger: geothermie, grubengas, klaerschlamm, druckentspannung,
    solarthermie (etl/queries/aggregate_geothermal_by_region_power.sql)."""

    __tablename__ = "geothermal_region_stats"
    __table_args__ = {"schema": "mrt"}


class KwkRegionStats(KindRegionStats, Base):
    """The KWK plants per Energieträger of their largest unit: erdgas, biomasse, kohle, sonstige; total_units counts
    plants, total_power is their electrical power (etl/queries/aggregate_kwk_by_region_power.sql)."""

    __tablename__ = "kwk_region_stats"
    __table_args__ = {"schema": "mrt"}

    total_heat = Column(Float)  # thermal power, MW
    relative_area_heat = Column(Float)  # kW per km²
    relative_population_heat = Column(Float)  # kW per inhabitant


class OtherStorageRegionStats(KindRegionStats, Base):
    """The storages that are neither batteries nor pumped storage, per Technologie: druckluft, schwungrad, wasserstoff
    (etl/queries/aggregate_other_storage_by_region_power.sql)."""

    __tablename__ = "other_storage_region_stats"
    __table_args__ = {"schema": "mrt"}

    total_capacity = Column(Float)  # MWh, as registered
    relative_area_capacity = Column(Float)  # kWh per km²
    relative_population_capacity = Column(Float)  # kWh per inhabitant
    added_12m_capacity = Column(Float)  # MWh


class BatteryRegionStats(RegionStats, Base):
    __tablename__ = "battery_region_stats"
    __table_args__ = {"schema": "mrt"}

    total_capacity = Column(Float)  # usable capacity, MWh (only units with a plausible one, like the Zubau)
    relative_area_capacity = Column(Float)  # kWh per km²
    relative_population_capacity = Column(Float)  # kWh per inhabitant
    added_12m_capacity = Column(Float)  # usable capacity that went into operation in the last 12 months, MWh


class NetzRegionStats(RegionStats, Base):
    """Netzanschlusspunkte der Stromerzeugung per Spannungsebene (hoechstspannung, hochspannung, mittelspannung,
    niederspannung) and region (etl/queries/aggregate_netzanschluesse.sql): total_units counts the points in operation,
    total_power is the power of their units (MW); the plants published with their Land only count in its row."""

    __tablename__ = "netz_region_stats"
    __table_args__ = {"schema": "mrt"}

    ebene = Column(String, primary_key=True)
    relative_area_units = Column(Float)  # points per km²
    relative_population_units = Column(Float)  # points per 1,000 inhabitants
    added_12m_units = Column(Integer)  # points whose first unit went into operation in the last 12 months
    planned_units = Column(Integer)  # points "noch in Planung" without a unit in operation
