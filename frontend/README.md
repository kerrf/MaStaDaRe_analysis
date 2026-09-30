# Frontend (mastr-data.de)

React 18 + Vite + react-leaflet. Site copy is German, code and comments English.

```bash
npm install
npm run dev      # http://localhost:5173, expects the API at VITE_API_URL (default http://localhost:8000)
npm run lint
npm run build
```

Public, user-facing documentation (method, map usage, sources, licences) lives on the Info page:
`src/pages/InfoPage.jsx` → `/info`. `TodoNote`s there and in `src/config/dashboards.js` (`todos`) are only rendered by
`npm run dev`, never in production.

## Map dashboards (`/erzeuger`, `/speicher`)

Everything a dashboard shows is configured in `src/config/dashboards.js`; `src/features/dashboard/MapDashboard.jsx`
renders it.

### URL state

| Where | Meaning |
| --- | --- |
| path `/erzeuger/:land` | Selected Bundesland (ISO code, e.g. `by`) – zooms in and masks the rest of Germany |
| path `/erzeuger/:land/:kreis` | Selected Landkreis of that Land (5-digit key, e.g. `by/09175`) – zooms in further |
| `?technologie=` | Technology id, default = first in `technologies` |
| `?kennzahl=` | Metric id, default = first in `metrics` |
| `?ebene=` | Resolution id from `GRANULARITIES`, default = `defaultGranularity` |
| `?anlagenart=gebaeude` | Solar sub-selection (comma separated). No parameter = all options |

Defaults are never written to the URL.

### Zooming in and out (Deutschland › Bundesland › Landkreis)

- Clicking a Land (Bundesländer resolution) or picking it in the scope bar navigates to `/erzeuger/<land>` and switches
  the resolution to Landkreise. Clicking one of its Landkreise (or picking it in the second dropdown) navigates to
  `/erzeuger/<land>/<kreis>` and switches to Gemeinden. Gemeinden are the deepest level.
- `selectScope(land, kreis)` in `MapDashboard.jsx` handles every move between the levels. The switch made when entering
  a level is stored in the history entry (`location.state.drill = { land: { from, to }, kreis: { from, to } }`); leaving
  the level – click outside it on the map, the "Deutschland" breadcrumb, "Bundesland wählen" / "Landkreis wählen", or
  another Land – restores the previous resolution, unless the user changed it in the meantime. Moving to a sibling (Kreis
  to Kreis) keeps it. Metric changes keep the state (`setParam` passes it on).
- A click outside the focused area goes **one level up** (Landkreis → its Land → Deutschland); the hint reads "Klicken für
  Bayern-Ansicht" or "Klicken für Deutschland-Ansicht". Unknown `:land` / `:kreis` values redirect to the level above.
- Inside a Landkreis the KPI tiles show the Kreis with its share of and rank within its Land (`level=landkreis` stats);
  the ranking lists areas within the deepest scope that contains them (Kreise within their Land, Gemeinden within their
  Kreis), matched by key prefix.
- The area outside the focus is a mask polygon drawn with an **SVG** renderer (`ChoroplethMap.jsx`, pane `focus`), while
  the rest of the map is canvas. An SVG path only catches the pointer where it is painted, so the mask receives clicks and
  shows the exit hint (sticky tooltip in `tooltipPane`), and the hole passes events through to the choropleth. Keep it
  that way: a canvas mask would swallow all map events.
- Leaflet binds click and tooltip handlers once per layer; `ChoroplethLayer` reads the current ones through a ref, so the
  layer can stay when only the scope changes.

### Technology sub-selection (`subtypes`)

```js
subtypes: { param: 'anlagenart', label: 'Anlagenart', options: [{ id: 'gebaeude', label: 'Gebäude' }, …] }
```

Shown as a checkbox panel directly under the active chip (`ControlPanel.jsx`, `SubtypePicker`); dense grid packing puts
it in the row right below the chip, the caret is the chip's `::after`. At least one option stays selected. The selection
is parsed in `MapDashboard.jsx` (`subtypes`) but **not yet sent to the API** – MaStR field `ArtDerSolaranlage`
(853 Gebäude, 852 Freifläche).

### Analysis cards with data (`kind`)

`AnalysisCard.jsx` renders an analysis by its `kind`, in the scope (`region`: `DE`, the Land or the Kreis key, from
the URL), and falls back to the `ChartPlaceholder` ("bald") where the active technology has no data for it:

| kind | Chart | Data |
| --- | --- | --- |
| `sizes` | `SizeDistribution.jsx`: share of power and units per size class, one bar scale | `technology.sizesPath` (`/{solar,wind,water}/size-distribution`, `mrt.size_distribution`) |
| `orientation` | `OrientationRose.jsx`: compass rose, power and share inside the 8 sectors, Ost-West and nachgeführt in the centre, unknown below | `analysis.path` (`/solar/orientation`, `mrt.solar_orientation`) |

Both views hold one row per region (Deutschland, Länder, Kreise, Gemeinden) and class, also empty ones, so a request
returns exactly the rows of one scope. Classes, thresholds and labels live in the SQL only
(`backend/app/etl/queries/aggregate_size_distribution.sql`).

### Table per region (`RegionTable.jsx`)

In the "Analysen" section, below the Zubau: the same analyses for every Land, Kreis or Gemeinde below the scope (a Land
lists its Kreise or Gemeinden, a Kreis its Gemeinden), one column per orientation or size class. The cells of a row are
shaded against each other on the dashboard's ramp, like the rose: an area's largest category is its darkest. Sortable by
every column, searchable by name or key, 50 rows at a time; the CSV holds every row found, in the chosen values plus
both totals.

