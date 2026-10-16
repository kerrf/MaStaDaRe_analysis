from sqlalchemy import Column, Float, Integer, String, func
from sqlalchemy.orm import Session

from app.models.solar import Base


class NetzAnschluss(Base):
    """The Netzanschlusspunkte der Stromerzeugung per Landkreis (the sea: "offshore"; a Land's 2-digit key: its plants
    without a Gemeinde; NULL: abroad), Netzebene (the Spannungsebene's code, 348–354), main technology of the Lokation
    and grid operator (mrt.netz_anschluesse, etl/queries/aggregate_netzanschluesse.sql). Only summed, per scope."""

    __tablename__ = "netz_anschluesse"
    __table_args__ = {"schema": "mrt"}

    landkreis = Column(String, primary_key=True)
    spannungsebene = Column(String, primary_key=True)
    technologie = Column(String, primary_key=True)
    netzbetreiber = Column(String, primary_key=True)
    netzbetreiber_name = Column(String)
    punkte = Column(Integer)  # in operation
    leistung = Column(Float)  # MW of their units
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
    def summed(cls, db: Session, region: str, *keys) -> list[dict]:
        """The points, their power and those in planning of the scope, per keys (e.g. Netzebene and technology)."""
        rows = (
            db.query(
                *keys,
                func.sum(cls.punkte).label("punkte"),
                func.sum(cls.leistung).label("leistung"),
                func.sum(cls.geplant).label("geplant"),
            )
            .filter(*cls.in_scope(region))
            .group_by(*keys)
            .order_by(*keys)
            .all()
        )
        return [row._asdict() for row in rows]
