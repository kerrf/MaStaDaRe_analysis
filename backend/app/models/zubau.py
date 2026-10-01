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
