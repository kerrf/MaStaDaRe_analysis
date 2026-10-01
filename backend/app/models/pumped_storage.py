from sqlalchemy import Column, Float, Integer, String

from app.models.solar import Base


class PumpedStoragePlant(Base):
    """One pumped-storage plant: its machines connected by location or Speicheranlage (etl/queries/aggregate_pumpspeicher.sql)."""

    __tablename__ = "pumpkraftwerke"
    __table_args__ = {"schema": "mrt"}

    spe_mastr_nummer = Column(String, primary_key=True)  # the plant's Speicheranlagen, "SSE…, SSE…"
    name = Column(String)
    status = Column(String)  # "in Betrieb", "in Planung", "vorübergehend stillgelegt"

    total_units = Column(Integer)
    total_power = Column(Float)  # turbine, MW
    pump_power = Column(Float)  # MW
    total_capacity = Column(Float)  # usable storage capacity, MWh

    lat = Column(Float)
    lon = Column(Float)
    ort = Column(String)
    ags = Column(String)  # Gemeindeschlüssel, empty outside Germany
    land = Column(String)
