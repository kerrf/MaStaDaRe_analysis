"""
Which settings of the website get used (app.routers.usage), in a database of its own, mastr_usage, beside the MaStR
data on the same server – deploy/push_db.sh swaps only the database mastr, so the counts stay when the data is pushed:

- usage.events: one row per event – its day, its name (Ansicht, Teilen, Tour, …) and its settings as JSON
  ({"seite": "erzeuger/karte", "technologie": "wind", "wert": "zubau"})

Nothing of the visitor: no IP address, no cookie, no id, not even the time of day – a row can't be traced to a person or
joined with another. The role mastr_usage, as which the API writes, may only add rows of the three columns: it can't
read, change or delete anything, nor reach the MaStR data. A trigger refuses more than the daily cap and deletes what is
older than the retention, whatever the API does. Idempotent: run it again after a change, and to give the role a new
password.

    cd backend
    USAGE_DB_PASSWORD='…' uv run python -m app.etl.usage_setup

Without USAGE_DB_PASSWORD it sets up the database and table but leaves out the role. The API then writes as
USAGE_DATABASE_URL=postgresql+psycopg2://mastr_usage:<password>@<host>:5432/mastr_usage (DEPLOY.md "Nutzungszahlen").
"""

from logging import getLogger

from sqlalchemy import Engine, create_engine, make_url, text

from app.core.config import settings
from app.services.logger import setup_logging

logger = getLogger(__name__)

DATABASE = "mastr_usage"
ROLE = "mastr_usage"

EVENTS_PER_DAY = 200_000  # the database's own limit, apart from the API's per visitor
KEPT_DAYS = 400  # a year to compare with, then deleted

SCHEMA = f"""
CREATE SCHEMA IF NOT EXISTS usage;

CREATE TABLE IF NOT EXISTS usage.events (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    day date NOT NULL DEFAULT current_date,
    event text NOT NULL CHECK (event ~ '^[A-Za-zÄÖÜäöüß]{{1,24}}$'),
    props jsonb NOT NULL DEFAULT '{{}}' CHECK (jsonb_typeof(props) = 'object' AND octet_length(props::text) <= 600)
);
CREATE INDEX IF NOT EXISTS events_day_event ON usage.events (day, event);

-- Before every new row: delete what is older than the retention, refuse it beyond the cap. SECURITY DEFINER: the
-- trigger counts and deletes as the owner, the writing role itself can do neither. A fixed search_path, so no object
-- of another schema can step in. The day's rows are counted from the index.
CREATE OR REPLACE FUNCTION usage.guard_event() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
BEGIN
    DELETE FROM usage.events WHERE day < current_date - {KEPT_DAYS};
    IF (SELECT count(*) FROM usage.events WHERE day = current_date) >= {EVENTS_PER_DAY} THEN
        RAISE EXCEPTION 'usage_cap: events per day' USING ERRCODE = 'P0001';
    END IF;
    RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS guard ON usage.events;
CREATE TRIGGER guard BEFORE INSERT ON usage.events FOR EACH ROW EXECUTE FUNCTION usage.guard_event();

-- The retention also when nobody writes (the report calls it)
CREATE OR REPLACE FUNCTION usage.prune() RETURNS void
LANGUAGE sql SET search_path = pg_catalog, pg_temp AS $$
    DELETE FROM usage.events WHERE day < current_date - {KEPT_DAYS};
$$;

REVOKE ALL ON FUNCTION usage.guard_event(), usage.prune() FROM PUBLIC;
REVOKE ALL ON SCHEMA public FROM PUBLIC;
REVOKE ALL ON SCHEMA usage FROM PUBLIC;
"""

# What the role may: connect, and add rows – the name and the settings (id and day come from the database)
GRANTS = f"""
GRANT USAGE ON SCHEMA usage TO {ROLE};
REVOKE ALL ON ALL TABLES IN SCHEMA usage FROM {ROLE};
GRANT INSERT (event, props) ON usage.events TO {ROLE};
ALTER ROLE {ROLE} IN DATABASE {DATABASE} SET statement_timeout = '3s';
"""


def admin_engine(database: str | None = None) -> Engine:
    """The owner's connection (DATABASE_URL, the MaStR database's), to the given database of the same server."""
    url = make_url(settings.DATABASE_URL)
    if database:
        url = url.set(database=database)
    return create_engine(url, isolation_level="AUTOCOMMIT")


def usage_database_exists(engine: Engine) -> bool:
    with engine.connect() as conn:
        return bool(conn.execute(text("SELECT 1 FROM pg_database WHERE datname = :db"), {"db": DATABASE}).scalar())


def setup(password: str | None) -> None:
    server = admin_engine()
    with server.connect() as conn:
        if not usage_database_exists(server):
            conn.execute(text(f'CREATE DATABASE "{DATABASE}"'))
            logger.info(f"Database {DATABASE} created")
        role_exists = bool(conn.execute(text("SELECT 1 FROM pg_roles WHERE rolname = :role"), {"role": ROLE}).scalar())
        if password:
            if not role_exists:
                conn.execute(text(f"CREATE ROLE {ROLE} LOGIN"))
                logger.info(f"Role {ROLE} created")
            # Everything a role could do beyond logging in: off. The password goes in as a bound value (psycopg2 quotes it).
            conn.execute(
                text(
                    f"ALTER ROLE {ROLE} WITH LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS "
                    "NOINHERIT CONNECTION LIMIT 10 PASSWORD :password"
                ),
                {"password": password},
            )
            role_exists = True
        elif not role_exists:
            logger.warning(f"No USAGE_DB_PASSWORD: role {ROLE} not created, the API can't write counts yet")
        conn.execute(text(f'REVOKE ALL ON DATABASE "{DATABASE}" FROM PUBLIC'))
        if role_exists:
            conn.execute(text(f'GRANT CONNECT ON DATABASE "{DATABASE}" TO {ROLE}'))
    server.dispose()

    usage = admin_engine(DATABASE)
    with usage.connect() as conn:
        conn.exec_driver_sql(SCHEMA)
        if role_exists:
            conn.exec_driver_sql(GRANTS)
    usage.dispose()
    logger.info(
        f"Usage counts ready in {DATABASE}: at most {EVENTS_PER_DAY:,} events a day, kept {KEPT_DAYS} days"
        + (f"; the API writes as {ROLE} (USAGE_DATABASE_URL)" if role_exists else "")
    )


if __name__ == "__main__":
    setup_logging()
    setup(settings.USAGE_DB_PASSWORD)
