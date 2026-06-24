import logging
from pathlib import Path

from sqlalchemy import text
from app.db.database import engine  # Your DB connection
from app.services.logger import setup_logging

logger = logging.getLogger(__name__)

# TODO: Change query to choose only columns I truly need
def run_sql_file(file_path: Path) -> None:
    """Reads and executes a pure SQL file."""
    logger.info(f"Executing SQL transformation: {file_path.name}")
    
    with open(file_path, 'r') as file:
        sql_query = file.read()
        
    with engine.begin() as conn:
        conn.execute(text(sql_query))
        
    logger.info("Transformation complete.")

if __name__ == "__main__":
    setup_logging()
    # This runs when your nightly cron job or task scheduler triggers the script
    query_path = Path("app/etl/queries/build_staging_solar.sql")
    run_sql_file(query_path)
