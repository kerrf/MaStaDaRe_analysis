import os
import re
from logging import getLogger
import xml.etree.ElementTree as etree

import pandas as pd

def extract_number(string: str):
    """Extracts number at the end of a string - needed for natural sorting"""
    return [
        int(part) if part.isdigit() else part.lower()
        for part in re.split(r'(\d+)', string)
    ]

# naive way, will be optimized later
def transform_xml_csv(src_path, dest_path: str , which: str) -> None:
    files = os.listdir(src_path)
    files = [solar_plant for solar_plant in files if solar_plant.startswith(which)]
    
    for i, file in enumerate(files):
        xml_file = os.path.join(src_path, file)
        csv_file = os.path.join(dest_path, file.removesuffix(".xml") + ".csv")
        df = pd.read_xml(xml_file, encoding="utf-16")
        df.to_csv(csv_file, index=False)
        print(f"{i} of {len(files)} done.")
        
# naive way, will be optimized later
def transform_csv_parquet(src_path, dest_path: str , which: str) -> None:
    files = os.listdir(src_path)
    files = [solar_plant for solar_plant in files if solar_plant.startswith(which)]
    
    for i, file in enumerate(files):
        
        csv_file = os.path.join(src_path, file)
        parquet_file = os.path.join(dest_path, file.removesuffix(".csv") + ".parquet")
        
        df = pd.read_csv(csv_file, low_memory=False)
        df.to_parquet(parquet_file, index=False)
        print(f"{i} of {len(files)} done.")
    
                


if __name__ == "__main__":
    transform_csv_parquet("/home/kerf/energy_projects/mastadatregpv_korrekt-main/data/raw/Gesamtdatenexport_csv",
                     "/home/kerf/energy_projects/mastadatregpv_korrekt-main/data/raw/Gesamtdatenexport_parquet",
                     "EinheitenSolar")
