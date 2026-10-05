from sqlalchemy import BigInteger, Boolean, Column, Float, Integer, String, cast, func
from sqlalchemy.dialects.postgresql import aggregate_order_by
from sqlalchemy.orm import Session

from app.models.regions import RegionLevel
from app.models.solar import Base

# Digits of the Gemeindeschlüssel that key a region of each level
DIGITS = {"bundesland": 2, "landkreis": 5, "gemeinde": 8}
# Hydropower has one row per class and region, solar one per Anlagenart, wind one per Lage (the API sums the chosen ones)
ALL = ("alle",)


def level_of(region: str) -> str:
    """The level of a region key: "DE" is all of Germany."""
    return "deutschland" if region == "DE" else {digits: level for level, digits in DIGITS.items()}[len(region)]


def in_level(model, level: RegionLevel, within: str | None) -> tuple:
    """Filter for the regions of one level: all of them, or those within a Land or Kreis."""
    return (model.level == level, model.region.startswith(within)) if within else (model.level == level,)


def power_of(model, netto: bool):
    """The power column in the chosen measure: Brutto (DC) or Netto (AC)."""
    return model.total_power_net if netto else model.total_power


def table_of(db: Session, model, order, filters: tuple, netto: bool) -> list:
    """Every region of a level: its units and power per column (summed over the chosen Anlagenarten), in column order."""
    per_column = (
        db.query(
            model.region,
            order.label("column"),
            func.sum(model.total_units).label("units"),
            func.sum(power_of(model, netto)).label("power"),
        )
        .filter(*filters)
        .group_by(model.region, order)
        .subquery()
    )
    return (
        db.query(
            per_column.c.region,
            func.array_agg(aggregate_order_by(per_column.c.units, per_column.c.column)).label("units"),
            func.array_agg(aggregate_order_by(cast(per_column.c.power, Float), per_column.c.column)).label("power"),
        )
        .group_by(per_column.c.region)
        .order_by(per_column.c.region)
        .all()
    )


class SizeDistribution(Base):
    """Units and power per size class, per technology and region (etl/queries/aggregate_size_distribution.sql).

    region: "DE", a Bundesland (2-digit Gemeindeschlüssel), Landkreis (5) or Gemeinde (8). Every region has every class.
    """

    __tablename__ = "size_distribution"
    __table_args__ = {"schema": "mrt"}

    technology = Column(String, primary_key=True)  # solar, wind, water
    anlagenart = Column(String, primary_key=True)  # solar: gebaeude, freiflaeche; wind: an_land, auf_see; water: alle
    level = Column(String)  # deutschland, bundesland, landkreis, gemeinde
    region = Column(String, primary_key=True)
    size_class = Column(Integer, primary_key=True)  # 1 = the smallest
    label = Column(String)  # "10–40 kWp"
    hint = Column(String)  # "große Dachanlagen", solar only

    total_units = Column(Integer)
    total_power = Column(Float)  # MW, Brutto
    total_power_net = Column(Float)  # MW, Netto

    @classmethod
    def of(cls, db: Session, technology: str, region: str, anlagenarten=ALL, netto=False) -> list:
        """The classes of one technology in one region, the smallest first."""
        return (
            db.query(
                cls.size_class,
                cls.label,
                cls.hint,
                func.sum(cls.total_units).label("total_units"),
                func.sum(power_of(cls, netto)).label("total_power"),
            )
            .filter(
                cls.technology == technology,
                cls.level == level_of(region),
                cls.region == region,
                cls.anlagenart.in_(anlagenarten),
            )
            .group_by(cls.size_class, cls.label, cls.hint)
            .order_by(cls.size_class)
            .all()
        )

    @classmethod
    def table(cls, db, technology: str, level: RegionLevel, within: str | None, anlagenarten=ALL, netto=False) -> dict:
        """Every region of a level: its units and power per class, in the order of the columns."""
        columns = (
            db.query(cast(cls.size_class, String).label("key"), cls.label, cls.hint)
            .filter_by(technology=technology, anlagenart=anlagenarten[0], level="deutschland", region="DE")
            .order_by(cls.size_class)
            .all()
        )
        filters = (cls.technology == technology, cls.anlagenart.in_(anlagenarten), *in_level(cls, level, within))
        return {"columns": columns, "rows": table_of(db, cls, cls.size_class, filters, netto)}


