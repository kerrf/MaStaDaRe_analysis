from typing import Literal

from sqlalchemy import Column, Float, Integer, String, text
from sqlalchemy.orm import Session

from app.models.solar import Base

# solar: Bruttoleistung (DC), solar_netto: Nettonennleistung (AC), also per Anlagenart (solar_gebaeude,
# solar_freiflaeche) and the Balkonkraftwerke on their own (solar_balkon_netto, also in solar_gebaeude); batteries and the
# other storages: capacity, and power as "..._leistung"; biomass, geothermal (geothermie_grubengas) and KWK (electrical
# power) as a whole and per kind
Technology = Literal[
    "solar",
    "solar_netto",
    "solar_gebaeude",
    "solar_gebaeude_netto",
    "solar_freiflaeche",
    "solar_freiflaeche_netto",
    "solar_balkon_netto",
    "wind_an_land",
    "wind_auf_see",
    "wasserkraft",
    "heimspeicher",
    "gewerbespeicher",
    "grossspeicher",
    "heimspeicher_leistung",
    "gewerbespeicher_leistung",
    "grossspeicher_leistung",
    "biomasse",
    "biomasse_gasfoermig",
    "biomasse_fest",
    "biomasse_fluessig",
    "geothermie_grubengas",
    "geothermie",
    "grubengas",
    "klaerschlamm",
    "druckentspannung",
    "solarthermie",
    "kwk",
    "kwk_erdgas",
    "kwk_biomasse",
    "kwk_kohle",
    "kwk_sonstige",
    "druckluftspeicher",
    "schwungradspeicher",
    "wasserstoffspeicher",
    "druckluftspeicher_leistung",
    "schwungradspeicher_leistung",
    "wasserstoffspeicher_leistung",
    # The Netzanschlüsse per Spannungsebene (mrt.netz_zubau_regions): the connected power, and the points
    "netz_hoechstspannung",
    "netz_hochspannung",
    "netz_mittelspannung",
    "netz_niederspannung",
    "netz_hoechstspannung_punkte",
    "netz_hochspannung_punkte",
    "netz_mittelspannung_punkte",
    "netz_niederspannung_punkte",
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
    installed_units = Column(Integer)  # units in it

    @classmethod
    def bestand(cls, db: Session, technologies: list[str], year: int, month: int | None, parent: str) -> list[dict]:
        """The Bestand of the series (summed) at the end of a year or, with month, a month: in an area ("DE" or a Land)
        and in each of its parts (the Länder, or the Kreise of the Land, as today's boundaries have them), with their
        inhabitants and area (geo.gemeinden). A part without the series has none."""
        rows = db.execute(
            text("""
            WITH gemeinden AS (
                SELECT ags, einwohner, qkm FROM geo.gemeinden WHERE :parent = 'DE' OR ags LIKE :parent || '%'
            ),
            areas AS (
                SELECT LEFT(ags, CASE WHEN :parent = 'DE' THEN 2 ELSE 5 END) AS region, sum(einwohner) AS einwohner,
                    sum(qkm) AS qkm
                FROM gemeinden
                GROUP BY 1
                UNION ALL
                SELECT :parent, sum(einwohner), sum(qkm) FROM gemeinden
            )
            SELECT a.region, COALESCE(sum(z.installed), 0) AS installed,
                COALESCE(sum(z.installed_units), 0) AS installed_units, a.einwohner, a.qkm
            FROM areas a
            LEFT JOIN mrt.zubau_zeitverlauf_regions z
                ON z.region = a.region AND z.technology = ANY(:technologies) AND z.year = :year
                AND z.month IS NOT DISTINCT FROM CAST(:month AS INTEGER)
            GROUP BY a.region, a.einwohner, a.qkm
            ORDER BY a.region
        """),
            {"technologies": technologies, "year": year, "month": month, "parent": parent},
        )
        return [row._asdict() for row in rows]


class NetzZubauRegion(Base):
    """Zubau and Bestand of the Netzanschlüsse per region, Spannungsebene, month and year (aggregate_netz_zubau.sql), in
    the shape of ZubauRegion: netz_<ebene> the connected power (MW), netz_<ebene>_punkte the points, and
    netz_<ebene>_registriert the points registered (their dates: those of the units at their Lokation)."""

    __tablename__ = "netz_zubau_regions"
    __table_args__ = {"schema": "mrt"}

    region = Column(String, primary_key=True)
    technology = Column(String, primary_key=True)
    year = Column(Integer, primary_key=True)
    month = Column(Integer, primary_key=True)
    unit = Column(String)  # MW or Punkte

    added_units = Column(Integer)
    added = Column(Float)
    installed = Column(Float)
    installed_units = Column(Integer)


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
