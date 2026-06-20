
import os
import re
from logging import getLogger

import pandas as pd
import psycopg
import sqlalchemy
from lxml import etree
from sqlalchemy import create_engine

from backend.app.core.config import RAW_DATA_PATH
from backend.app.services.logger import setup_logging

logger = getLogger(__name__)
setup_logging

def extract_number(string: str):
    """Extracts number at the end of a string - needed for natural sorting"""
    return [
        int(part) if part.isdigit() else part.lower()
        for part in re.split(r'(\d+)', string)
    ]

engine = create_engine("postgresql+psycopg://mastr:mastr@localhost:5432/mastr")

msdr_raw_dir = os.path.join(RAW_DATA_PATH, "Gesamtdatenexport_20260314_25")

files = os.listdir(msdr_raw_dir)
solar_plants = [solar_plant for solar_plant in files if solar_plant.startswith("EinheitenSolar")]
solar_plants = sorted(solar_plants, key=extract_number)

with engine.connect() as conn:
    conn.execute(sqlalchemy.text("CREATE SCHEMA IF NOT EXISTS raw;"))
    conn.commit()

conn_info = "host=localhost port=5432 dbname=mastr user=mastr password=mastr"

def stream_xml_to_db(xml_path):
    with psycopg.connect(conn_info) as conn:
        with conn.cursor() as cur:
            # 1. Prepare the 'Fast Path'
            # Adjust the column names here to match your XML/Table exactly
            columns = ("EinheitMastrNummer", "Bruttoleistung", "Einsatzverantwortlicher")
            
            quoted_cols = [f'"{c}"' for c in columns]
            with cur.copy(f"COPY raw.photovoltaic_units ({','.join(quoted_cols)}) FROM STDIN") as copy:
                # 2. Stream the XML without loading it all at once
                context = etree.iterparse(xml_path, events=('end',), tag='EinheitSolar')
                
                for event, elem in context:
                    # Extract values safely
                    row = (
                        elem.findtext('EinheitMastrNummer'),
                        elem.findtext('Bruttoleistung'),
                        elem.findtext('Einsatzverantwortlicher')
                    )
                    
                    # 3. Feed the row to Postgres
                    copy.write_row(row)
                    
                    # Clean up memory as we go
                    elem.clear()
                    while elem.getprevious() is not None:
                        del elem.getparent()[0]
            
            conn.commit()

# Run it for each file
for file in solar_plants:
    path = os.path.join(msdr_raw_dir, file)
    print(f"Streaming {file}...")
    stream_xml_to_db(path)