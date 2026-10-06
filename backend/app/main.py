import json
import os

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy import text

from app.core.config import settings
from app.db.database import engine
from app.routers import battery, gas, meta, pumped_storage, regions, solar, water, wind, zubau

app = FastAPI(
    title="Get Data from Marktstammdatenregister",
    description="api to fetch data from the Marktstammdatenregister-abbrevated database",
    version="0.1.0",
    docs_url="/docs",
    redocs_url="/redoc",
)
app.include_router(solar.router)
app.include_router(wind.router)
app.include_router(water.router)
app.include_router(battery.router)
app.include_router(pumped_storage.router)
app.include_router(gas.router)
app.include_router(zubau.router)
app.include_router(regions.router)
app.include_router(meta.router)

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
    with open(file_path, encoding="utf-8") as f:
        return json.load(f)


@app.get("/plz5_solar_brutto")
def get_plz5_data():
    """Serves the pre-calculated 5-digit GeoJSON"""
    # Adjust this filename to match exactly what your ETL script saves!
    file_path = os.path.join(PROCESSED_DIR, "plz_shape.geojson")

    with open(file_path, encoding="utf-8") as f:
        return json.load(f)


@app.get("/health")
def health_check():
    """Whether the API runs and reaches its database: the deploy waits for it (compose.yml) before it counts a new
    version as live."""
    try:
        with engine.connect() as connection:
            connection.execute(text("SELECT 1"))
    except Exception:
        return JSONResponse({"status": "database unreachable"}, status_code=503)
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn

    # Only this machine: the container starts its own server, on all of its interfaces (Dockerfile)
    uvicorn.run(app, host="127.0.0.1", port=8000, reload=True)
