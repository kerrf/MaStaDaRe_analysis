"""
What the nightly update (app.etl.update) has to fetch, and up to when a table is complete.

Pure functions without API or database, so they are easy to test (tests/test_sync.py).
"""

from dataclasses import dataclass, field
from datetime import datetime


@dataclass
class Todo:
    """What one unit type needs in this run. Each list is sorted by the time of the change, oldest first."""

    new: list[str]  # not in the table yet
    changed: list[str]  # in the table, but changed since
    up_to_date: list[str]  # listed, but the table has their latest version already
    changes: dict[str, datetime]  # listed unit -> time of its latest change
    until: datetime  # the listing has every change up to here
    done: set[str] = field(default_factory=set)  # fetched in this run (or found gone from the register)

    def synced_until(self) -> datetime:
        """Every change before this time is in the table: the listing time, or the oldest change still waiting."""
        waiting = (self.changes[unit] for unit in (*self.new, *self.changed) if unit not in self.done)
        return min(waiting, default=self.until)


def triage(listed: dict[str, datetime], stored: dict[str, datetime], synced_until: datetime, until: datetime) -> Todo:
    """Sort the listed units into new ones, changed ones and those the table has already.

    listed: unit -> time of its latest change, its own DatumLetzteAktualisierung or a newer grid operator check.
    stored: unit -> DatumLetzteAktualisierung in the table, for the listed units the table has.
    synced_until: every change before this time is in the table.

    A known unit needs fetching if its change is newer than what the table has and not before synced_until. The first
    condition skips what an earlier run fetched already. A grid operator check doesn't move the unit's own date: for
    those, synced_until alone decides.
    """

    def oldest_first(units: list[str]) -> list[str]:
        return sorted(units, key=lambda unit: (listed[unit], unit))

    new, changed, up_to_date = [], [], []
    for unit, changed_at in listed.items():
        if unit not in stored:
            new.append(unit)
        elif changed_at > stored[unit] and changed_at >= synced_until:
            changed.append(unit)
        else:
            up_to_date.append(unit)
    return Todo(oldest_first(new), oldest_first(changed), oldest_first(up_to_date), listed, until)
