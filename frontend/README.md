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

## Map dashboards (`/erzeuger`, `/speicher`, `/gas`)

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

### Filters of a technology (`subtypes`, `leistung`)

```js
subtypes: { param: 'anlagenart', label: 'Anlagenart', options: [{ id: 'gebaeude', label: 'Gebäude' }, …] }
leistung: { param: 'leistung', label: 'Leistung', options: [{ id: 'netto', … }, { id: 'brutto', … }], note: '…' }
```

The active technology's filters are a layer of their own below all technology chips ("Filter für Solar", `TechFilters`
in `ControlPanel.jsx`), hanging off the choice of technology on an accent line: `SubtypePicker` checkboxes (at least
one stays selected; an option with a `color` shows it in its box) and the small `OptionSwitch` Netto (AC) / Brutto
(DC). The `note` of `leistung` is a footnote below the map, marked ¹ at the switch and in the map title
(`footnoteId`).

Solar: both go to every solar request as the same parameters as in the page URL
(`?anlagenart=freiflaeche&leistung=brutto`, only what differs from the default: all Anlagenarten, Netto – the API has
the same default) – map, KPIs, ranking, analysis cards and the table per region (`selectionQuery` in
`MapDashboard.jsx`). The solar views hold one row per Anlagenart (gebaeude: 853, 2484, 2961 and none; freiflaeche: 852)
with Brutto and Netto columns; the API sums the chosen Anlagenarten and answers with the usual field names, so nothing
else changes on the page. Map title, legend and Top 10 name the measure ("· Netto (AC)"), the map subtitle a narrowed
selection ("· nur Freifläche"). The Zubau im Zeitverlauf follows the Leistung (series with `netto`), not the
Anlagenart; the heatmap (a static image) neither.

Sites (`plantsPath`) with `subtypes` filter their plants in the browser by the plant's `subtypes.field` instead (Gas:
Technologie, Speicherart), and colour them by the option's `color`.

### Analysis cards with data (`kind`)

`AnalysisCard.jsx` renders an analysis by its `kind`, in the scope (`region`: `DE`, the Land or the Kreis key, from
the URL), and falls back to the `ChartPlaceholder` ("bald") where the active technology has no data for it:

| kind | Chart | Data |
| --- | --- | --- |
| `sizes` | `SizeDistribution.jsx`: share of power and units per size class as bars (`components/charts/GroupedBarChart.jsx`), one scale for both; a switch shows them horizontal or vertical (to choose one) | `technology.sizesPath` (`/{solar,wind,water}/size-distribution`, `mrt.size_distribution`) |
| `orientation` | `OrientationRose.jsx`: compass rose, power and share inside the 8 sectors, Ost-West and nachgeführt in the centre, unknown below | `analysis.path` (`/solar/orientation`, `mrt.solar_orientation`) |

Both views hold one row per region (Deutschland, Länder, Kreise, Gemeinden) and class, also empty ones, so a request
returns exactly the rows of one scope. Classes, thresholds and labels live in the SQL only
(`backend/app/etl/queries/aggregate_size_distribution.sql`).

### The Analysen section (`AnalysisPanel.jsx`)

Below the cards, set off by a rule: the heading with one link per analysis (jumps there), then each analysis as a card
of its own that starts with a clear head – accent bar, tinted band, icon (`icon` of the analysis), title, what it shows,
its switches on the right (`tools`). Timelines (`timeline`), wide analyses (`wide`: `pv-speicher`, `registrations`) and
the table per region all use it. The section only shows where it has something.

### Registrierungen im MaStR (`RegistrationsAnalysis.jsx`, kind `registrations`)

Units registered per year (`Registrierungsdatum`) since the first registration (2019, when the register started),
Germany-wide, one technology at a time (a switch, not stacked): `/zubau/registrierungen` from `mrt.registrierungen`
(`aggregate_registrierungen.sql`), every unit the register lists whatever its status. Each dashboard lists its
technologies in `registrations.series` (Erzeuger: Solar, Wind, Wasserkraft; Speicher: Batterie, Pumpspeicher; Gas:
Gaserzeuger, Gasspeicher). Counts from 10,000 on read in thousands on the axis (`StackedChart`, unit `Anzahl`).

### Solaranlagen mit Batteriespeicher (`PvSpeicherAnalysis.jsx`, `wide` on an analysis)

