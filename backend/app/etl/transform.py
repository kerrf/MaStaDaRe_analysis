import logging
from pathlib import Path

from sqlalchemy import text, Engine
from app.db.database import engine  # Your DB connection
from app.services.logger import setup_logging

# TODO: Change query to choose only columns I truly need
def run_sql_file(engine: Engine, query_path: Path) -> None:
    """Reads and executes a pure SQL file."""
    logger.info(f"Executing SQL transformation: {query_path.name}")
    
    with open(query_path, 'r') as query:
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
    
    # query_path = Path("app/etl/queries/aggregate_by_plz_power.sql")
    # run_sql_file(engine, query_path)