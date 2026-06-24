import io
import gc
import glob
import json
import os
import sys

import matplotlib.pyplot as plt
import geopandas as gpd
import numpy as np
import pandas as pd
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response
from itertools import islice
from matplotlib.colors import LinearSegmentedColormap
from sqlalchemy import text

from app.db.database import SessionLocal
from app.core.config import settings




# Grab the directory this file is in (etl/), then grab its parent (backend/)
parent_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# Tell Python to look in backend/ for imports
if parent_dir not in sys.path:
    sys.path.insert(0, parent_dir)

from backend.app.core.config import RELEVANT_COLUMNS
from app.nützlicheFunktionen import count_plz_in_msdr, fünfstl_zu_zweistl, plz_liste_bereinigen, akk_leistung_plz

output_dir = "/home/kerf/energy_projects/mastadatregpv_korrekt-main/data/processed"
    
def get_plz2_data():
    # 1. Load your Shapefile
    path = "/home/kerf/energy_projects/mastadatregpv_korrekt-main/data/geo/plz/plz-2stellig.shp/plz-2stellig.shp"
    df = gpd.read_file(path)
    
    # 2. Your Logic (Simplified for the test)
    df = df.dissolve(by="plz").reset_index()
    
    # IMPORTANT: Convert to WGS84 (Standard for Web Maps)
    df = df.to_crs(epsg=3035)
    
    # 3. Real Data:
    files = glob.glob(os.path.join("/home/kerf/energy_projects/mastadatregpv_korrekt-main/data/raw/Gesamtdatenexport_parquet", "*.parquet"))

    # Combine them. Pandas will 'coerce' conflicting types to Objects automatically.
    file_generator = (pd.read_parquet(f, columns=RELEVANT_COLUMNS) for f in files)

    # 2. Use islice to take only the first 10 items
    df = pd.concat(islice(file_generator, 2), ignore_index=True)
    gc.collect()
    df["EinheitMastrNummer"] = df["EinheitMastrNummer"].astype("str")
    df["DatumLetzteAktualisierung"] = pd.to_datetime(df["DatumLetzteAktualisierung"], format="ISO8601")
    df["Bundesland"] = df["Bundesland"].fillna(0).astype("Int64")
    df["Postleitzahl"] = df["Postleitzahl"].astype("str").str.zfill(5)
    df["Registrierungsdatum"] = pd.to_datetime(df["Registrierungsdatum"], format="%Y-%m-%d").dt.date
    df["Inbetriebnahmedatum"] = pd.to_datetime(df["Inbetriebnahmedatum"], format="%Y-%m-%d").dt.date
    df["FernsteuerbarkeitNb"] = df["FernsteuerbarkeitNb"].astype("Int64")
    df["Einspeisungsart"] = df["Einspeisungsart"].astype("Int64")
    df["AnzahlModule"] = df["AnzahlModule"].astype("Int64")
    df["ArtDerSolaranlage"] = df["ArtDerSolaranlage"].astype("Int64")
    df["Hauptausrichtung"] = df["Hauptausrichtung"].astype("Int64")
    df["HauptausrichtungNeigungswinkel"] = df["HauptausrichtungNeigungswinkel"].astype("Int64")
    plz_leistung = pd.DataFrame(df.groupby(by=df["Postleitzahl"].str[:2])["Bruttoleistung"].sum())
    plz_leistung = plz_leistung.reset_index().rename(columns={"Postleitzahl": "plz"})
    
    counter5 = count_plz_in_msdr(df)
    counter5 = plz_liste_bereinigen(plz_counter=counter5)
    counter2 = fünfstl_zu_zweistl(counter=counter5)
    
    df_einwohner = pd.read_csv("/home/kerf/energy_projects/mastadatregpv_korrekt-main/data/resources/plz_einwohner_2PLZ.csv")
    df_einwohner["plz"] = df_einwohner["plz"].astype(str)
    plz_shape_df2.merge(right=df_einwohner, on="plz")

    plz_shape_df2 = gpd.read_file("/home/kerf/energy_projects/mastadatregpv_korrekt-main/data/geo/plz/plz-2stellig.shp/plz-2stellig.shp", dtype={'plz': str})
    # Manche plz haben mehrere Polygone zugeordnet. Diese werden zu einem verbunden. Anschließend ist die Postleitzahl-Zeile der Index, das muss behoben werden.
    plz_shape_df2 = plz_shape_df2.dissolve(by="plz")
    plz_shape_df2 = plz_shape_df2.reset_index()

    plz_shape_df2["area"] = plz_shape_df2.geometry.area/1000000000
    plz_shape_df2["count_PV"] = plz_shape_df2['plz'].map(lambda x: counter2.get(x, 0))
    plz_shape_df2["dichte_PV"] = plz_shape_df2["count_PV"] / plz_shape_df2.geometry.area
    plz_shape_df2 = plz_shape_df2.merge(plz_leistung, on='plz', how='left')
    plz_shape_df2.rename(columns={"Bruttoleistung": "aggr_leistung"}, inplace=True)
    plz_shape_df2["aggr_leistung"] = plz_shape_df2["aggr_leistung"].fillna(0)
    plz_shape_df2["dichte_leistung_area"] = plz_shape_df2["aggr_leistung"] / plz_shape_df2.geometry.area
    plz_shape_df2["dichte_leistung_population"] = plz_shape_df2["aggr_leistung"] / plz_shape_df2["einwohner"]
    # 4. Return as GeoJSON

    # Use the GeoJSON driver to save it correctly
    plz_shape_df2.to_file(os.path.join(output_dir, "plz2_shape.geojson"), driver="GeoJSON")

