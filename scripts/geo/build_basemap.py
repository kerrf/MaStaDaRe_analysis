"""
Build the background map around Germany: the land of Europe in one plain shape, the borders between the other
countries, and the names of the countries and seas.

Source: Natural Earth 1:10m, the countries as Germany sees their borders ("admin 0 countries, point of view DEU"), and
its lakes. Downloads: scripts/geo/README.md.

- The land is cut to a frame from the Atlantic to western Russia and simplified: the map draws it plain grey under the
  Länder, Kreise and Gemeinden of build_boundaries.py, which bring their own, exact borders.
- Germany is part of the land, so no gap opens between its exact border and the coarser one of a neighbour. Its sea
  (12-mile zone and EEZ of the Offshore area) is cut out of the land, so the German coast is the one of the map layers.
- Borders: only between two other countries. Germany's borders come from the map layers.

Writes
    frontend/public/basemap_europe.topojson   objects land, borders, labels (properties name, kind, rank)

Run from the repository root (after build_boundaries.py, whose Offshore area it reads):
    uv run python scripts/geo/build_basemap.py
"""

import json
from itertools import pairwise
from pathlib import Path

import geopandas as gpd
import shapely

NATURAL_EARTH = Path("backend/data/geo/naturalearth")
COUNTRIES = NATURAL_EARTH / "ne_10m_admin_0_countries_deu.shp"
LAKES = NATURAL_EARTH / "ne_10m_lakes.shp"
STATES = Path("frontend/public/states_boundaries.topojson")
OUTPUT = Path("frontend/public/basemap_europe.topojson")

EXTENT = (-12.0, 34.5, 42.0, 62.5)  # lon/lat: Portugal to western Russia, Sicily to southern Scandinavia
GERMANY = "DEU"
# Simplification in degrees: finer close to Germany (seen at the zoom of a Landkreis), coarse farther out
NEAR = shapely.box(1.5, 45.0, 19.5, 57.5)
TOLERANCE_NEAR = 0.002  # about 150 m
TOLERANCE_FAR = 0.012  # about 1 km
MIN_ISLAND = 0.0004  # deg², about 3 km²: smaller islands far from Germany are left out
LAKE_RANK = 8  # Natural Earth scalerank of the lakes cut out (Bodensee 5, Gardasee 7)
MIN_LABELLED = 0.25  # deg²: smaller countries go unnamed (Luxemburg 0.33 is named, Liechtenstein or Jersey are not)
QUANTIZATION = 1e5

# Seas, named where they are open water in the usual views of the map
SEAS = [
    ("Nordsee", 4.55, 54.35),
    ("Ostsee", 16.1, 55.05),
    ("Atlantischer Ozean", -8.5, 46.0),
    ("Mittelmeer", 5.0, 39.6),
]


def main():
    frame = shapely.box(*EXTENT)
    countries = gpd.read_file(COUNTRIES, encoding="utf-8")
    countries = countries[countries.intersects(frame)].reset_index(drop=True)
    countries = countries.assign(geometry=countries.geometry.make_valid().intersection(frame))
    countries = countries[~countries.geometry.is_empty].reset_index(drop=True)

    lakes = gpd.read_file(LAKES, encoding="utf-8")
    lakes = lakes[(lakes["scalerank"] <= LAKE_RANK) & lakes.intersects(frame)]
    states = gpd.read_file(STATES)
    german_sea = states.loc[states["ags"] == "offshore", "geometry"].union_all()

    land = shapely.union_all(countries.geometry.values)
    land = land.difference(shapely.union_all(lakes.geometry.make_valid().values)).difference(german_sea)
    land = simplified_land(land)
    borders = simplified_lines(shared_borders(countries))
    labels = country_labels(countries, frame)

    write_topojson(
        {
            "land": [({}, land)],
            "borders": [({}, borders)],
            "labels": [(props, shapely.Point(x, y)) for props, (x, y) in labels],
        },
        OUTPUT,
    )


def simplified_lines(lines):
    """Lines simplified finer within NEAR than outside (the parts apart, so each keeps its own tolerance)."""
    near = shapely.simplify(lines.intersection(NEAR), TOLERANCE_NEAR)
    far = shapely.simplify(lines.difference(NEAR), TOLERANCE_FAR)
    parts = [*shapely.get_parts(near), *shapely.get_parts(far)]
    return shapely.MultiLineString([p for p in parts if isinstance(p, shapely.LineString) and p.length > 0])


