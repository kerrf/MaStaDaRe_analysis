# TODO: Make everything async https://gemini.google.com/app/6b5a8b024dc31bf0
from sqlalchemy import (
    Column,
    Integer,
    String,
    DateTime,
    Date,
    Float,
    Boolean,
    ForeignKey,
    JSON,
)
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship


class SolarUnit(Base):
    __tablename__ = "solar_units"
    __table_args__ = {"schema": "raw"}

    EinheitMastrNummer = Column(String, primary_key=True)
    Postleitzahl = Column(String, index=True)
    Inbetriebnahmedatum = Column(Date)
    Bruttoleistung = Column(Float)
