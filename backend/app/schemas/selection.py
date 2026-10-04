from dataclasses import dataclass
from typing import Annotated, Literal, get_args

from fastapi import Query

Anlagenart = Literal["gebaeude", "freiflaeche"]
Leistung = Literal["netto", "brutto"]


@dataclass(frozen=True)
class SolarSelection:
    """What the dashboard shows of solar: the chosen Anlagenarten (the views have one row per Anlagenart, the API sums
    them), and Brutto (DC, Bruttoleistung) or Netto (AC, Nettonennleistung) power."""

    anlagenarten: tuple[str, ...]
    netto: bool

    def column(self, model, name: str):
        """A power column of a solar view in the chosen measure: total_power or total_power_net, and so on."""
        return getattr(model, f"{name}_net" if self.netto else name)


def solar_selection(
    anlagenart: Annotated[
        list[Anlagenart] | None,
        Query(description="gebaeude (with steckerfertige and those without an Art) and/or freiflaeche; default both"),
    ] = None,
    leistung: Annotated[
        Leistung, Query(description="Nettonennleistung (AC, the default) or Bruttoleistung (DC)")
    ] = "netto",
) -> SolarSelection:
    return SolarSelection(tuple(anlagenart or get_args(Anlagenart)), leistung == "netto")


Lage = Literal["an_land", "auf_see"]


def wind_lage(
    lage: Annotated[
        list[Lage] | None, Query(description="an_land (onshore) and/or auf_see (offshore); default both")
    ] = None,
) -> tuple[str, ...]:
    """The chosen Lagen of wind: the views have one row per Lage (offshore wind is the region "offshore")."""
    return tuple(lage or get_args(Lage))
