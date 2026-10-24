import json
import os

from fastapi import FastAPI, Request, Response
from fastapi.responses import JSONResponse
from sqlalchemy import text

from app.db.database import engine
from app.routers import (
    battery,
    biomass,
    gas,
    geothermal,
    karte,
    kwk,
    meta,
    netz,
    other_storage,
    pumped_storage,
    regions,
    solar,
    usage,
    water,
    wind,
    zubau,
)

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
app.include_router(biomass.router)
app.include_router(geothermal.router)
app.include_router(kwk.router)
app.include_router(battery.router)
app.include_router(pumped_storage.router)
app.include_router(other_storage.router)
app.include_router(gas.router)
app.include_router(zubau.router)
app.include_router(karte.router)
app.include_router(netz.router)
app.include_router(regions.router)
app.include_router(meta.router)
app.include_router(usage.router)

# The views change once a night (app.etl.update): a browser and Cloudflare may keep an answer for 15 minutes, and a
# cache may still hand out its copy for a day while the server fails
CACHE_CONTROL = "public, max-age=900, stale-if-error=86400"


@app.middleware("http")
async def same_answer_for_everybody(request: Request, call_next):
    """Every answer is the same whoever asks, so Cloudflare can keep one copy of it for all visitors – its cache goes by
    the address alone (it ignores Vary). So the data is open to any website (CORS "*", never one site's name, which a
    cached copy would hand to the others), and a GET that found something may be kept (CACHE_CONTROL); errors and
    /health never."""
    if request.method == "OPTIONS":  # a browser asking first, before a request with headers of its own
        response = Response(
            status_code=204,
            headers={
                "Access-Control-Allow-Methods": "GET, HEAD",
                "Access-Control-Allow-Headers": "*",
                "Access-Control-Max-Age": "86400",
            },
        )
    else:
        response = await call_next(request)
    response.headers["Access-Control-Allow-Origin"] = "*"
    if "cache-control" not in response.headers:
        cacheable = request.method in ("GET", "HEAD") and response.status_code == 200 and request.url.path != "/health"
        response.headers["Cache-Control"] = CACHE_CONTROL if cacheable else "no-store"
    return response


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
