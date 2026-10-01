from typing import Literal

from sqlalchemy import Column, Float, Integer, String

from app.models.solar import Base

# solar: Bruttoleistung (DC), solar_netto: Nettonennleistung (AC)
Technology = Literal[
    "solar", "solar_netto", "wind_an_land", "wind_auf_see", "heimspeicher", "gewerbespeicher", "grossspeicher"
]


class Zubau(Base):
    """Zubau and Bestand in Germany per month and, with month NULL, per year since 2000
    (etl/queries/aggregate_zubau.sql). Solar and wind in MW, battery storage in MWh of usable capacity.
    """

    __tablename__ = "zubau_zeitverlauf"
    __table_args__ = {"schema": "mrt"}

    technology = Column(String, primary_key=True)
    year = Column(Integer, primary_key=True)
    month = Column(Integer, primary_key=True)
    unit = Column(String)  # MW or MWh

    added_units = Column(Integer)
    added = Column(Float)  # Zubau: went into operation within the period
    installed = Column(Float)  # Bestand at the end of the period


class Registrierungen(Base):
    """Units registered in the Marktstammdatenregister per year of registration and technology, from the first
    registration on (etl/queries/aggregate_registrierungen.sql)."""

    __tablename__ = "registrierungen"
    __table_args__ = {"schema": "mrt"}

    # The dashboards' technology ids: solar, wind, wasserkraft, batterie, pumpspeicher, gaserzeuger, gasspeicher
    technology = Column(String, primary_key=True)
    year = Column(Integer, primary_key=True)
    units = Column(Integer)


class Registrierungsverzug(Base):
    """Units per year of commissioning and technology by how long after going into operation they were registered
    (etl/queries/aggregate_registrierungsverzug.sql), since the register started (31.01.2019)."""

    __tablename__ = "registrierungsverzug"
    __table_args__ = {"schema": "mrt"}

    technology = Column(String, primary_key=True)  # like Registrierungen
    year = Column(Integer, primary_key=True)  # of commissioning
    units = Column(Integer)
    vorab = Column(Integer)  # registered before going into operation
    bis_1_monat = Column(Integer)  # within the deadline of § 5 MaStRV
    bis_3_monate = Column(Integer)
    bis_12_monate = Column(Integer)
    spaeter = Column(Integer)  # more than a year after
    median_days = Column(Integer)