The controls look like what they choose: the analysis (Ausrichtung / Anlagengröße) as tabs in the header, the rows as
the labelled dropdown "Gebiete", the cells as the labelled unit switch "Werte" (Anteil %, Leistung MW, Anzahl), search
and CSV as tools on the right.

Page order: map, then the cards for its scope (Top 10, Verteilung, Ausrichtung), then the "Analysen" heading with the
wide ones (Zubau im Zeitverlauf, this table).

Data: `{path of the card}/regions?level=…&within=…` (e.g. `/solar/orientation/regions?level=gemeinde&within=09`),
`{ columns: [{ key, label, hint }], rows: [{ region, units: [...], power: [...] }] }` with the values in the order of
the columns. The names come from the boundaries of the level, like on the map. The views are indexed by
(level, region, column) with byte-ordered keys, so a level is read presorted: all 10 956 Gemeinden take ~0.6 s, the
Kreise of a Land ~0.1 s.

### Technology-specific analyses (`analyses` on a technology)

Appended to the dashboard's `analyses` while that technology is active; Solar adds "Ausrichtung" (placeholder,
`ChartPlaceholder` variant `radial`, MaStR `Hauptausrichtung`). With an even number of cards (Top 10 + analyses, without
the full-width timelines) the grid switches to two columns (`analyses-grid--pairs`).

### Resolutions (`GRANULARITIES`)

| id | Boundaries | Stats |
| --- | --- | --- |
| `bundesland` | `public/states_boundaries.topojson` (16 Länder, key `ags` 2-digit) | `apiLevel: 'bundesland'` |
| `landkreis` | `public/landkreise_boundaries.topojson` (400 Kreise, key `ags` 5-digit) | `apiLevel: 'landkreis'` |
| `gemeinde` | `public/gemeinden_boundaries.topojson` (10 956 Gemeinden, key `ags` 8-digit) | `apiLevel: 'gemeinde'` |
| `plz2`, `plz3`, `plz5` | `public/plz*_boundaries.topojson` | `apiLevel: 'plz…'` (Solar only) |
| `heatmap` | PNG from the API (`heatmapPath`) | – |

A technology can restrict the resolutions it has data for (`granularities: [...]`, checked by `isAvailable`); Wind,
Wasserkraft and Batterie only have the three region levels. Länder, Kreise and Gemeinden also contain the sea (`ags: 'offshore'`), shown
only for technologies with `offshore: true` (Wind) – the map then also zooms out to include it (`GERMANY_SEA_BOUNDS`).

An entry without `apiLevel` is drawn as **borders only**: no stats request, no legend, chip "Nur Grenzen · Werte folgen",
ranking placeholder. Whenever the areas carry no values – borders only, plant icons on top (`plantsPath`, Pumpspeicher) or
no data yet – they are drawn as a neutral base map (light land, grey borders; `neutral` in `ChoroplethMap.jsx`) instead
of the grey "Keine Daten" fill. To show values, add an endpoint level and set `apiLevel`; rows are joined on `featureKey`
(`row[apiLevel] === feature.properties[featureKey]`). `labelKey` names the property used in tooltips and the ranking.

All three region layers are built from one source (BKG VG250-EW) by `scripts/geo/build_boundaries.py`, so their borders
match exactly; sources, accuracy and updating are documented in `scripts/geo/README.md`.

### Sites instead of areas (`plantsPath`)

A technology with `plantsPath` (Pumpspeicher: `/pumped-storage/plants`, from `mrt.pumpkraftwerke`) shows each plant as an
icon at its location on the Bundesländer, instead of shading areas: `SiteMarkers.jsx`, helpers in `sites.js`. Plants in
operation are blue, planned or temporarily shut down ones grey; plants at the same spot (the register lists some
stations as two Speicheranlagen) share one icon and tooltip. The technology brings its own `metrics` (ranking) and `kpis`
(computed from the plants per Land/Kreis). Plants abroad (Austria, Luxembourg) are on the map but not in the KPIs.

### Zubau im Zeitverlauf (`timeline` on an analysis)

An analysis with `timeline` is drawn full-width above the other cards (`TimelineAnalysis.jsx`), Germany-wide whatever
the scope. Data: `/zubau/zeitverlauf?technology=…` from `mrt.zubau_zeitverlauf` (`aggregate_zubau.sql`), one row per
series and month plus one per year (`month` null), with `added` (Zubau) and `installed` (Bestand at the period's end).
Views: yearly bars, or monthly for the last 12 months, a year or all months since `since`, as bars (Zubau) or as a
curve (Bestand, stacked areas). Series are stacked in config order, the first at the bottom; a click on the legend
hides one. The chart itself (`components/charts/StackedChart.jsx`) is plain SVG, no chart library.

- Erzeuger: Solar, Wind an Land, Wind auf See in MW (`Bruttoleistung`).
- Speicher: battery capacity in MWh (`NutzbareSpeicherkapazitaet` of the Speicheranlage), by size class and with the
  plausibility check of battery-charts.de.

## Datenstand

Every "Datenstand" on the site (dashboard header, map footer, site footer, home page, Info page, PDF export) comes from
`useDatenstand()` in `src/lib/data.js`: `GET /meta/datenstand`, which serves the day noted by the last complete nightly
update (`backend/app/etl/update.py`, table `meta.update_runs`). Until one is noted, or while the API is unreachable, it
falls back to `SITE.dataStand` in `src/config/site.js`.

## Known issues

- PNG/PDF export (`exportMap.js`, html2canvas) loses the canvas layers: exported images show labels and legend but no
  shading. Pre-existing, tracked separately.