def get_plz5_data():
    # 1. Load your Shapefile
    path = "/home/kerf/energy_projects/mastadatregpv_korrekt-main/data/geo/plz/plz-2stellig.shp/plz-2stellig.shp"
    df = gpd.read_file(path)
    
    # 2. Your Logic (Simplified for the test)
    df = df.dissolve(by="plz").reset_index()
    
    # IMPORTANT: Convert to WGS84 (Standard for Web Maps)
    df = df.to_crs(epsg=3035)
    
    # 3. Real Data:
    files = glob.glob(os.path.join("/home/kerf/energy_projects/mastadatregpv_korrekt-main/data/raw/Gesamtdatenexport_parquet", "*.parquet"))

    # Combine them. Pandas will 'coerce' conflicting types to Objects automatically.
    file_generator = (pd.read_parquet(f, columns=RELEVANT_COLUMNS) for f in files)

    # 2. Use islice to take only the first 10 items
    df = pd.concat(islice(file_generator, 2), ignore_index=True)
    gc.collect()
    df["EinheitMastrNummer"] = df["EinheitMastrNummer"].astype("str")
    df["DatumLetzteAktualisierung"] = pd.to_datetime(df["DatumLetzteAktualisierung"], format="ISO8601")
    df["Bundesland"] = df["Bundesland"].fillna(0).astype("Int64")
    df["Postleitzahl"] = df["Postleitzahl"].astype("str").str.zfill(5)
    df["Registrierungsdatum"] = pd.to_datetime(df["Registrierungsdatum"], format="%Y-%m-%d").dt.date
    df["Inbetriebnahmedatum"] = pd.to_datetime(df["Inbetriebnahmedatum"], format="%Y-%m-%d").dt.date
    df["FernsteuerbarkeitNb"] = df["FernsteuerbarkeitNb"].astype("Int64")
    df["Einspeisungsart"] = df["Einspeisungsart"].astype("Int64")
    df["AnzahlModule"] = df["AnzahlModule"].astype("Int64")
    df["ArtDerSolaranlage"] = df["ArtDerSolaranlage"].astype("Int64")
    df["Hauptausrichtung"] = df["Hauptausrichtung"].astype("Int64")
    df["HauptausrichtungNeigungswinkel"] = df["HauptausrichtungNeigungswinkel"].astype("Int64")
    plz_leistung = pd.DataFrame(df.groupby(by=df["Postleitzahl"].str[:2])["Bruttoleistung"].sum())
    plz_leistung = plz_leistung.reset_index().rename(columns={"Postleitzahl": "plz"})
    
    counter5 = count_plz_in_msdr(df)
    counter5 = plz_liste_bereinigen(plz_counter=counter5)
    
    
    plz_shape_df = gpd.read_file("/home/kerf/energy_projects/mastadatregpv_korrekt-main/data/geo/plz/plz-5stellig.shp/plz-5stellig.shp", dtype={'plz': str})
    # Manche plz haben mehrere Polygone zugeordnet. Diese werden zu einem verbunden. Anschließend ist die Postleitzahl-Zeile der Index, das muss behoben werden.
    plz_shape_df = plz_shape_df.dissolve(by="plz")
    plz_shape_df = plz_shape_df.reset_index()
    
    df_einwohner = pd.read_csv("/home/kerf/energy_projects/mastadatregpv_korrekt-main/data/resources/plz_einwohner.csv")
    df_einwohner["plz"] = df_einwohner["plz"].astype(str)
    plz_shape_df.merge(right=df_einwohner, on="plz")

    plz_shape_df["area"] = plz_shape_df.geometry.area/1000000000
    plz_shape_df["count_PV"] = plz_shape_df['plz'].map(lambda x: counter5.get(x, 0))
    plz_shape_df["dichte_PV"] = plz_shape_df["count_PV"] / plz_shape_df.geometry.area
    plz_shape_df = plz_shape_df.merge(plz_leistung, on='plz', how='left')
    plz_shape_df.rename(columns={"Bruttoleistung": "aggr_leistung"}, inplace=True)
    plz_shape_df["aggr_leistung"] = plz_shape_df["aggr_leistung"].fillna(0)
    plz_shape_df["dichte_leistung_area"] = plz_shape_df["aggr_leistung"] / plz_shape_df.geometry.area
    plz_shape_df["dichte_leistung_population"] = plz_shape_df["aggr_leistung"] / plz_shape_df["einwohner"]

    # 4. Return as GeoJSON
    plz_shape_df.to_file(os.path.join(output_dir, "plz_shape.geojson"), driver="GeoJSON")
   
