# Map layers (Bundesländer, Landkreise, Gemeinden, Offshore, Europe, place names)

Three scripts build what the map draws:

| Script | Output | From |
| --- | --- | --- |
| `build_boundaries.py` | the region layers and the region tables of the database | BKG VG250-EW, Marine Regions |
| `build_basemap.py` | Europe around Germany: land, borders, names of countries and seas | Natural Earth |
| `build_places.py` | the place names: every Gemeinde and the Ortsteile, with population | BKG VG250-EW, BKG GN250 |

```bash
uv run python scripts/geo/build_boundaries.py      # from the repository root, about 1 minute
uv run python scripts/geo/build_basemap.py         # after build_boundaries.py (it cuts out the German sea), seconds
uv run python scripts/geo/build_places.py          # seconds
```

## Region layers

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
shows it for technologies with `offshore` (wind, while "Auf See" is chosen).

Then load the tables (in `backend/app/etl/db_migrate.py`, run `migrate_regions(...)` in the main block) and rebuild the
rollups (`uv run python -m app.etl.transform` in `backend/`).

### How it works

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

## Europe around Germany (`build_basemap.py`)

`frontend/public/basemap_europe.topojson` (about 260 kB, 90 kB gzip), objects `land`, `borders`, `labels`:

- **land**: the countries of Natural Earth 1:10m, as Germany sees their borders ("point of view DEU"), cut to a frame
  from Portugal to western Russia (12° W – 42° E, 34.5° – 62.5° N), merged into one shape, without the larger lakes
  (Bodensee, Genfer See, …) and without the German sea of the Offshore area: the German coast is the one of the region
  layers. Simplified finer near Germany (0.002°, ~150 m, seen at the zoom of a Kreis) than farther out (0.012°).
  Germany is part of it, so no gap shows between its exact border and a neighbour's coarser one.
- **borders**: between two other countries; Germany's borders come from the region layers.
- **labels**: a point per country (German name, Natural Earth's `MIN_LABEL` as `rank`), the small ones left out, and
  the seas (`SEAS` in the script).

## Place names (`build_places.py`)

`frontend/public/places/de.json` and one file per Land (`01.json` … `16.json`), rows of
`[name, lon, lat, population, ags, kind]`, the largest first; kind `L` Landeshauptstadt, `S` Stadt, `G` Gemeinde,
`O` Ortsteil:

- **Gemeinden** (10 754 with inhabitants): VG250 layer `vg250_pk`, a point per Gemeinde at its main settlement, with the
  official population of the whole Gemeinde (`EWZ` of `vg250_gem`) and its kind (`BEZ`: Stadt or Gemeinde).
- **Ortsteile** (35 120): GN250, settlements (`AX_Ortslage`) that are part of a Gemeinde (`GEMTEIL`), with a computed
  population (`EWZ_GER`: the Gemeinde's, shared out by the area of its settlements, a measure of size rather than a
  count). Without the main settlement of a Gemeinde, which the Gemeinde's own point already names.
- `de.json` (1 598 places, 34 kB gzip): the Gemeinden from 10 000 inhabitants and the capitals; every map loads it. A
  Land's file (Bayern 160 kB gzip, most far less): the rest, loaded once the map shows that Land up close.

Each place carries its AGS, so the map can name only the places of the Land or Kreis in view.

## Sources and updating

| Data | Source | Stand | Licence |
| --- | --- | --- | --- |
| Länder, Kreise, Gemeinden with population (EWZ) and area (KFL) | [BKG VG250-EW](https://gdz.bkg.bund.de/index.php/default/verwaltungsgebiete-1-250-000-mit-einwohnerzahlen-stand-31-12-vg250-ew-31-12.html), GeoPackage `vg250-ew_12-31.utm32s.gpkg.ebenen.zip` | 31.12.2024 (published 11/2025) | dl-de/by-2-0 |
| Sea (EEZ incl. 12-mile zone) | [Marine Regions](https://www.marineregions.org/), EEZ v12, MRGID 5669 | 2023 | CC BY 4.0 |
| Place names (Ortslagen) | [BKG GN250](https://gdz.bkg.bund.de/index.php/default/open-data/geographische-namen-1-250-000-gn250.html), CSV `gn250.utm32s.csv.zip` | 31.12.2024 (published 09/2026) | dl-de/by-2-0 |
| Europe (countries, lakes) | [Natural Earth](https://www.naturalearthdata.com/) 1:10m, `ne_10m_admin_0_countries_deu`, `ne_10m_lakes` | 5.1.1 | public domain |

Put the files where the scripts expect them (`backend/data` is gitignored):

```bash
cd backend/data/geo
curl -o vg250-ew/vg250-ew.gpkg.zip https://daten.gdz.bkg.bund.de/produkte/vg/vg250-ew_ebenen_1231/aktuell/vg250-ew_12-31.utm32s.gpkg.ebenen.zip
unzip vg250-ew/vg250-ew.gpkg.zip -d vg250-ew
curl -o offshore/eez_germany.geojson "https://geo.vliz.be/geoserver/MarineRegions/wfs?service=WFS&version=1.0.0&request=GetFeature&typeName=MarineRegions:eez&cql_filter=mrgid=5669&outputFormat=application/json"
curl -o gn250/gn250.csv.zip https://daten.gdz.bkg.bund.de/produkte/sonstige/gn250/aktuell/gn250.utm32s.csv.zip
unzip gn250/gn250.csv.zip -d gn250
curl -o naturalearth/countries.zip https://naciscdn.org/naturalearth/10m/cultural/ne_10m_admin_0_countries_deu.zip
curl -o naturalearth/lakes.zip https://naciscdn.org/naturalearth/10m/physical/ne_10m_lakes.zip
unzip naturalearth/countries.zip -d naturalearth && unzip naturalearth/lakes.zip -d naturalearth
```

A new VG250-EW edition appears once a year (the population needs the census figures, hence the delay). Download it,
check the path in `VG250`, rebuild, reload the tables and update the Stand on the Info page.

Attribution: `© GeoBasis-DE / BKG (2025), dl-de/by-2-0 (Daten verändert)` and `Flanders Marine Institute (2023): Maritime
Boundaries Geodatabase, version 12, CC BY 4.0`. GN250 asks for `© BKG (2026) dl-de/by-2-0, Datenquellen:
https://sgx.geodatenzentrum.de/web_public/gdz/datenquellen/datenquellen_gn250.pdf` wherever its data is shown, "BKG"
linked to bkg.bund.de and "dl-de/by-2-0" to govdata.de: the line below the map (`MapView.jsx`), the map exports and the
Info page carry it. Natural Earth needs no attribution; the Info page names it.

## Matching the MaStR

The rollups join units via their `Gemeindeschluessel` (the AGS), not via names: the names differ in spelling for about
2 700 solar units ("Alt Mölln" / "Alt-Mölln", "Schmitten" / "Schmitten im Taunus"), the keys don't. About 0.1 % of the
units carry the key of a Gemeinde merged after the Stand of the geodata (mostly Thüringen); they still count for their
Landkreis and Bundesland, but have no Gemeinde area.
