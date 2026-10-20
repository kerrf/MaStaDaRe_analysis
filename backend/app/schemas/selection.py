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


# The kinds of the technologies whose views have one row per kind (models.regions.KindRegionStats), ?art=…
BiomasseArt = Literal["gasfoermig", "fest", "fluessig"]
GeothermieArt = Literal["geothermie", "grubengas", "klaerschlamm", "druckentspannung", "solarthermie"]
SpeicherArt = Literal["druckluft", "schwungrad", "wasserstoff"]
KwkTraeger = Literal["erdgas", "biomasse", "kohle", "sonstige"]


def biomasse_arten(
    art: Annotated[list[BiomasseArt] | None, Query(description="gasfoermig, fest and/or fluessig; default all")] = None,
) -> tuple[str, ...]:
    return tuple(art or get_args(BiomasseArt))


def geothermie_arten(
    art: Annotated[
        list[GeothermieArt] | None,
        Query(description="geothermie, grubengas, klaerschlamm, druckentspannung and/or solarthermie; default all"),
    ] = None,
) -> tuple[str, ...]:
    return tuple(art or get_args(GeothermieArt))


def speicher_arten(
    art: Annotated[
        list[SpeicherArt] | None, Query(description="druckluft, schwungrad and/or wasserstoff; default all")
    ] = None,
) -> tuple[str, ...]:
    return tuple(art or get_args(SpeicherArt))


def kwk_traeger(
    energietraeger: Annotated[
        list[KwkTraeger] | None,
        Query(description="erdgas (with the other gases and hydrogen), biomasse, kohle and/or sonstige; default all"),
    ] = None,
) -> tuple[str, ...]:
    return tuple(energietraeger or get_args(KwkTraeger))


Spannungsebene = Literal["hoechstspannung", "hochspannung", "mittelspannung", "niederspannung"]


def netz_ebenen(
    spannung: Annotated[
        list[Spannungsebene] | None,
        Query(
            description="hoechstspannung, hochspannung, mittelspannung and/or niederspannung (each with the transformation"
            " below it); default all"
        ),
    ] = None,
) -> tuple[str, ...]:
    """The chosen Spannungsebenen of the Netzanschlüsse (?spannung=…, like the page's URL, where ?ebene= is the map's
    resolution): the views have one row per Spannungsebene, the API sums them."""
    return tuple(spannung or get_args(Spannungsebene))
