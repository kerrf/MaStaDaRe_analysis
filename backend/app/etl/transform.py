import logging
from pathlib import Path

from sqlalchemy import Engine, text

from app.db.database import engine  # Your DB connection
from app.services.logger import setup_logging


# TODO: Change query to choose only columns I truly need
def run_sql_file(engine: Engine, query_path: Path) -> None:
    """Reads and executes a pure SQL file."""
    logger.info(f"Executing SQL transformation: {query_path.name}")

    with open(query_path) as query:
        sql_query = text(query.read())

    with engine.begin() as conn:
        conn.execute(sql_query)

    logger.info("Transformation complete.")


if __name__ == "__main__":
    logger = logging.getLogger(__name__)
    setup_logging()

    # This runs when your nightly cron job or task scheduler triggers the script
    # query_path = Path("app/etl/queries/aggregate_plz_einwohner.sql")
    # run_sql_file(engine, query_path)

    query_path = Path("app/etl/queries/aggregate_pv_by_plz_power.sql")
    run_sql_file(engine, query_path)

    # Bundesland > Landkreis > Gemeinde, needs geo.gemeinden and geo.offshore (db_migrate.migrate_regions)
    query_path = Path("app/etl/queries/aggregate_pv_by_region_power.sql")
    run_sql_file(engine, query_path)

    query_path = Path("app/etl/queries/aggregate_wind_by_region_power.sql")
    run_sql_file(engine, query_path)

    query_path = Path("app/etl/queries/aggregate_bat_by_region_power.sql")
    run_sql_file(engine, query_path)

    query_path = Path("app/etl/queries/aggregate_water_by_region_power.sql")
    run_sql_file(engine, query_path)

    # Needs raw.storage_plants (AnlagenStromSpeicher) for the storage capacity
    query_path = Path("app/etl/queries/aggregate_pumpspeicher.sql")
    run_sql_file(engine, query_path)

    # Zubau im Zeitverlauf (Germany-wide, per month and year); battery capacity also from raw.storage_plants
    query_path = Path("app/etl/queries/aggregate_zubau.sql")
    run_sql_file(engine, query_path)

    # Analyses per Deutschland / Land / Kreis: size classes (solar, wind, hydro) and orientation of the solar modules
    query_path = Path("app/etl/queries/aggregate_size_distribution.sql")
    run_sql_file(engine, query_path)

    query_path = Path("app/etl/queries/aggregate_solar_orientation.sql")
    run_sql_file(engine, query_path)

    # Solar units and batteries at the same Lokation (Germany-wide), needs raw.storage_plants for the capacity
    query_path = Path("app/etl/queries/aggregate_pv_speicher.sql")
    run_sql_file(engine, query_path)

    # Gas producers and gas storages at their location (raw.gas_producer_units, gas_storage_units, gas_storage_plants)
    query_path = Path("app/etl/queries/aggregate_gas.sql")
    run_sql_file(engine, query_path)

    # Registrations in the MaStR per year and technology (every dashboard's Analysen)
    query_path = Path("app/etl/queries/aggregate_registrierungen.sql")
    run_sql_file(engine, query_path)

    # How long after going into operation units were registered, per technology and year of commissioning
    query_path = Path("app/etl/queries/aggregate_registrierungsverzug.sql")
    run_sql_file(engine, query_path)

    # query_path = Path("app/etl/queries/aggregate_by_plz_power.sql")
    # run_sql_file(engine, query_path)
