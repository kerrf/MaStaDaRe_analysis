from datetime import date
from typing import Literal

from pydantic import BaseModel, ConfigDict

Status = Literal["in Betrieb", "in Planung", "vorübergehend stillgelegt"]


class Site(BaseModel):
    """A plant at its location, as the map shows it."""

    model_config = ConfigDict(from_attributes=True)

    mastr_nummer: str
    name: str | None
    status: Status | None
    total_power: float | None  # MW
    lat: float
    lon: float
    ort: str | None
    ags: str | None  # Gemeindeschlüssel, empty abroad
    land: str | None


class GasProducerSite(Site):
    technologie: Literal["biomethan", "erdgas", "lng", "wasserstoff", "methan"] | None
    inbetriebnahme: date | None


class GasStorageSite(Site):
    speicherart: Literal["kaverne", "pore", "aquifer"] | None
    total_units: int
    total_capacity: float | None  # GWh
    volume: float | None  # Mio. m³
    injection_power: float | None  # MW
