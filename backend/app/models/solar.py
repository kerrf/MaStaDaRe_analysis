from sqlalchemy import Column, Date, Float, Integer, String
from sqlalchemy.orm import declarative_base

Base = declarative_base()


class SolarUnit(Base):
    __tablename__ = "solar_units"
    __table_args__ = {"schema": "stg"}

    EinheitMastrNummer = Column(String, primary_key=True)
    Inbetriebnahmedatum = Column(Date)
    Bruttoleistung = Column(Float)
    Postleitzahl = Column(String)


class SolarBundeslandStats(Base):
    __tablename__ = "solar_units_bundesland_agg"
    __table_args__ = {"schema": "mrt"}

    Bundesland = Column(String, primary_key=True)

    total_units = Column(Integer)
    total_power = Column(Float)
    relative_area_power = Column(Float)
    relative_population_power = Column(Float)


class SolarRollupStats(Base):
    """Per Anlagenart (gebaeude, freiflaeche) and PLZ2 > PLZ3 > PLZ5, with Netto (AC) next to the Brutto (DC) power."""

    __tablename__ = "solar_rollup_stats"
    __table_args__ = {"schema": "mrt"}

    anlagenart = Column(String, primary_key=True)
    plz2 = Column(String, primary_key=True)
    plz3 = Column(String, primary_key=True)
    plz5 = Column(String, primary_key=True)

    total_units = Column(Integer)
    total_power = Column(Float)
    total_power_net = Column(Float)
    relative_area_power = Column(Float)
    relative_area_power_net = Column(Float)
    relative_population_power = Column(Float)
    relative_population_power_net = Column(Float)
