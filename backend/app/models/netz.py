from sqlalchemy import Column, Float, Integer, String, func
from sqlalchemy.orm import Session

from app.models.solar import Base

# The technologies of the units at the points, each with its power (leistung_<id>)
TECHNOLOGIEN = ("solar", "wind", "wasser", "speicher", "biomasse", "erdgas", "kohle", "sonstige")


class NetzAnschluss(Base):
    """The Netzanschlusspunkte der Stromerzeugung per Landkreis (the sea: "offshore"; a Land's 2-digit key: its plants
    without a Gemeinde; NULL: abroad), Netzebene (the Spannungsebene's code, 348–354) and grid operator, with the power
    of all units of their Lokationen, in total and per technology (mrt.netz_anschluesse,
    etl/queries/aggregate_netzanschluesse.sql). Only summed, per scope."""

    __tablename__ = "netz_anschluesse"
    __table_args__ = {"schema": "mrt"}

    landkreis = Column(String, primary_key=True)
    spannungsebene = Column(String, primary_key=True)
    netzbetreiber = Column(String, primary_key=True)
    netzbetreiber_name = Column(String)
    netz = Column(String)  # the operator's grid: uebertragungsnetz (Übertragungsnetzbetreiber) or verteilnetz
    punkte = Column(Integer)  # in operation
    leistung = Column(Float)  # MW of their units
    leistung_solar = Column(Float)
    leistung_wind = Column(Float)
    leistung_wasser = Column(Float)
    leistung_speicher = Column(Float)
    leistung_biomasse = Column(Float)
    leistung_erdgas = Column(Float)
    leistung_kohle = Column(Float)
    leistung_sonstige = Column(Float)
    geplant = Column(Integer)  # in planning

    @classmethod
    def in_scope(cls, region: str) -> tuple:
        """Deutschland (every point, also abroad), a Land (its Kreise and its plants without a Kreis) or a Kreis."""
        if region == "DE":
            return ()
        if len(region) == 2:
            return (cls.landkreis.like(f"{region}%"),)
        return (cls.landkreis == region,)

    @classmethod
    def summed(cls, db: Session, region: str, *keys, technologien: bool = False) -> list[dict]:
        """The points, their power and those in planning of the scope, per keys (e.g. Netzebene or grid operator); with
        technologien also the power per technology (leistung_<id>)."""
        per_technologie = [func.sum(getattr(cls, f"leistung_{t}")).label(f"leistung_{t}") for t in TECHNOLOGIEN]
        rows = (
            db.query(
                *keys,
                func.sum(cls.punkte).label("punkte"),
                func.sum(cls.leistung).label("leistung"),
                func.sum(cls.geplant).label("geplant"),
                *(per_technologie if technologien else ()),
            )
            .filter(*cls.in_scope(region))
            .group_by(*keys)
            .order_by(*keys)
            .all()
        )
        return [row._asdict() for row in rows]
