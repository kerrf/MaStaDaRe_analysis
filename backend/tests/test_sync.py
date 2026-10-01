"""sync.triage and Todo.synced_until: what the nightly update fetches, and up to when a table is complete."""

from datetime import datetime

from app.etl.sync import triage

# The register's dates are local time without a zone
SYNCED = datetime.fromisoformat("2026-09-30T20:00")  # everything before is in the table
UNTIL = datetime.fromisoformat("2026-10-01T01:00")  # when the units were listed


def at(hour: int) -> datetime:
    return datetime.fromisoformat(f"2026-09-30T{hour:02}:00")


def test_new_units_come_first_whatever_their_date():
    todo = triage({"SEE2": at(21), "SEE1": at(5)}, {}, SYNCED, UNTIL)
    assert todo.new == ["SEE1", "SEE2"]  # oldest change first, even one from before synced_until
    assert todo.changed == todo.up_to_date == []


def test_a_change_the_table_has_already_is_skipped():
    listed = {"SEE1": at(21), "SEE2": at(22)}
    stored = {"SEE1": at(21), "SEE2": at(9)}  # SEE1 came with an earlier run already
    todo = triage(listed, stored, SYNCED, UNTIL)
    assert todo.changed == ["SEE2"]
    assert todo.up_to_date == ["SEE1"]


def test_a_grid_operator_check_counts_from_synced_until_on():
    # A check doesn't move the unit's own date, so the listed time is always newer than the stored one
    listed = {"SEE1": at(19), "SEE2": at(20), "SEE3": at(23)}
    stored = {"SEE1": at(8), "SEE2": at(8), "SEE3": at(8)}
    todo = triage(listed, stored, SYNCED, UNTIL)
    assert todo.changed == ["SEE2", "SEE3"]  # SEE1's check was before synced_until: fetched by an earlier run
    assert todo.up_to_date == ["SEE1"]


def test_synced_until_is_the_listing_time_once_everything_is_done():
    todo = triage({"SEE1": at(21), "SEE2": at(22)}, {"SEE2": at(9)}, SYNCED, UNTIL)
    assert todo.synced_until() == at(21)  # nothing done yet: the oldest waiting change
    todo.done.update(["SEE1", "SEE2"])
    assert todo.synced_until() == UNTIL


def test_synced_until_stops_at_the_oldest_change_still_waiting():
    # New units first: a new unit from 23:00 is done, a change from 21:00 still waits for the next run
    todo = triage({"SEE1": at(23), "SEE2": at(21)}, {"SEE2": at(9)}, SYNCED, UNTIL)
    todo.done.add("SEE1")
    assert todo.synced_until() == at(21)
    # The next run lists from there: the new unit is up to date now, the change still comes
    again = triage({"SEE1": at(23), "SEE2": at(21)}, {"SEE1": at(23), "SEE2": at(9)}, todo.synced_until(), UNTIL)
    assert again.new == []
    assert again.changed == ["SEE2"]
    assert again.up_to_date == ["SEE1"]


def test_an_empty_listing_is_complete_up_to_the_listing_time():
    assert triage({}, {}, SYNCED, UNTIL).synced_until() == UNTIL
