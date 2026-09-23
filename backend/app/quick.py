import topojson as tp
import json

import geopandas as gpd
import topojson as tp

# Read the shapefile (ensure .shx and .dbf files are in the same folder)
gdf = gpd.read_file("/home/kerf/energy_projects/mastadatregpv_korrekt-main/backend/data/geo/bundeslaender/de.json")

gdf = gdf.to_crs(epsg=4326)
# Compress directly from the GeoDataFrame to TopoJSON
topo = tp.Topology(gdf, topology=True)
topo.to_json("/home/kerf/energy_projects/mastadatregpv_korrekt-main/frontend/public/states_boundaries.topojson")