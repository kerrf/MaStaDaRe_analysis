"""
Build the place names of the map: Gemeinden at their main settlement, with their population to rank them by.

Source (download: scripts/geo/README.md): BKG VG250-EW, layer vg250_pk (a point per Gemeinde at its main settlement, its
name and kind: Stadt or Gemeinde) with the population of vg250_gem (EWZ, the official one of the whole Gemeinde). The
Gemeindeschlüssel (AGS) of each place tells its Land and Kreis.

The map names places in three layers (src/features/dashboard/PlaceLabels.jsx): the big cities in the view of Germany,
the larger towns of a Land in its view, the main towns of a Kreis in its view. For that it needs every Gemeinde from
MIN_POPULATION on (Germany, the Länder) and the largest PER_KREIS of every Kreis, whatever their size (a rural Kreis).

Writes rows of [name, lon, lat, population, ags, kind], the largest first; kind: L Landeshauptstadt, S Stadt,
G Gemeinde.
    frontend/public/places.json

Run from the repository root:
    uv run python scripts/geo/build_places.py
"""

import json
from pathlib import Path

import geopandas as gpd
import pandas as pd

VG250 = Path("backend/data/geo/vg250-ew/vg250-ew_12-31.utm32s.gpkg.ebenen/vg250-ew_ebenen_1231/DE_VG250.gpkg")
OUTPUT = Path("frontend/public/places.json")

MIN_POPULATION = 10_000
PER_KREIS = 6  # the map shows up to 4 of them; some more, in case two lie too close to name both
# The Landeshauptstädte by AGS (Hamburg, Bremen and Berlin are their Land)
CAPITALS = {
    "01002000", "02000000", "03241001", "04011000", "05111000", "06414000", "07315000", "08111000",
    "09162000", "10041100", "11000000", "12054000", "13004000", "14612000", "15003000", "16051000",
}  # fmt: skip


def main():
    gemeinden = read_gemeinden().sort_values("population", ascending=False)
    largest_of_kreis = gemeinden.groupby(gemeinden["ags"].str[:5]).cumcount() < PER_KREIS
    places = gemeinden[(gemeinden["population"] >= MIN_POPULATION) | largest_of_kreis]
    write(places, OUTPUT)


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
        }
    )
    gemeinden.loc[gemeinden["ags"].isin(CAPITALS), "kind"] = "L"
    return gemeinden[gemeinden["population"] > 0]  # not the gemeindefreie Gebiete (forests, lakes)


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