def get_plz5_heatmap_image():

    path = "/home/kerf/energy_projects/mastadatregpv_korrekt-main/data/geo/plz/plz-2stellig.shp/plz-2stellig.shp"
    df = gpd.read_file(path)
    
    # 2. Your Logic (Simplified for the test)
    df = df.dissolve(by="plz").reset_index()
    
    # IMPORTANT: Convert to WGS84 (Standard for Web Maps)
    df = df.to_crs(epsg=3035)
    
    # 3. Real Data:
    files = glob.glob(os.path.join("/home/kerf/energy_projects/mastadatregpv_korrekt-main/data/raw/Gesamtdatenexport_parquet", "*.parquet"))

    # Combine them. Pandas will 'coerce' conflicting types to Objects automatically.
    file_generator = (pd.read_parquet(f, columns=RELEVANT_COLUMNS) for f in files)

    # 2. Use islice to take only the first 10 items
    df = pd.concat(islice(file_generator, 2), ignore_index=True)
    gc.collect()
    df["EinheitMastrNummer"] = df["EinheitMastrNummer"].astype("str")
    df["DatumLetzteAktualisierung"] = pd.to_datetime(df["DatumLetzteAktualisierung"], format="ISO8601")
    df["Bundesland"] = df["Bundesland"].fillna(0).astype("Int64")
    df["Postleitzahl"] = df["Postleitzahl"].astype("str").str.zfill(5)
    df["Registrierungsdatum"] = pd.to_datetime(df["Registrierungsdatum"], format="%Y-%m-%d").dt.date
    df["Inbetriebnahmedatum"] = pd.to_datetime(df["Inbetriebnahmedatum"], format="%Y-%m-%d").dt.date
    df["FernsteuerbarkeitNb"] = df["FernsteuerbarkeitNb"].astype("Int64")
    df["Einspeisungsart"] = df["Einspeisungsart"].astype("Int64")
    df["AnzahlModule"] = df["AnzahlModule"].astype("Int64")
    df["ArtDerSolaranlage"] = df["ArtDerSolaranlage"].astype("Int64")
    df["Hauptausrichtung"] = df["Hauptausrichtung"].astype("Int64")
    df["HauptausrichtungNeigungswinkel"] = df["HauptausrichtungNeigungswinkel"].astype("Int64")
    # 1. Load Data & Calculate Centroids (Same as your script)
    counter5 = count_plz_in_msdr(df)
    counter5 = plz_liste_bereinigen(plz_counter=counter5)
    counter2 = fünfstl_zu_zweistl(counter=counter5)
    plz_shape_df = gpd.read_file("/home/kerf/energy_projects/mastadatregpv_korrekt-main/data/geo/plz/plz-5stellig.shp", dtype={'plz': str})
    plz_shape_df = plz_shape_df.dissolve(by="plz").reset_index()
    
    # IMPORTANT: Project to WGS84 so the image aligns with the Leaflet map!
    plz_shape_df = plz_shape_df.to_crs(epsg=4326)
    
    centroids = plz_shape_df.geometry.centroid
    x_coords = centroids.x.values
    y_coords = centroids.y.values
    weights = plz_shape_df['plz'].map(lambda x: counter5.get(x, 0)).values

    # 2. Create the Gaussian Heatmap Grid (Exactly your code)
    xmin, ymin, xmax, ymax = plz_shape_df.total_bounds
    res = 400
    x_grid = np.linspace(xmin, xmax, res)
    y_grid = np.linspace(ymin, ymax, res)
    X, Y = np.meshgrid(x_grid, y_grid)

    sigma = 0.12 
    heatmap = np.zeros(X.shape)

    for i in range(len(x_coords)):
        dist_sq = (X - x_coords[i])**2 + (Y - y_coords[i])**2
        heatmap += weights[i] * np.exp(-dist_sq / (2 * sigma**2))

    # 3. Apply Colormap & Create Image
    # Normalize the linear data to a 0.0 - 1.0 range for the colormap
    norm_heatmap = heatmap / heatmap.max()
    
    colors = ["white", "yellow", "red", "black"]
    my_cmap = LinearSegmentedColormap.from_list("custom_autumn", colors)
    rgba_img = my_cmap(norm_heatmap)

    # Set transparency: If the heatmap value is basically 0, make it transparent (alpha = 0)
    rgba_img[heatmap < 0.01, 3] = 0.0  

    
    # 1. Define your output directory (Create it if it doesn't exist)
    
    os.makedirs(output_dir, exist_ok=True)
    
    image_save_path = os.path.join(output_dir, "plz5_heatmap.png")
    bounds_save_path = os.path.join(output_dir, "plz5_heatmap_bounds.json")

    # 2. Save the image directly to the disk
    plt.imsave(image_save_path, rgba_img, format='png', origin='lower')
    print(f"✅ Heatmap image saved to {image_save_path}")
    
    # 3. Save the bounds to a JSON file so React knows where to put the image
    bounds_dict = {
        "bounds": [[ymin, xmin], [ymax, xmax]]
    }
    with open(bounds_save_path, "w", encoding="utf-8") as f:
        json.dump(bounds_dict, f)
        
    print(f"✅ Heatmap bounds saved to {bounds_save_path}")
    

def run_all_precalculations():
    """Reads SQL files and runs them sequentially inside the database."""
    db = SessionLocal()
    queries_dir = os.path.join(os.path.dirname(__file__), "queries")
    
    print("🚀 Starting table precalculations...")
    
    try:
        for query_file in settings.PRECALC_QUERIES:
            print(block := f" -> Computing {query_file}...")
            file_path = os.path.join(queries_dir, query_file)
            
            with open(file_path, "r") as f:
                sql_script = f.read()
                
            # Execute the raw SQL directly inside Postgres
            db.execute(text(sql_script))
            db.commit()
            
        print("✅ All analytical tables precalculated successfully!")
    except Exception as e:
        db.rollback()
        print(f"❌ Error during precalculation: {e}")
        raise e
    finally:
        db.close()

if __name__ == "__main__":
    get_plz2_data()
    get_plz5_data()
    get_plz5_heatmap_image()
