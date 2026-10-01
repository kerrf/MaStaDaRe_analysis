from sqlalchemy import Column, Date, Float, Integer, String

from app.models.solar import Base


class GasProducer(Base):
    """One gas producer at its location: biomethane, natural gas production, LNG, Power-to-Gas
    (etl/queries/aggregate_gas.sql)."""

    __tablename__ = "gaserzeuger"
    __table_args__ = {"schema": "mrt"}

    mastr_nummer = Column(String, primary_key=True)  # the unit, "GEE…"
    name = Column(String)
    technologie = Column(String)  # "biomethan", "erdgas", "lng", "wasserstoff", "methan"
    status = Column(String)  # "in Betrieb", "in Planung", "vorübergehend stillgelegt"

    total_power = Column(Float)  # Erzeugungsleistung, MW
    inbetriebnahme = Column(Date)

    lat = Column(Float)
    lon = Column(Float)
    ort = Column(String)
    ags = Column(String)  # Gemeindeschlüssel, empty abroad
    land = Column(String)


class GasStorage(Base):
    """One gas storage (Gasspeicher) with the figures of its units (etl/queries/aggregate_gas.sql)."""

    __tablename__ = "gasspeicher"
    __table_args__ = {"schema": "mrt"}

    mastr_nummer = Column(String, primary_key=True)  # the storage, "GSE…"
    name = Column(String)
    speicherart = Column(String)  # "kaverne", "pore", "aquifer"
    status = Column(String)

    total_units = Column(Integer)
    total_capacity = Column(Float)  # working gas, GWh
    volume = Column(Float)  # working gas, Mio. m³
    total_power = Column(Float)  # Ausspeicherleistung, MW
    injection_power = Column(Float)  # Einspeicherleistung, MW

    lat = Column(Float)
    lon = Column(Float)
    ort = Column(String)
    ags = Column(String)
    land = Column(String)
