from sqlalchemy import Column, Float, Integer, String, text
from sqlalchemy.orm import Session

from app.db.database import Base

# The manufacturers as the Anlagen page groups them: the companies a brand went to (NEG Micon to Vestas, REpower to
# Senvion, Bonus and AN Windenergie to Siemens Gamesa, Tacke to GE), the rest "Sonstige". By their names in the register
# (codes.KATALOG: WindHersteller).
HERSTELLER_GRUPPEN = {
    "Enercon": ("ENERCON GmbH",),
    "Vestas": ("Vestas Deutschland GmbH", "MHI Vestas Offshore Wind", "NEG Micon Deutschland GmbH"),
    "Nordex": ("Nordex Energy GmbH", "Nordex SE", "Nordex Germany GmbH"),
    "Siemens Gamesa": (
        "Siemens Wind Power GmbH & Co. KG",
        "Siemens Gamesa Renewable Energy GmbH & Co. KG",
        "Gamesa Corporación Tecnológica S.A.",
        "Bonus Energy A/S",
        "AN Bonus",
        "AN Windenergie GmbH",
    ),
    "Senvion": ("Senvion Deutschland GmbH", "REpower Systems SE"),
    "GE": (
        "GE Wind Energy GmbH",
        "General Electric Deutschland Holding GmbH",
        "GE Renewable Germany GmbH",
        "Tacke GmbH & Co. KG",
    ),
}
SONSTIGE = "Sonstige"
GROUP_OF = {name: index for index, names in enumerate(HERSTELLER_GRUPPEN.values()) for name in names}

STATUS = ("in_betrieb", "geplant", "stillgelegt")
LAGE = ("an_land", "auf_see")


def number(value: float | None, digits: int) -> float | int | None:
    """Rounded, whole numbers without ".0": the answer stays short (about 44,000 turbines)."""
    if value is None:
        return None
    value = round(value, digits)
    return int(value) if value == int(value) else value


class WindTurbine(Base):
    """Every wind turbine on its own (mrt.wind_turbines, aggregate_wind_turbines.sql)."""

    __tablename__ = "wind_turbines"
    __table_args__ = {"schema": "mrt"}

    mastr_nummer = Column(String, primary_key=True)
    status = Column(String)  # in_betrieb, geplant, stillgelegt
    lage = Column(String)  # an_land, auf_see
    jahr = Column(Integer)  # Inbetriebnahme, planned: the year planned
    nabenhoehe = Column(Float)  # m
    rotordurchmesser = Column(Float)  # m
    leistung = Column(Float)  # kW, Brutto
    ags = Column(String)  # Gemeindeschlüssel, offshore: none
    lon = Column(Float)
    lat = Column(Float)
    hersteller = Column(String)  # its name in the register

    @classmethod
    def columns(cls, db: Session) -> dict:
        """All turbines as columns of the same length (a list of objects would be three times as long). status, lage and
        hersteller as the index into their lists; ags as a number (8 digits, the leading zero left off)."""
        # One row of arrays, built by Postgres in the turbines' order: much faster than 44,000 rows
        row = (
            db.execute(
                text("""
                SELECT
                    array_agg(array_position(:status, status) - 1 ORDER BY mastr_nummer) AS status,
                    array_agg(array_position(:lage, lage) - 1 ORDER BY mastr_nummer) AS lage,
                    array_agg(jahr ORDER BY mastr_nummer) AS jahr,
                    array_agg(nabenhoehe ORDER BY mastr_nummer) AS nabenhoehe,
                    array_agg(rotordurchmesser ORDER BY mastr_nummer) AS rotordurchmesser,
                    array_agg(leistung ORDER BY mastr_nummer) AS leistung,
                    array_agg(CASE WHEN ags ~ '^[0-9]+$' THEN ags::integer END ORDER BY mastr_nummer) AS ags,
                    array_agg(lon ORDER BY mastr_nummer) AS lon,
                    array_agg(lat ORDER BY mastr_nummer) AS lat,
                    array_agg(hersteller ORDER BY mastr_nummer) AS hersteller
                FROM mrt.wind_turbines
            """),
                {"status": list(STATUS), "lage": list(LAGE)},
            )
            .mappings()
            .one()
        )
        other = len(HERSTELLER_GRUPPEN)
        return {
            "status": list(STATUS),
            "lage": list(LAGE),
            "hersteller": [*HERSTELLER_GRUPPEN, SONSTIGE],
            "columns": {
                "status": row["status"],
                "lage": row["lage"],
                "jahr": row["jahr"],
                "nabenhoehe": [number(v, 1) for v in row["nabenhoehe"]],
                "rotordurchmesser": [number(v, 1) for v in row["rotordurchmesser"]],
                "leistung": [number(v, 0) for v in row["leistung"]],
                "ags": row["ags"],
                "lon": [number(v, 3) for v in row["lon"]],
                "lat": [number(v, 3) for v in row["lat"]],
                "hersteller": [GROUP_OF.get(v, other) for v in row["hersteller"]],
            },
        }