def simplified_land(land):
    """The land simplified finer within NEAR than outside, without the small islands far from Germany. The parts are
    simplified apart; drawn without a stroke, no seam shows between them."""
    near = shapely.simplify(land.intersection(NEAR), TOLERANCE_NEAR, preserve_topology=True)
    far = shapely.simplify(land.difference(NEAR), TOLERANCE_FAR, preserve_topology=True)
    polygons = [p for p in shapely.get_parts(near) if isinstance(p, shapely.Polygon) and not p.is_empty]
    polygons += [p for p in shapely.get_parts(far) if isinstance(p, shapely.Polygon) and p.area >= MIN_ISLAND]
    print(f"land: {len(polygons)} polygons")
    return shapely.MultiPolygon(polygons)


def shared_borders(countries):
    """The borders between two countries, none of them Germany: where their outlines meet."""
    outlines = countries.geometry.boundary.values
    tree = shapely.STRtree(outlines)
    left, right = tree.query(outlines, predicate="intersects")
    lines = []
    for a, b in zip(left, right):
        if a < b and GERMANY not in (countries.at[a, "ADM0_A3"], countries.at[b, "ADM0_A3"]):
            shared = shapely.intersection(outlines[a], outlines[b])
            lines += [p for p in shapely.get_parts(shared) if isinstance(p, shapely.LineString)]
    return shapely.line_merge(shapely.union_all(lines))


def country_labels(countries, frame):
    """A label per country, Germany and the smallest aside: at Natural Earth's label point if it lies in the frame and
    on the country's land, else at a point inside the country's largest part within the frame. rank: Natural Earth's
    MIN_LABEL, the zoom from which a label makes sense (lower: more important)."""
    inner = frame.buffer(-0.6)
    labels = []
    for _, country in countries.iterrows():
        if country["ADM0_A3"] == GERMANY or country.geometry.area < MIN_LABELLED:
            continue
        point = shapely.Point(country["LABEL_X"], country["LABEL_Y"])
        if not (inner.contains(point) and country.geometry.buffer(0.05).contains(point)):
            largest = max(shapely.get_parts(country.geometry), key=lambda p: p.area)
            if largest.area < 0.05:
                continue
            point = shapely.point_on_surface(largest)
        labels.append(
            ({"name": country["NAME_DE"], "kind": "country", "rank": float(country["MIN_LABEL"])}, (point.x, point.y))
        )
    labels += [({"name": name, "kind": "sea", "rank": 3.0}, (x, y)) for name, x, y in SEAS]
    return labels


def write_topojson(objects: dict[str, list], path: Path):
    """TopoJSON, quantized and delta-encoded, one arc per ring or line (nothing to share: the land is one shape)."""
    x0, y0, x1, y1 = EXTENT
    kx, ky = (x1 - x0) / (QUANTIZATION - 1), (y1 - y0) / (QUANTIZATION - 1)
    arcs = []

    def quantized(coords):
        points = []
        for x, y in coords:
            point = (round((x - x0) / kx), round((y - y0) / ky))
            if not points or point != points[-1]:
                points.append(point)
        return points

    def arc(coords, closed):
        points = quantized(coords)
        if len(points) < (4 if closed else 2):
            return None
        arcs.append([list(points[0]), *([b[0] - a[0], b[1] - a[1]] for a, b in pairwise(points))])
        return len(arcs) - 1

    def encoded(geometry):
        if isinstance(geometry, shapely.Point):
            return {"type": "Point", "coordinates": list(quantized(geometry.coords)[0])}
        if isinstance(geometry, (shapely.LineString, shapely.MultiLineString)):
            lines = [[a] for line in shapely.get_parts(geometry) if (a := arc(line.coords, False)) is not None]
            return {"type": "MultiLineString", "arcs": lines}
        polygons = []
        for polygon in shapely.get_parts(geometry):
            rings = [arc(r.coords, True) for r in (polygon.exterior, *polygon.interiors)]
            if rings[0] is not None:
                polygons.append([[r] for r in rings if r is not None])
        return {"type": "MultiPolygon", "arcs": polygons}

    topology = {
        "type": "Topology",
        "transform": {"scale": [kx, ky], "translate": [x0, y0]},
        "objects": {
            name: {"type": "GeometryCollection", "geometries": [{**encoded(g), "properties": p} for p, g in items]}
            for name, items in objects.items()
        },
        "arcs": arcs,
    }
    with open(path, "w") as f:
        json.dump(topology, f, separators=(",", ":"), ensure_ascii=False)
    points = sum(len(a) for a in arcs)
    print(f"{path}: {points:,} points, {path.stat().st_size / 1e3:.0f} kB")


if __name__ == "__main__":
    main()
