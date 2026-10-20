"""The turbines' answer stays short: whole numbers without ".0", groups of manufacturers by their names."""

from app.codes import KATALOG
from app.models.wind import GROUP_OF, HERSTELLER_GRUPPEN, number


def test_whole_numbers_lose_their_point():
    assert number(164.0, 1) == 164
    assert isinstance(number(164.0, 1), int)
    assert number(149.12, 1) == 149.1
    assert number(None, 1) is None


def test_brands_go_to_the_company_they_went_to():
    names = list(HERSTELLER_GRUPPEN)
    assert names[GROUP_OF["NEG Micon Deutschland GmbH"]] == "Vestas"
    assert names[GROUP_OF["REpower Systems SE"]] == "Senvion"
    assert "Sonstige" not in GROUP_OF  # "Sonstige" in the register: the group after the named ones


def test_the_groups_name_manufacturers_of_the_register():
    """A typo would put a manufacturer's turbines into "Sonstige" without a word"""
    manufacturers = set(KATALOG[74][1].values())  # WindHersteller
    assert set(GROUP_OF) <= manufacturers
