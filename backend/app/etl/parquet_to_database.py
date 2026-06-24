
import os
import re
import time
import sys
from logging import getLogger
from pathlib import Path

import pandas as pd
import psycopg2
import sqlalchemy
from lxml import etree
from sqlalchemy import (
    create_engine,
    inspect,
    text,
)
from sqlalchemy.engine import Engine
from sqlalchemy.exc import OperationalError

from app.services.logger import setup_logging

logger = getLogger(__name__)
setup_logging()

NUMERIC_COLUMNS = [
    'Bruttoleistung', 
    'Nettonennleistung', 
    'ZugeordneteWirkleistungWechselrichter', 
    'AnzahlModule', 
    'HauptausrichtungNeigungswinkel',
    'NebenausrichtungNeigungswinkel',
    'GroesseDerInAnspruchGenommenenFlaecheInHektar',
    'Laengengrad',
    'Breitengrad',
    'LichteHoehe'
]
DATE_COLUMNS = ['Registrierungsdatum', 'Inbetriebnahmedatum']
DATETIME_COLUMNS = ['DatumLetzteAktualisierung']

def _extract_number(string: str):
    """Extracts number at the end of a string - needed for natural sorting"""
    return [
        int(part) if part.isdigit() else part.lower()
        for part in re.split(r'(\d+)', string)
    ]


def migrate_all_files(directory_path: Path, table_name: str, engine: Engine) -> None:
    
    parquet_files = list(directory_path.glob("*.parquet"))
    parquet_files.sort(key=lambda x: _extract_number(x.name))
    
    if not parquet_files:
        logger.warning(f"No parquet files found in {directory_path}.")
    
    logger.info(f"Found {len(parquet_files)} files to migrate.")
    
    for i, file_path in enumerate(parquet_files):
        logger.info(f"Processing ({i+1}/{len(parquet_files)}): {file_path.name}")
        
        df = pd.read_parquet(file_path)
        for col in df.columns:
            if col in NUMERIC_COLUMNS:
                df[col] = pd.to_numeric(df[col], errors='coerce')
                
            elif col in DATE_COLUMNS:
                df[col] = pd.to_datetime(df[col], errors='coerce').dt.date
                
            elif col in DATETIME_COLUMNS:
                df[col] = pd.to_datetime(df[col], errors='coerce')
                
            else:
                # Catch-all: Everything else becomes TEXT
                # If Pandas guessed a text ID was a float (e.g., 1402.0), safely drop the .0 first
                if pd.api.types.is_float_dtype(df[col]):
                    df[col] = pd.to_numeric(df[col], errors='coerce').astype('Int64')
                
                # Convert to string and wipe any stringified Pandas nulls
                df[col] = df[col].astype(str).replace({'<NA>': None, 'nan': None, 'None': None, 'NaT': None, '-': None})

        mode = 'replace' if i == 0 else 'append'
        
# --- DYNAMIC SCHEMA EVOLUTION ---
        if mode == 'append':
            # Ask PostgreSQL directly for the exact columns
            with engine.connect() as conn:
                result = conn.execute(text(f"""
                    SELECT column_name 
                    FROM information_schema.columns 
                    WHERE table_schema = 'raw' AND table_name = '{table_name}';
                """))
                existing_cols = [row[0] for row in result]
            
            new_cols = [c for c in df.columns if c not in existing_cols]
            
            if new_cols:
                with engine.begin() as conn:
                    for col in new_cols:
                        if pd.api.types.is_numeric_dtype(df[col]):
                            sql_type = "DOUBLE PRECISION"
                        elif pd.api.types.is_datetime64_any_dtype(df[col]):
                            sql_type = "TIMESTAMP"
                        else:
                            sql_type = "TEXT"
                            
                        logger.info(f"Adding new column '{col}' as {sql_type}")
                        conn.execute(text(f'ALTER TABLE raw."{table_name}" ADD COLUMN "{col}" {sql_type};'))
# --------------------------------
        df.to_sql(
            name      = table_name,
            con       = engine,
            if_exists = mode,
            schema    = 'raw',
            index     = False,
            chunksize = 10000
        )

    logger.info("Migration to database successful!")


def add_constraints_and_indexes(schema_name: str, table_name: str, engine: Engine) -> None:
    """ Add primary key, index, indexing postal codes"""
    logger.info("Configuring Primary Key and Indexes...")
    
    with engine.begin() as conn:
        conn.execute(text(f"""
            ALTER TABLE {schema_name}.{table_name}                      
            ADD PRIMARY KEY ("EinheitMastrNummer");                          
        """))
        
        conn.execute(text(f"""
            CREATE INDEX IF NOT EXISTS idx_{table_name}_coords
            ON {schema_name}.{table_name} ("Postleitzahl");                          
        """))
    
    logger.info("Primary Key and Indexing applied successfully.")


def connect_to_db(max_retries: int = 5, delay: int = 2) -> None:
    logger.info("Waiting for database connection...")
    engine = create_engine("postgresql+psycopg2://mastr:mastr@localhost:5432/mastr")
    for attempt in range(max_retries):
        try:
            # Just test the connection and immediately close it
            with engine.connect():
                logger.info("Connection sucessful!")
                return engine
        except OperationalError:
            logger.warning(f"Database not ready. Retrying in {delay} seconds ({attempt + 1}/{max_retries})...")
            time.sleep(delay)
    
    logger.error("Could not connect to database after maximum retries. Exiting.")
    sys.exit(1)

if __name__ == "__main__":
    setup_logging()
        
    engine = connect_to_db()
    
    migrate_all_files(Path("data/raw/Gesamtdatenexport_parquet"), "solar_units", engine)
    
    add_constraints_and_indexes("raw", "solar_units", engine)