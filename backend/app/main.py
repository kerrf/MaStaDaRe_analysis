import io
import gc
import glob
import json
import os

import matplotlib.pyplot as plt
import geopandas as gpd
import numpy as np
import pandas as pd
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse

from app.core.config import settings
from app.routers import solar


app = FastAPI(
    title="Get Data from Marktstammdatenregister",
    description="api to fetch data from the Marktstammdatenregister-abbrevated database",
    version="0.1.0",
    docs_url="/docs",
    redocs_url="/redoc"
)
app.include_router(solar.router)

# Allow the deployed frontend(s) to talk to the API (origins come from ALLOWED_ORIGINS in .env)
app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=settings.ALLOWED_ORIGINS,
    allow_methods=["*"],
    allow_headers=["*"],
)

PROCESSED_DIR = os.getenv(
    "PROCESSED_DIR",
    os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "data", "processed"),
)

@app.get("/plz2_solar_brutto")
def get_plz2_data():
    """Serves the pre-calculated 2-digit GeoJSON"""
    file_path = os.path.join(PROCESSED_DIR, "plz2_shape.geojson")
    
    # Read the text file and parse it as JSON
    with open(file_path, "r", encoding="utf-8") as f:
        return json.load(f)
    

@app.get("/plz5_solar_brutto")
def get_plz5_data():
    """Serves the pre-calculated 5-digit GeoJSON"""
    # Adjust this filename to match exactly what your ETL script saves!
    file_path = os.path.join(PROCESSED_DIR, "plz_shape.geojson") 
    
    with open(file_path, "r", encoding="utf-8") as f:
        return json.load(f)


@app.get("/plz5_heatmap_image")
def get_plz5_heatmap_image():
    """Serves the pre-calculated Heatmap PNG"""
    image_path = os.path.join(PROCESSED_DIR, "plz5_heatmap.png")
    
    # FileResponse is heavily optimized by FastAPI to serve static files instantly
    return FileResponse(image_path, media_type="image/png")

@app.get("/health")
async def health_check():
    return {"status": "ok"}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000, reload=True)