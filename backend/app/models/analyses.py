from sqlalchemy import Column, Float, Integer, String, cast, func
from sqlalchemy.dialects.postgresql import aggregate_order_by
from sqlalchemy.orm import Session

from app.models.regions import RegionLevel
from app.models.solar import Base

# Digits of the Gemeindeschlüssel that key a region of each level
DIGITS = {"bundesland": 2, "landkreis": 5, "gemeinde": 8}


def level_of(region: str) -> str:
    """The level of a region key: "DE" is all of Germany."""
    return "deutschland" if region == "DE" else {digits: level for level, digits in DIGITS.items()}[len(region)]


def in_level(model, level: RegionLevel, within: str | None) -> tuple:
    """Filter for the regions of one level: all of them, or those within a Land or Kreis."""
    return (model.level == level, model.region.startswith(within)) if within else (model.level == level,)


class SizeDistribution(Base):
    """Units and power per size class, per technology and region (etl/queries/aggregate_size_distribution.sql).

    region: "DE", a Bundesland (2-digit Gemeindeschlüssel), Landkreis (5) or Gemeinde (8). Every region has every class.
    """

    __tablename__ = "size_distribution"
    __table_args__ = {"schema": "mrt"}

    technology = Column(String, primary_key=True)  # solar, wind, water
    level = Column(String)  # deutschland, bundesland, landkreis, gemeinde
    region = Column(String, primary_key=True)
    size_class = Column(Integer, primary_key=True)  # 1 = the smallest
    label = Column(String)  # "10–40 kWp"
    hint = Column(String)  # "große Dachanlagen", solar only

    total_units = Column(Integer)
    total_power = Column(Float)  # MW

    @classmethod
    def of(cls, db: Session, technology: str, region: str) -> list["SizeDistribution"]:
        """The classes of one technology in one region, the smallest first."""
        return (
            db.query(cls)
            .filter_by(technology=technology, level=level_of(region), region=region)
            .order_by(cls.size_class)
            .all()
        )

    @classmethod
    def table(cls, db: Session, technology: str, level: RegionLevel, within: str | None) -> dict:
        """Every region of a level: its units and power per class, in the order of the columns."""
        columns = (
            db.query(cast(cls.size_class, String).label("key"), cls.label, cls.hint)
            .filter_by(technology=technology, level="deutschland", region="DE")
            .order_by(cls.size_class)
            .all()
        )
        rows = (
            db.query(
                cls.region,
                func.array_agg(aggregate_order_by(cls.total_units, cls.size_class)).label("units"),
                func.array_agg(aggregate_order_by(cast(cls.total_power, Float), cls.size_class)).label("power"),
            )
            .filter(cls.technology == technology, *in_level(cls, level, within))
            .group_by(cls.region)
            .order_by(cls.region)
            .all()
        )
        return {"columns": columns, "rows": rows}


class SolarOrientation(Base):
    """Solar units and power per main orientation of the modules and region (aggregate_solar_orientation.sql)."""

    __tablename__ = "solar_orientation"
    __table_args__ = {"schema": "mrt"}

    level = Column(String)  # deutschland, bundesland, landkreis, gemeinde
    region = Column(String, primary_key=True)
    orientation = Column(String, primary_key=True)  # nord … nordwest, ost_west, nachgefuehrt, unbekannt
    label = Column(String)  # "Nordost"
    sort = Column(Integer)  # the compass clockwise from north, then Ost-West, tracked, unknown

    total_units = Column(Integer)
    total_power = Column(Float)  # MW

    @classmethod
    def of(cls, db: Session, region: str) -> list["SolarOrientation"]:
        """The orientations in one region, in the order of the columns."""
        return db.query(cls).filter_by(level=level_of(region), region=region).order_by(cls.sort).all()

    @classmethod
    def table(cls, db: Session, level: RegionLevel, within: str | None) -> dict:
        """Every region of a level: its units and power per orientation, in the order of the columns."""
        columns = (
            db.query(cls.orientation.label("key"), cls.label)
            .filter_by(level="deutschland", region="DE")
            .order_by(cls.sort)
            .all()
        )
        rows = (
            db.query(
                cls.region,
                func.array_agg(aggregate_order_by(cls.total_units, cls.sort)).label("units"),
                func.array_agg(aggregate_order_by(cast(cls.total_power, Float), cls.sort)).label("power"),
            )
            .filter(*in_level(cls, level, within))
            .group_by(cls.region)
            .order_by(cls.region)
            .all()
        )
        return {"columns": columns, "rows": rows}