class SolarOrientation(Base):
    """Solar units and power per main orientation of the modules and region (aggregate_solar_orientation.sql)."""

    __tablename__ = "solar_orientation"
    __table_args__ = {"schema": "mrt"}

    level = Column(String)  # deutschland, bundesland, landkreis, gemeinde
    region = Column(String, primary_key=True)
    anlagenart = Column(String, primary_key=True)  # gebaeude, freiflaeche
    orientation = Column(String, primary_key=True)  # nord … nordwest, ost_west, nachgefuehrt, unbekannt
    label = Column(String)  # "Nordost"
    sort = Column(Integer)  # the compass clockwise from north, then Ost-West, tracked, unknown

    total_units = Column(Integer)
    total_power = Column(Float)  # MW, Brutto
    total_power_net = Column(Float)  # MW, Netto

    @classmethod
    def of(cls, db: Session, region: str, anlagenarten: tuple, netto: bool) -> list:
        """The orientations in one region, in the order of the columns."""
        return (
            db.query(
                cls.orientation,
                func.sum(cls.total_units).label("total_units"),
                func.sum(power_of(cls, netto)).label("total_power"),
            )
            .filter(cls.level == level_of(region), cls.region == region, cls.anlagenart.in_(anlagenarten))
            .group_by(cls.orientation, cls.sort)
            .order_by(cls.sort)
            .all()
        )

    @classmethod
    def table(cls, db: Session, level: RegionLevel, within: str | None, anlagenarten: tuple, netto: bool) -> dict:
        """Every region of a level: its units and power per orientation, in the order of the columns."""
        columns = (
            db.query(cls.orientation.label("key"), cls.label)
            .filter_by(level="deutschland", region="DE", anlagenart="gebaeude")
            .order_by(cls.sort)
            .all()
        )
        filters = (cls.anlagenart.in_(anlagenarten), *in_level(cls, level, within))
        return {"columns": columns, "rows": table_of(db, cls, cls.sort, filters, netto)}


class SolarZubauRegion(Base):
    """Solar Zubau and Bestand per year, Anlagenart and region since 2000 (aggregate_solar_zubau_regions.sql)."""

    __tablename__ = "solar_zubau_regions"
    __table_args__ = {"schema": "mrt"}

    level = Column(String)  # deutschland, bundesland, landkreis, gemeinde
    region = Column(String, primary_key=True)
    year = Column(Integer, primary_key=True)
    anlagenart = Column(String, primary_key=True)  # gebaeude, freiflaeche

    added_units = Column(Integer)  # went into operation in the year
    added = Column(Float)  # MW, Brutto
    added_net = Column(Float)  # MW, Netto
    installed_units = Column(Integer)  # in operation at the end of the year
    installed = Column(Float)
    installed_net = Column(Float)

    @classmethod
    def of(cls, db: Session, region: str, anlagenarten: tuple, netto: bool) -> list:
        """The years of one region, per chosen Anlagenart, in the chosen measure."""
        return (
            db.query(
                cls.year,
                cls.anlagenart,
                cls.added_units,
                (cls.added_net if netto else cls.added).label("added"),
                cls.installed_units,
                (cls.installed_net if netto else cls.installed).label("installed"),
            )
            .filter(cls.level == level_of(region), cls.region == region, cls.anlagenart.in_(anlagenarten))
            .order_by(cls.year, cls.anlagenart)
            .all()
        )


class BatteryZubauRegion(Base):
    """Battery Zubau and Bestand per year, size class and region since 2013 (aggregate_battery_zubau_regions.sql)."""

    __tablename__ = "battery_zubau_regions"
    __table_args__ = {"schema": "mrt"}

    level = Column(String)  # deutschland, bundesland, landkreis, gemeinde
    region = Column(String, primary_key=True)
    year = Column(Integer, primary_key=True)
    size_class = Column(String, primary_key=True)  # heimspeicher, gewerbespeicher, grossspeicher

    added_units = Column(Integer)  # went into operation in the year
    added_power = Column(Float)  # MW
    added_capacity = Column(Float)  # MWh
    installed_units = Column(Integer)  # in operation at the end of the year
    installed_power = Column(Float)
    installed_capacity = Column(Float)

    @classmethod
    def of(cls, db: Session, region: str) -> list:
        """The years of one region, per size class."""
        return (
            db.query(cls)
            .filter(cls.level == level_of(region), cls.region == region)
            .order_by(cls.year, cls.size_class)
            .all()
        )


