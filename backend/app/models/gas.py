from math import inf

from sqlalchemy import Column, Date, Float, Integer, String
from sqlalchemy.orm import Session

from app.models.solar import Base

# Classes of the Erzeugungsleistung (MW) and of the working gas (GWh): (upper bound included, label). Biomethane plants
# mostly 2–10 MW, Power-to-Gas below 10 MW, natural gas production and LNG terminals from 100 MW to 6 GW; storages from
# a few hundred GWh to 46 TWh (Rehden).
PRODUCER_CLASSES = [
    (5, "bis 5 MW"),
    (10, "5–10 MW"),
    (20, "10–20 MW"),
    (100, "20–100 MW"),
    (1000, "0,1–1 GW"),
    (inf, "über 1 GW"),
]
STORAGE_CLASSES = [
    (1000, "bis 1 TWh"),
    (2500, "1–2,5 TWh"),
    (5000, "2,5–5 TWh"),
    (10000, "5–10 TWh"),
    (inf, "über 10 TWh"),
]
TECHNOLOGIEN = {
    "biomethan": "Biomethan",
    "erdgas": "Erdgasförderung",
    "lng": "LNG",
    "wasserstoff": "Power-to-Gas: Wasserstoff",
    "methan": "Power-to-Gas: Methan",
}
SPEICHERARTEN = {"kaverne": "Kavernenspeicher", "pore": "Porenspeicher", "aquifer": "Aquiferspeicher"}


def in_operation(db: Session, model, region: str, kind_column, kinds: list[str] | None) -> list:
    """The sites in operation in Germany (region "DE") or in a Land, Kreis or Gemeinde (the start of the Gemeindeschlüssel),
    of the chosen kinds (all if none)."""
    query = db.query(model).filter(model.status == "in Betrieb", model.ags.isnot(None))
    if region != "DE":
        query = query.filter(model.ags.startswith(region))
    if kinds:
        query = query.filter(kind_column.in_(kinds))
    return query.all()


def size_classes(sites: list, classes: list, field: str, capacity: bool) -> list[dict]:
    """Every class, also empty ones, with its sites' number, power (MW) and, for storages, working gas (GWh). A site
    without a value counts in the first class."""
    rows = [
        {
            "size_class": i + 1,
            "label": label,
            "total_units": 0,
            "total_power": 0.0,
            "total_capacity": 0.0 if capacity else None,
        }
        for i, (_, label) in enumerate(classes)
    ]
    for site in sites:
        value = getattr(site, field) or 0
        row = rows[next(i for i, (up_to, _) in enumerate(classes) if value <= up_to)]
        row["total_units"] += 1
        row["total_power"] += site.total_power or 0
        if capacity:
            row["total_capacity"] += site.total_capacity or 0
    return rows


def kinds_of(sites: list, kind: str, field: str, labels: dict, capacity: bool) -> list[dict]:
    """The sites by their kind (technology, storage type), in the order of the labels; only the kinds that occur."""
    rows = {}
    for site in sites:
        category = getattr(site, field) or "unbekannt"
        row = rows.setdefault(
            category,
            {
                "kind": kind,
                "category": category,
                "label": labels.get(category, "ohne Angabe"),
                "total_units": 0,
                "total_power": 0.0,
                "total_capacity": 0.0 if capacity else None,
            },
        )
        row["total_units"] += 1
        row["total_power"] += site.total_power or 0
        if capacity:
            row["total_capacity"] += site.total_capacity or 0
    order = list(labels)
    return sorted(
        rows.values(), key=lambda row: order.index(row["category"]) if row["category"] in order else len(order)
    )


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

    @classmethod
    def size_classes(cls, db: Session, region: str, technologien: list[str] | None) -> list[dict]:
        """Producers in operation per class of their Erzeugungsleistung."""
        return size_classes(
            in_operation(db, cls, region, cls.technologie, technologien), PRODUCER_CLASSES, "total_power", False
        )

    @classmethod
    def kinds(cls, db: Session, region: str, technologien: list[str] | None) -> list[dict]:
        """Producers in operation by technology."""
        sites = in_operation(db, cls, region, cls.technologie, technologien)
        return kinds_of(sites, "technologie", "technologie", TECHNOLOGIEN, False)


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

    @classmethod
    def size_classes(cls, db: Session, region: str, speicherarten: list[str] | None) -> list[dict]:
        """Storages in operation per class of their working gas."""
        return size_classes(
            in_operation(db, cls, region, cls.speicherart, speicherarten), STORAGE_CLASSES, "total_capacity", True
        )

    @classmethod
    def kinds(cls, db: Session, region: str, speicherarten: list[str] | None) -> list[dict]:
        """Storages in operation by storage type."""
        sites = in_operation(db, cls, region, cls.speicherart, speicherarten)
        return kinds_of(sites, "speicherart", "speicherart", SPEICHERARTEN, True)
