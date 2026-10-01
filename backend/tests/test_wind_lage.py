"""Wind an Land and auf See: the choice of the dashboard and what the regions show for it."""

from app.routers.wind import by_lage
from app.schemas.selection import wind_lage

LAND = {"bundesland": "03", "landkreis": None, "gemeinde": None, "total_units": 6000, "total_power": 14000.0,
        "relative_area_power": 290.0, "relative_population_power": 1.7, "added_12m_power": 1500.0}
SEA = {"bundesland": "offshore", "landkreis": None, "gemeinde": None, "total_units": 1800, "total_power": 11400.0,
       "relative_area_power": 400.0, "relative_population_power": None, "added_12m_power": 2200.0}


def test_no_choice_is_both():
    assert wind_lage(None) == ("an_land", "auf_see")
    assert by_lage([LAND, SEA], wind_lage(None)) == [LAND, SEA]


def test_an_land_leaves_out_the_sea():
    assert by_lage([LAND, SEA], ("an_land",)) == [LAND]


def test_auf_see_keeps_the_land_with_zeros():
    land, sea = by_lage([LAND, SEA], ("auf_see",))
    assert sea == SEA
    assert land["bundesland"] == "03"
    assert land["total_units"] == 0 and land["total_power"] == 0 and land["added_12m_power"] == 0
