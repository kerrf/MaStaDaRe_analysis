"""
Writes the website's usage counts into their own database (app.etl.usage_setup), as the role that may only add rows –
never with the API's own connection to the MaStR data. The database itself refuses more than its daily cap (a trigger,
whatever the code above it does) and answers with an error this turns into CapReached.
"""

import json
from functools import cache

from app.core.config import settings
from sqlalchemy import Engine, create_engine, text
from sqlalchemy.exc import DBAPIError

# The text of the database's refusal (usage_setup's trigger)
CAP_ERROR = "usage_cap"


class CapReached(Exception):
    """The database refused the rows: the day's cap is reached."""


@cache
def engine(url: str) -> Engine:
    """A small pool of its own: counting can't take connections from the dashboard. Short timeouts: a slow database
    loses a count, it doesn't pile up."""
    return create_engine(
        url,
        pool_size=2,
        max_overflow=3,
        pool_timeout=5,
        pool_pre_ping=True,
        pool_recycle=1800,
        connect_args={"connect_timeout": 3, "options": "-c statement_timeout=3000"},
    )


def add_events(events: list[tuple[str, dict[str, str]]]) -> None:
    """The events of one request, in one transaction: (name, settings)."""
    try:
        with engine(settings.USAGE_DATABASE_URL).begin() as conn:
            conn.execute(
                text("INSERT INTO usage.events (event, props) VALUES (:event, CAST(:props AS jsonb))"),
                [{"event": name, "props": json.dumps(props, ensure_ascii=False)} for name, props in events],
            )
    except DBAPIError as error:
        if CAP_ERROR in str(error.orig):
            raise CapReached(str(error.orig).splitlines()[0]) from None
        raise
