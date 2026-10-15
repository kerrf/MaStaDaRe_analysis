from typing import Literal

from sqlalchemy import Column, Float, Integer, String

from app.models.solar import Base

# solar: Bruttoleistung (DC), solar_netto: Nettonennleistung (AC), also per Anlagenart (solar_gebaeude,
# solar_freiflaeche); batteries: capacity, and power as "..._leistung"
Technology = Literal[
    "solar",
    "solar_netto",
    "solar_gebaeude",
    "solar_gebaeude_netto",
    "solar_freiflaeche",
    "solar_freiflaeche_netto",
    "wind_an_land",
    "wind_auf_see",
    "wasserkraft",
    "heimspeicher",
    "gewerbespeicher",
    "grossspeicher",
    "heimspeicher_leistung",
    "gewerbespeicher_leistung",
    "grossspeicher_leistung",
]


# Zubau, Registrierungen and Registrierungsverzug per region (etl/queries/aggregate_*_regions.sql): Deutschland ("DE"), a
# Bundesland (2-digit key) or a Landkreis (5 digits). A series that never had a unit in a region has no rows there. (The
# Germany-wide views mrt.zubau_zeitverlauf, registrierungen, registrierungsverzug are no longer read: they can go.)


class ZubauRegion(Base):
    """Zubau and Bestand per region, month and, with month NULL, year since 2000
    (aggregate_zubau_zeitverlauf_regions.sql). Solar and wind in MW, battery storage in MWh and in MW."""

    __tablename__ = "zubau_zeitverlauf_regions"
    __table_args__ = {"schema": "mrt"}

    region = Column(String, primary_key=True)
    technology = Column(String, primary_key=True)
    year = Column(Integer, primary_key=True)
    month = Column(Integer, primary_key=True)
    unit = Column(String)  # MW or MWh

    added_units = Column(Integer)
    added = Column(Float)  # Zubau: went into operation within the period
    installed = Column(Float)  # Bestand at the end of the period


class GeplantRegion(Base):
    """Units in planning (EinheitBetriebsstatus 31) by their planned commissioning date, per region, month and, with
    month NULL, year (aggregate_geplant_zeitverlauf_regions.sql): the power planned to come in the period (added) and all
    planned up to its end (installed), in MW. Solar per Anlagenart (also '…_netto'), wind an Land and auf See, hydropower.
    """

    __tablename__ = "geplant_zeitverlauf_regions"
    __table_args__ = {"schema": "mrt"}

    region = Column(String, primary_key=True)
    technology = Column(String, primary_key=True)
    year = Column(Integer, primary_key=True)
    month = Column(Integer, primary_key=True)
    unit = Column(String)  # MW

    added_units = Column(Integer)
    added = Column(Float)  # planned to go into operation within the period
    installed = Column(Float)  # all planned up to the end of the period


class RegistrierungenRegion(Base):
    """Units registered per region, month and, with month NULL, year (aggregate_registrierungen_regions.sql)."""

    __tablename__ = "registrierungen_regions"
    __table_args__ = {"schema": "mrt"}

    region = Column(String, primary_key=True)
    technology = Column(String, primary_key=True)
    year = Column(Integer, primary_key=True)
    month = Column(Integer, primary_key=True)
    units = Column(Integer)  # registered within the period
    total = Column(Integer)  # registered up to the end of the period


class RegistrierungsverzugRegion(Base):
    """Units per region, year of commissioning and technology by how long after going into operation they were
    registered (aggregate_registrierungsverzug_regions.sql)."""

    __tablename__ = "registrierungsverzug_regions"
    __table_args__ = {"schema": "mrt"}

    region = Column(String, primary_key=True)
    technology = Column(String, primary_key=True)
    year = Column(Integer, primary_key=True)  # of commissioning
    units = Column(Integer)
    vorab = Column(Integer)
    bis_1_monat = Column(Integer)
    bis_3_monate = Column(Integer)
    bis_12_monate = Column(Integer)
    spaeter = Column(Integer)
    median_days = Column(Integer)