class BatterySizeDistribution(Base):
    """Battery units in operation per size class of their plant's capacity and region (aggregate_battery_size_distribution.sql)."""

    __tablename__ = "battery_size_distribution"
    __table_args__ = {"schema": "mrt"}

    level = Column(String)  # deutschland, bundesland, landkreis, gemeinde
    region = Column(String, primary_key=True)
    size_class = Column(Integer, primary_key=True)  # 1 = the smallest
    label = Column(String)  # "5–10 kWh"
    hint = Column(String)  # "Heimspeicher"

    total_units = Column(Integer)
    total_power = Column(Float)  # MW
    total_capacity = Column(Float)  # MWh

    @classmethod
    def of(cls, db: Session, region: str) -> list:
        """The classes of one region, the smallest first."""
        return db.query(cls).filter(cls.level == level_of(region), cls.region == region).order_by(cls.size_class).all()


class HeatmapPoint(Base):
    """Where the power of solar, wind and batteries lies, as points for the continuous map (aggregate_heatmap_points.sql):
    units with coordinates per cell of about 1 km (site), the others per postcode (area), each with the width of its
    kernel."""

    __tablename__ = "heatmap_points"
    __table_args__ = {"schema": "mrt"}

    technology = Column(String, primary_key=True)  # solar, wind, batterie
    anlagenart = Column(
        String, primary_key=True
    )  # solar: gebaeude, freiflaeche; wind: an_land, auf_see; batterie: alle
    kind = Column(String, primary_key=True)  # site, area
    point = Column(BigInteger, primary_key=True)  # the cell (column * 100000 + row) or the postcode

    lon = Column(Float)
    lat = Column(Float)
    sigma_km = Column(Float)
    units = Column(Integer)
    power = Column(Float)  # kW, Brutto
    power_net = Column(Float)  # kW, Netto
    capacity = Column(Float)  # kWh, batteries

    @classmethod
    def of(cls, db: Session, technology: str, anlagenarten=ALL, measure: str = "power") -> dict:
        """The points of one technology for the chosen Anlagenarten, summed per point, as columns: the centre (weighted by
        the measure, which matters where a cell holds both Anlagenarten), the kernel's width (km) and the measure."""
        weight = getattr(cls, measure)
        total = func.sum(weight)
        points = (
            db.query(
                (func.sum(cls.lon * weight) / total).label("lon"),
                (func.sum(cls.lat * weight) / total).label("lat"),
                func.max(cls.sigma_km).label("sigma"),
                total.label("value"),
            )
            .filter(cls.technology == technology, cls.anlagenart.in_(anlagenarten))
            .group_by(cls.kind, cls.point)
            .having(total > 0)
            .subquery()
        )

        def column(value, digits: int):
            # Rounded (4 digits of a degree: about 10 m) in floating point, much faster than as NUMERIC, and as one
            # array: a row per point would cost far more
            return func.array_agg(func.round(value * 10**digits) / 10**digits)

        row = db.query(
            column(points.c.lon, 4).label("lon"),
            column(points.c.lat, 4).label("lat"),
            func.array_agg(points.c.sigma).label("sigma"),
            column(points.c.value, 1).label("value"),
        ).one()
        return {name: getattr(row, name) or [] for name in ("lon", "lat", "sigma", "value")}


class PvSpeicher(Base):
    """Solar units per Anlagenart, size class and year, and the batteries at their Lokation (aggregate_pv_speicher.sql)."""

    __tablename__ = "pv_speicher"
    __table_args__ = {"schema": "mrt"}

    anlagenart = Column(String, primary_key=True)
    size_class = Column(Integer, primary_key=True)
    size_label = Column(String)
    year = Column(Integer, primary_key=True)  # of commissioning

    pv_units = Column(Integer)
    pv_power = Column(Float)  # MW
    pv_power_net = Column(Float)
    with_battery_units = Column(Integer)  # with a battery at their Lokation
    with_battery_power = Column(Float)
    with_battery_power_net = Column(Float)
    battery_power = Column(Float)  # MW, of these batteries (split between the Lokation's solar units)
    battery_capacity = Column(Float)  # MWh
    retrofit_units = Column(Integer)  # the battery came more than a month after the solar unit
    flagged_units = Column(Integer)  # SpeicherAmGleichenOrt: the operator says there is a storage at the same place
    flagged_with_battery_units = Column(Integer)


class SpeicherPv(Base):
    """Batteries per size class, with or without a solar unit at their Lokation (aggregate_pv_speicher.sql)."""

    __tablename__ = "speicher_pv"
    __table_args__ = {"schema": "mrt"}

    size_class = Column(String, primary_key=True)  # heimspeicher, gewerbespeicher, grossspeicher
    with_pv = Column(Boolean, primary_key=True)

    units = Column(Integer)
    power = Column(Float)  # MW
    capacity = Column(Float)  # MWh, plausible ones
