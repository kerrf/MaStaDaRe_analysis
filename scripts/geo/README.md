# Region layers (Bundesländer, Landkreise, Gemeinden, Offshore)

`build_boundaries.py` builds the map layers and the region tables of the database from one source, so borders,
names, population and area always belong together:

| Output | Content |
| --- | --- |
| `frontend/public/states_boundaries.topojson` | 16 Länder + Offshore, key `ags` (2 digits), 0.2 MB |
| `frontend/public/landkreise_boundaries.topojson` | 400 Kreise + Offshore, key `ags` (5 digits), 0.8 MB |
| `frontend/public/gemeinden_boundaries.topojson` | 10 956 Gemeinden (incl. gemeindefreie Gebiete) + Offshore, key `ags` (8 digits), 4.7 MB (1.4 MB gzip) |
| `backend/data/geo/gemeinden.csv` | `ags`, `name`, `einwohner` (EWZ), `qkm` (KFL) per Gemeinde → `geo.gemeinden` |
| `backend/data/geo/offshore.csv` | area of the sea in km² → `geo.offshore` |

Every map feature has the properties `ags` and `name`. The sea has `ags = "offshore"` on every level; the frontend only
shows it for technologies with `offshore: true` (wind).

```bash
uv run python scripts/geo/build_boundaries.py      # from the repository root, about 1 minute
```

Then load the tables (in `backend/app/etl/db_migrate.py`, run `migrate_regions(...)` in the main block) and rebuild the
rollups (`uv run python -m app.etl.transform` in `backend/`).

## How it works

1. Read the Gemeinden of VG250-EW (land areas only, `GF = 4`).
2. Offshore: the German Exclusive Economic Zone (which starts at the coast) plus the VG250 coastal waters it touches,
   minus the land.
3. Simplify the Gemeinden and the sea together, each shared border once (tolerance 0.001° ≈ 70 m), so neighbours keep
   identical borders and the sea meets the coast without gaps.
4. Merge the simplified Gemeinden into Kreise (first 5 digits of the key) and Länder (first 2). A Land border is therefore
   exactly the border of its Kreise and Gemeinden, and all three files use the same quantization grid.
5. Write TopoJSON with shared arcs (each border stored once).

Names come from the VG250 layers of each level. Kreise that share a name with their city read "Landkreis Ansbach" next
to "Ansbach"; names that already say what they are stay ("Region Hannover", "Städteregion Aachen").

Accuracy: Gemeinde areas deviate from the official area (KFL) by 0.55 % (median); the outliers are Gemeinden under
1 km². A handful of Gemeinde polygons touch themselves after quantization; Leaflet draws them normally.

## Sources and updating

| Data | Source | Stand | Licence |
| --- | --- | --- | --- |
| Länder, Kreise, Gemeinden with population (EWZ) and area (KFL) | [BKG VG250-EW](https://gdz.bkg.bund.de/index.php/default/verwaltungsgebiete-1-250-000-mit-einwohnerzahlen-stand-31-12-vg250-ew-31-12.html), GeoPackage `vg250-ew_12-31.utm32s.gpkg.ebenen.zip` | 31.12.2024 (published 11/2025) | dl-de/by-2-0 |
| Sea (EEZ incl. 12-mile zone) | [Marine Regions](https://www.marineregions.org/), EEZ v12, MRGID 5669 | 2023 | CC BY 4.0 |

Put the files where the script expects them (both folders are gitignored):

```bash
cd backend/data/geo
curl -o vg250-ew/vg250-ew.gpkg.zip https://daten.gdz.bkg.bund.de/produkte/vg/vg250-ew_ebenen_1231/aktuell/vg250-ew_12-31.utm32s.gpkg.ebenen.zip
unzip vg250-ew/vg250-ew.gpkg.zip -d vg250-ew
curl -o offshore/eez_germany.geojson "https://geo.vliz.be/geoserver/MarineRegions/wfs?service=WFS&version=1.0.0&request=GetFeature&typeName=MarineRegions:eez&cql_filter=mrgid=5669&outputFormat=application/json"
```

A new VG250-EW edition appears once a year (the population needs the census figures, hence the delay). Download it,
check the path in `VG250`, rebuild, reload the tables and update the Stand on the Info page.

Attribution: `© GeoBasis-DE / BKG (2025), dl-de/by-2-0 (Daten verändert)` and `Flanders Marine Institute (2023): Maritime
Boundaries Geodatabase, version 12, CC BY 4.0`.

## Matching the MaStR

The rollups join units via their `Gemeindeschluessel` (the AGS), not via names: the names differ in spelling for about
2 700 solar units ("Alt Mölln" / "Alt-Mölln", "Schmitten" / "Schmitten im Taunus"), the keys don't. About 0.1 % of the
units carry the key of a Gemeinde merged after the Stand of the geodata (mostly Thüringen); they still count for their
Landkreis and Bundesland, but have no Gemeinde area.

afterwards please change the color layout of speicher - zubau zeitverlauf. You just copied the screenshot I gave you, but I want my own color palett. I like how you made solar kinda orange and speicher kinda blue. Think of something for the Zubau Zeitverlauf Speicher.

Afterwards I want you to implement Verteilung nach Anlagegröße and Ausrichtung. How you fetch the data from the data bank you can decide by yourself. Do it in a fast, clean, SOTA way. For Ausrichtung have a circle with all ausrichtungen and inside the values (absolute power, % of total) and somewhere a "unknown" category if we don't know by MaStR