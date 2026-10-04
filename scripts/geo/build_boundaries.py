"""
Build the region layers of the map and the region tables of the database, all from one source.

Source: BKG VG250-EW (Verwaltungsgebiete 1:250 000 mit Einwohnerzahlen) for the Länder, Kreise and Gemeinden,
plus the German Exclusive Economic Zone (Marine Regions) for the sea. Downloads: scripts/geo/README.md.

- All three levels are built from the same Gemeinden: Kreise and Länder are merged from them after simplifying,
  so a Land border is exactly the border of its Kreise and Gemeinden.
- "Offshore" is the German sea (12-mile zone and EEZ) minus the land: a region of its own on every level, for
  the offshore wind farms. It is simplified together with the Gemeinden, so it meets the coast without gaps.

Writes
    frontend/public/{states,landkreise,gemeinden}_boundaries.topojson   the map (properties: ags, name)
    backend/data/geo/gemeinden.csv, offshore.csv                        area and population for the database

Run from the repository root:
    uv run python scripts/geo/build_boundaries.py
"""

import json
from itertools import pairwise
from pathlib import Path

import geopandas as gpd
import pandas as pd
import shapely

VG250 = Path("backend/data/geo/vg250-ew/vg250-ew_12-31.utm32s.gpkg.ebenen/vg250-ew_ebenen_1231/DE_VG250.gpkg")
EEZ = Path("backend/data/geo/offshore/eez_germany.geojson")
MAP_DIR = Path("frontend/public")
TABLE_DIR = Path("backend/data/geo")

# Map file -> digits of the Gemeindeschlüssel (AGS) that identify an area on that level
LEVELS = {
    "states_boundaries.topojson": 2,
    "landkreise_boundaries.topojson": 5,
    "gemeinden_boundaries.topojson": 8,
}
OFFSHORE = "offshore"  # the key of the sea area on every level
OFFSHORE_NAME = "Offshore"

LAND = 4  # VG250 attribute GF: 4 = land, 1-3 = water (sea, Bodensee, rivers)
TOLERANCE = 0.001  # degrees, about 70 m. Kreise and Länder inherit the Gemeinde borders, so they share it
QUANTIZATION = 1e5
EQUAL_AREA = 3035  # ETRS89-LAEA, for the area of the sea in km²


def main():
    gemeinden = read_layer("vg250_gem")
    sea = offshore_area(gemeinden)
    write_tables(gemeinden, sea)

    offshore = gpd.GeoDataFrame({"ags": [OFFSHORE]}, geometry=[sea], crs=gemeinden.crs)
    areas = pd.concat([gemeinden[["ags", "geometry"]], offshore], ignore_index=True).to_crs(4326)
    areas = simplify_shared(areas, TOLERANCE)

    names = {
        **names_of("vg250_lan", plain_name),
        **names_of("vg250_krs", kreis_name),
        **names_of("vg250_gem", plain_name),
    }
    names[OFFSHORE] = OFFSHORE_NAME
    for file_name, digits in LEVELS.items():
        write_topojson(merge_to(areas, digits, names), MAP_DIR / file_name)


def read_layer(layer: str) -> gpd.GeoDataFrame:
    """Land areas of one VG250 level with their key (AGS) as `ags`. Water areas (GF 1-3) have no inhabitants."""
    areas = gpd.read_file(VG250, layer=layer)
    areas = areas[areas["GF"] == LAND].rename(columns={"AGS": "ags"})
    return areas.assign(geometry=areas.geometry.make_valid()).reset_index(drop=True)


def offshore_area(gemeinden: gpd.GeoDataFrame):
    """The German sea: EEZ (which starts at the coast) plus the VG250 coastal waters it touches, minus the land.

    The coastal waters (Wattenmeer, 12-mile zone) come from VG250 like the land, so the sea closes against the
    coast exactly. Waters inland (Bodensee, rivers) don't touch the EEZ and stay out.
    """
    eez = gpd.read_file(EEZ).to_crs(gemeinden.crs).union_all()
    waters = gpd.read_file(VG250, layer="vg250_sta")
    waters = waters[(waters["GF"] != LAND) & waters.intersects(eez)]
    land = gemeinden.union_all()
    return shapely.difference(shapely.union_all([eez, *waters.geometry]), land)


def write_tables(gemeinden: gpd.GeoDataFrame, sea) -> None:
    """Official population (EWZ) and area (KFL, km²) of every Gemeinde, and the area of the sea."""
    table = gemeinden.rename(columns={"GEN": "name", "EWZ": "einwohner", "KFL": "qkm"})
    table[["ags", "name", "einwohner", "qkm"]].to_csv(TABLE_DIR / "gemeinden.csv", index=False)

    sea_km2 = gpd.GeoSeries([sea], crs=gemeinden.crs).to_crs(EQUAL_AREA).area.iloc[0] / 1e6
    pd.DataFrame({"name": [OFFSHORE_NAME], "qkm": [round(sea_km2, 2)]}).to_csv(TABLE_DIR / "offshore.csv", index=False)
    print(f"{len(table)} Gemeinden, {table['einwohner'].sum():,} inhabitants; sea: {sea_km2:,.0f} km²")


def names_of(layer: str, name) -> dict[str, str]:
    areas = read_layer(layer)
    return {ags: name(gen, bez) for ags, gen, bez in zip(areas["ags"], areas["GEN"], areas["BEZ"])}


def plain_name(gen: str, bez: str) -> str:
    return gen


def kreis_name(gen: str, bez: str) -> str:
    """ "Landkreis Ansbach" next to the city "Ansbach"; names that already say what they are stay as they are."""
    if bez in ("Kreisfreie Stadt", "Stadtkreis") or gen.startswith(("Region ", "Städteregion ", "Regionalverband ")):
        return gen
    return f"{bez} {gen}"