Solar and battery units that share their Lokation (`LokationMaStRNummer`: the grid connection the register groups a
site's units by), Germany-wide: KPIs, the share with a battery by year of commissioning (all / without Balkon-PV) and by
size class, batteries without solar at their Lokation, and how often the operators' own flag `SpeicherAmGleichenOrt` is
right. Data: `/solar/pv-speicher` → `mrt.pv_speicher` (solar units per Anlagenart, size class and year, with the battery
power and capacity at their Lokation, split between its solar units by power) and `mrt.speicher_pv` (batteries per size
class, with or without solar). All values add up; the page sums the chosen Anlagenarten, Brutto or Netto.

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

### Sites instead of areas (`plantsPath`, `site`)

A technology with `plantsPath` shows each plant as an icon at its location on the Bundesländer, instead of shading
areas: `SiteMarkers.jsx`, helpers in `sites.js`. Pumpspeicher: `/pumped-storage/plants` (`mrt.pumpkraftwerke`); Gas:
`/gas/erzeuger` and `/gas/speicher` (`mrt.gaserzeuger`, `mrt.gasspeicher`, from `aggregate_gas.sql`).

```js
site: { label: 'Speicher', key: 'mastr_nummer', icon: '<ellipse …/><path …/>', size: 20,
        rows: [{ key: 'total_capacity', label: 'Arbeitsgas', unit: 'GWh' }, …], since: 'inbetriebnahme' }
```

`icon` is the inner SVG (filled white on a circle), `rows` the tooltip lines (power and energy scale up from 1,000:
45.806 GWh read 45,8 TWh), `key` the plant's id, `label` the name of the plants in the ranking and subtitle. Plants in
operation have the topic colour or the colour of their subtype, planned or temporarily shut down ones grey; plants at
the same spot (Speicheranlagen of one station, storages of several operators at Etzel or Epe) share one icon and
tooltip. The technology brings its own `metrics` (ranking; the Kennzahl switch only shows with two or more) and `kpis`,
computed from the plants per Land/Kreis: `plants` in operation, `planned`, and the sum of every other KPI field. Plants
abroad (Austria, Luxembourg, the Netherlands) are on the map but not in the KPIs. `note` on a technology is a line below
the map. The Analysen section only shows when it has something (Gas: nothing yet).

Offshore wind: the sea is drawn with a blue border and halo on top of the regions (`ChoroplethMap.jsx`, `SEA_*`).

### Zubau im Zeitverlauf (`timeline` on an analysis)

An analysis with `timeline` is drawn full-width above the other cards (`TimelineAnalysis.jsx`), Germany-wide whatever
the scope. Data: `/zubau/zeitverlauf?technology=…` from `mrt.zubau_zeitverlauf` (`aggregate_zubau.sql`), one row per
series and month plus one per year (`month` null), with `added` (Zubau) and `installed` (Bestand at the period's end).
Views: yearly bars, or monthly for the last 12 months, a year or all months since `since`, as bars (Zubau) or as a
curve (Bestand, stacked areas). Series are stacked in config order, the first at the bottom; a click on the legend
hides one. The chart itself (`components/charts/StackedChart.jsx`) is plain SVG, no chart library.

- Erzeuger: Solar, Wind an Land, Wind auf See in MW (`Bruttoleistung`; Solar as `Nettonennleistung`, series
  `solar_netto`, while the Leistung is Netto, the default).
- Speicher: battery capacity in MWh (`NutzbareSpeicherkapazitaet` of the Speicheranlage), by size class and with the
  plausibility check of battery-charts.de.

## Start page (`pages/HomePage.jsx`, `features/home/`)

After the hero: the register in four large numbers (`RegisterFigures.jsx`: solar, wind, batteries, gas storages, live
from the dashboards' endpoints), one chapter per dashboard with a live chart of its data (`Chapters.jsx`: the Zubau of
both timelines per year, the gas storages as circles on a small SVG map, `lib/svgMap.js`), then where the numbers come
from. What it requests is in `homeData.js`.

## Datenstand

Every "Datenstand" on the site (dashboard header, map footer, site footer, home page, Info page, PDF export) comes from
`useDatenstand()` in `src/lib/data.js`: `GET /meta/datenstand`, which serves the day noted by the last complete nightly
update (`backend/app/etl/update.py`, table `meta.update_runs`). Until one is noted, or while the API is unreachable, it
falls back to `SITE.dataStand` in `src/config/site.js`.

## Known issues

- PNG/PDF export (`exportMap.js`, html2canvas) loses the canvas layers: exported images show labels and legend but no
  shading. Pre-existing, tracked separately.
