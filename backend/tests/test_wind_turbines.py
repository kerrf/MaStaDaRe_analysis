"""The turbines' answer stays short: whole numbers without ".0", groups of manufacturers by their codes."""

from app.models.wind import GROUP_OF, HERSTELLER_GRUPPEN, number


def test_whole_numbers_lose_their_point():
    assert number(164.0, 1) == 164
    assert isinstance(number(164.0, 1), int)
    assert number(149.12, 1) == 149.1
    assert number(None, 1) is None


def test_brands_go_to_the_company_they_went_to():
    names = list(HERSTELLER_GRUPPEN)
    assert names[GROUP_OF[1625]] == "Vestas"  # NEG Micon
    assert names[GROUP_OF[2888]] == "Senvion"  # REpower
    assert 2554 not in GROUP_OF  # "Sonstige" in the register: the group after the named ones