def merge_to(areas: gpd.GeoDataFrame, digits: int, names: dict[str, str]) -> gpd.GeoDataFrame:
    """The areas of one level: Gemeinden merged by the first `digits` of their key. The sea stays one area."""
    key = areas["ags"].where(areas["ags"] == OFFSHORE, areas["ags"].str[:digits])
    merged = areas.assign(ags=key).dissolve(by="ags").reset_index()
    return merged.assign(name=merged["ags"].map(names))[["ags", "name", "geometry"]]


def simplify_shared(areas, tolerance):
    """Simplify every border edge once (endpoints fixed), rebuild faces and hand each face back to its area."""
    geoms = shapely.set_precision(areas.geometry.values, 1e-6)
    edges = shapely.get_parts(shapely.line_merge(shapely.union_all(shapely.boundary(geoms))))
    simplified = shapely.simplify(edges, tolerance, preserve_topology=False)
    faces = shapely.get_parts(shapely.polygonize(shapely.get_parts(shapely.union_all(simplified))))

    tree = shapely.STRtree(geoms)
    probes = shapely.point_on_surface(faces)
    owner = dict(zip(*tree.query(probes, predicate="intersects")))
    # Slivers from gaps in the source (or from simplification) lie in no area: give them to the nearest one.
    # Faces farther away are enclosed water (Bodden, Haff) and stay empty.
    orphans = [i for i in range(len(faces)) if i not in owner]
    if orphans:
        (near_face, near_area), distance = tree.query_nearest(probes[orphans], return_distance=True)
        for f, a, d in zip(near_face, near_area, distance):
            if d <= tolerance:
                owner.setdefault(orphans[f], a)

    parts = {}
    for face, area in owner.items():
        parts.setdefault(area, []).append(faces[face])
    result = [shapely.union_all(parts[i]) if i in parts else None for i in range(len(geoms))]
    # Areas smaller than the tolerance can vanish entirely; keep a lightly simplified copy of those.
    lost = [i for i, g in enumerate(result) if g is None or g.is_empty]
    for i in lost:
        result[i] = shapely.simplify(geoms[i], tolerance / 4, preserve_topology=True)
    print(
        f"{len(faces)} faces, {len(orphans)} outside any area, {len(faces) - len(owner)} left empty, {len(lost)} kept unsimplified"
    )
    return areas.set_geometry(result)


def write_topojson(areas, path):
    """TopoJSON with one object "data" (the frontend loads the first object), quantized and delta-encoded.

    Borders are stored once as shared arcs: a ring is cut at every junction (a point where its neighbours differ
    from those of another ring through it), and the pieces two areas have in common are written only once.
    """
    x0, y0, x1, y1 = areas.total_bounds
    kx, ky = (x1 - x0) / (QUANTIZATION - 1), (y1 - y0) / (QUANTIZATION - 1)

    def quantized(ring):
        points = []
        for x, y in ring.coords:
            point = (round((x - x0) / kx), round((y - y0) / ky))
            if not points or point != points[-1]:
                points.append(point)
        return points if len(points) >= 4 else None  # closed ring: first point = last point

    shapes = []
    for geometry in areas.geometry:
        polygons = [[quantized(r) for r in (p.exterior, *p.interiors)] for p in shapely.get_parts(geometry)]
        shapes.append([[r for r in rings if r] for rings in polygons if rings[0]])

    neighbours, junctions = {}, set()
    for ring in (ring for polygons in shapes for rings in polygons for ring in rings):
        for previous, point, following in zip([ring[-2], *ring[:-2]], ring[:-1], ring[1:]):
            if neighbours.setdefault(point, {previous, following}) != {previous, following}:
                junctions.add(point)

    arcs, index = [], {}

    def arc_id(points):
        if tuple(points) in index:
            return index[tuple(points)]
        if tuple(reversed(points)) in index:
            return ~index[tuple(reversed(points))]
        index[tuple(points)] = len(arcs)
        arcs.append(points)
        return len(arcs) - 1

    def ring_arcs(ring):
        body = ring[:-1]
        cuts = [i for i, point in enumerate(body) if point in junctions]
        start = cuts[0] if cuts else body.index(min(body))  # a ring without junctions starts at its lowest point
        rotated = [*body[start:], *body[:start], body[start]]
        pieces, piece = [], [rotated[0]]
        for point in rotated[1:]:
            piece.append(point)
            if point in junctions:
                pieces.append(piece)
                piece = [point]
        if len(piece) > 1:
            pieces.append(piece)
        return [arc_id(piece) for piece in pieces]

    geometries = []
    for record, polygons in zip(areas.drop(columns="geometry").to_dict("records"), shapes):
        polygons = [[ring_arcs(ring) for ring in rings] for rings in polygons]
        if len(polygons) == 1:
            geometries.append({"type": "Polygon", "arcs": polygons[0], "properties": record})
        else:
            geometries.append({"type": "MultiPolygon", "arcs": polygons, "properties": record})

    topology = {
        "type": "Topology",
        "transform": {"scale": [kx, ky], "translate": [x0, y0]},
        "objects": {"data": {"type": "GeometryCollection", "geometries": geometries}},
        "arcs": [[list(arc[0]), *([b[0] - a[0], b[1] - a[1]] for a, b in pairwise(arc))] for arc in arcs],
    }
    with open(path, "w") as f:
        json.dump(topology, f, separators=(",", ":"), ensure_ascii=False)
    print(f"{path}: {len(geometries)} areas, {sum(len(a) for a in arcs):,} points, {path.stat().st_size / 1e6:.1f} MB")


if __name__ == "__main__":
    main()
