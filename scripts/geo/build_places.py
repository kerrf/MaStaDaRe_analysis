"""
Build the place names of the map: every Gemeinde at its main settlement, and the settlements within the Gemeinden
(Ortsteile, Stadtteile), each with a population to rank them by.

Sources (downloads: scripts/geo/README.md), both BKG, both with the Gemeindeschlüssel (AGS):
- VG250-EW, layer vg250_pk: one point per Gemeinde at its main settlement (Ortslage), its name and kind (Stadt or
  Gemeinde); the population from vg250_gem (EWZ, the official one of the whole Gemeinde).
- GN250 (Geographische Namen 1:250 000), object kind AX_Ortslage: the settlements, those that are part of a Gemeinde
  (GEMTEIL) with a computed population (EWZ_GER: the Gemeinde's, shared out by the area of its settlements).

The map shows a place when there is room for it at the current zoom, the larger ones first (src/features/dashboard/
PlaceLabels.jsx). Through the AGS, each place knows its Land and Kreis: in the view of a Land or Kreis, the map names
only the places in it.

Writes, rows of [name, lon, lat, population, ags, kind], the largest first. kind: L Landeshauptstadt, S Stadt,
G Gemeinde, O Ortsteil.
    frontend/public/places/de.json        the Gemeinden with at least BASE_POPULATION inhabitants and the capitals,
                                          for the views of Germany (loaded with every map)
    frontend/public/places/<ags2>.json    the rest of one Land: smaller Gemeinden and every Ortsteil (loaded when the
                                          map shows that Land up close)

Run from the repository root:
    uv run python scripts/geo/build_places.py
"""

import json
from pathlib import Path

import geopandas as gpd
import pandas as pd

VG250 = Path("backend/data/geo/vg250-ew/vg250-ew_12-31.utm32s.gpkg.ebenen/vg250-ew_ebenen_1231/DE_VG250.gpkg")
GN250 = Path("backend/data/geo/gn250/gn250/GN250.csv")
OUT_DIR = Path("frontend/public/places")

BASE_POPULATION = 10_000
# The Landeshauptstädte by AGS (Hamburg, Bremen and Berlin are their Land)
CAPITALS = {
    "01002000", "02000000", "03241001", "04011000", "05111000", "06414000", "07315000", "08111000",
    "09162000", "10041100", "11000000", "12054000", "13004000", "14612000", "15003000", "16051000",
}  # fmt: skip
UTM32 = 25832
NEAR_MAIN = 1500  # m: an Ortsteil this close to the main settlement of its Gemeinde, with its name, is that settlement


def main():
    gemeinden = read_gemeinden()
    ortsteile = read_ortsteile(gemeinden)
    places = pd.concat([gemeinden, ortsteile], ignore_index=True).sort_values("population", ascending=False)
    print(f"{len(gemeinden):,} Gemeinden, {len(ortsteile):,} Ortsteile")

    OUT_DIR.mkdir(exist_ok=True)
    base = (places["kind"] != "O") & ((places["population"] >= BASE_POPULATION) | (places["kind"] == "L"))
    write(places[base], OUT_DIR / "de.json")
    rest = places[~base]
    for land, rows in rest.groupby(rest["ags"].str[:2]):
        write(rows, OUT_DIR / f"{land}.json")


def read_gemeinden() -> pd.DataFrame:
    """Every inhabited Gemeinde at its main settlement, with its official population."""
    points = gpd.read_file(VG250, layer="vg250_pk", ignore_geometry=True)
    areas = gpd.read_file(VG250, layer="vg250_gem", ignore_geometry=True)
    population = areas[areas["GF"] == 4].drop_duplicates("AGS").set_index("AGS")["EWZ"]
    gemeinden = pd.DataFrame(
        {
            "name": points["GEN"],
            "lon": points["LON_DEZ"].astype(float),
            "lat": points["LAT_DEZ"].astype(float),
            "population": points["AGS"].map(population).fillna(0).astype(int),
            "ags": points["AGS"],
            "kind": points["BEZ"].map({"Stadt": "S"}).fillna("G"),
            "main": points["OTL"],  # the name of the settlement the point lies in
        }
    )
    gemeinden.loc[gemeinden["ags"].isin(CAPITALS), "kind"] = "L"
    return gemeinden[gemeinden["population"] > 0]  # not the gemeindefreie Gebiete (forests, lakes)


def read_ortsteile(gemeinden: pd.DataFrame) -> pd.DataFrame:
    """The settlements that are part of a Gemeinde, without its main one (the Gemeinde's own point)."""
    names = pd.read_csv(GN250, sep=";", encoding="utf-8-sig", dtype=str)
    parts = names[(names["OBA"] == "AX_Ortslage") & (names["GEMTEIL"] == "Ja") & (names["VIRTUELL"] == "Nein")]
    points = gpd.GeoDataFrame(
        parts[["NAME", "AGS", "EWZ_GER"]],
        geometry=gpd.points_from_xy(parts["RECHTS"].astype(float), parts["HOCH"].astype(float)),
        crs=UTM32,
    )

    # The main settlement of a Gemeinde can come again as a part of it: same name, close to the Gemeinde's point
    main = gemeinden.set_index("ags")
    main_points = gpd.GeoSeries(gpd.points_from_xy(main["lon"], main["lat"]), index=main.index, crs=4326).to_crs(UTM32)
    own = points["AGS"].map(main_points)
    near = points.geometry.distance(gpd.GeoSeries(own.values, index=points.index, crs=UTM32)) < NEAR_MAIN
    same_name = (points["NAME"] == points["AGS"].map(main["main"])) | (points["NAME"] == points["AGS"].map(main["name"]))
    points = points[~(near & same_name)]

    wgs84 = points.to_crs(4326)
    return pd.DataFrame(
        {
            "name": points["NAME"],
            "lon": wgs84.geometry.x,
            "lat": wgs84.geometry.y,
            "population": pd.to_numeric(points["EWZ_GER"]).fillna(0).astype(int),
            "ags": points["AGS"],
            "kind": "O",
        }
    )


def write(places: pd.DataFrame, path: Path) -> None:
    rows = [
        [name, round(lon, 4), round(lat, 4), int(population), ags, kind]
        for name, lon, lat, population, ags, kind in places[["name", "lon", "lat", "population", "ags", "kind"]].itertuples(
            index=False
        )
    ]
    with open(path, "w") as f:
        json.dump(rows, f, separators=(",", ":"), ensure_ascii=False)
    print(f"{path}: {len(rows):,} places, {path.stat().st_size / 1e3:.0f} kB")


if __name__ == "__main__":
    main()
