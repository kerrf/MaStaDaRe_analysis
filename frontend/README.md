# Frontend (mastr-data.de)

React 18 + Vite + react-leaflet. Site copy is German, code and comments English.

```bash
npm install
npm run dev      # http://localhost:5173, expects the API at VITE_API_URL (default http://localhost:8000)
npm run lint
npm run build    # vite build, then scripts/prerender.mjs: the pages for search engines (see below)
```

Public, user-facing documentation (method, map usage, sources, licences) lives on the Info page:
`src/pages/InfoPage.jsx` → `/info`. `TodoNote`s there and in `src/config/dashboards.js` (`todos`) are only rendered by
`npm run dev`, never in production.

## Dashboards (`/erzeuger`, `/speicher`, `/gas`, `/netz`) and their pages

Everything a dashboard shows is configured in `src/config/dashboards.js`. Each dashboard has several pages, so no page
has to hold everything (`src/config/views.js`):

| Page | Path | Content | Component |
| --- | --- | --- | --- |
| Karte | `/erzeuger/:land?/:kreis?` | the choice of technology, KPIs, then one workspace: settings band, map, rail with Rangliste, Ausrichtung, Anlagengröße | `MapView.jsx`, `MapToolbar.jsx`, `MapRail.jsx` |
| Überblick | `/erzeuger/ueberblick/:land?/:kreis?` | one technology of the scope for a year or month, like a report: Bestand, its parts, Zubau per year or month, its share and rank among its peers, in Germany the national targets and their pace, what is planned; also as a PDF (see below) | `overview/OverviewView.jsx` |
| Zubau & Registrierungen | `/erzeuger/zubau/:land?/:kreis?` | Ausbau im Zeitverlauf, Registrierungen im MaStR, Abstand zwischen Inbetriebnahmen und Registierung – in Deutschland, a Land or a Kreis (no Gemeinde) | `ZubauView.jsx` |
| Anlagen | `/erzeuger/anlagen/:land?/:kreis?` | of the active technology in the scope (down to a Gemeinde): size classes and Ausrichtung, Ausrichtung per Neigungswinkel (solar); size classes, battery technology and AC/DC coupling (batteries); size classes and technology or Speicherart (gas); batteries at solar units; wind every turbine on its own: size classes, the correlation of Nabenhöhe, Rotordurchmesser and Leistung (three plots, r in each), their growth per year, Anlagengröße je nach geographischem Standort (a map with the bands of latitude, beside it each band's median) | `AnlagenView.jsx`, `wind/` |
| Regionen im Detail | `/erzeuger/kommune/…`, `/speicher/kommune/…` | one Kreis and its Gemeinden in depth: solar, batteries (see below, "Landkreis/Gemeinde") | `KommuneView.jsx` |
| Regionen im Vergleich | `/erzeuger/regionen/:land?/:kreis?` | the parts of the scope side by side: a table per Land, Kreis or Gemeinde for Ausrichtung and Anlagengröße | `RegionenView.jsx` |
| Spannungsebenen & Netzbetreiber | `/netz/spannungsebenen/:land?/:kreis?` | the Netzanschlüsse per Netzebene 1–7 with the mix of their technologies, and the largest grid operators – in Deutschland, a Land or a Kreis | `NetzView.jsx` |

Erzeuger and Speicher have the first six, Gas the map, Zubau and Anlagen, the Netzanschlüsse the map and Spannungsebenen &
Netzbetreiber (`DASHBOARD_MENUS`, which also holds the texts of the menus in the nav bar). `Dashboard.jsx` is the shell:
the header – the settings of every page, a light band apart from what the pages show – with the dashboard's one title
(no eyebrow above it: one title per section, like in the navigation), the page's text of its menu entry as the lead,
the area (`ScopeBar`) and the pages as folder tabs along its bottom edge, the current one with the page's paper and the
topic's colour line, open to the page below. Each analysis says on which page it is (`view` on the analysis). The map
page loads Leaflet; the other pages don't.

The settings come in four layers, each above what it changes: the area in the header, the page (tabs), what the page
shows – the technology and its filters (`SelectionBar.jsx`, at the top of the page) – and how a card shows it
(Kennzahl, Bezug, Auflösung, Zeitraster: in the card). The area and the settings of a card are chosen in green, the
technology and its filters in the topic's colour, so the layers read apart.

Every setting looks the same (`components/ui/Setting.jsx`): one box, its name in the box's first field, then its
options – no name floats beside its control, every box is 36 px high (the area 40 px). The name is bold on a light tint
of its layer's colour – green for the area and a card's settings, the topic's colour for the technology and its
filters –, so it stands out from the options and tells the layers apart. The boxes sit in bands on the
sunken tone (`.settings-band`, rows of `SettingsRow`): the area's band in the header, the page's band at its top, a
card's band between its head and its chart (`AnalysisPanel`'s `settings`, the map's toolbar, the table's toolbar). A
row's right side (`aside`) says what the settings amount to and offers the way back: "Alle Seiten zeigen nur Bayern"
with "Ganz Deutschland", "Gefiltert: nur Freifläche" with "Filter aufheben", the number of wind turbines shown.

The choice of the area (`ScopeBar.jsx`) is a path in one box in the header above the tabs: Deutschland › Bundesland ›
Landkreis (› Gemeinde on the pages with `gemeinde`), each step a list of its level. The area the page shows is filled
in the green of chosen buttons, the steps on the way to it in green letters (Deutschland a button back), a step with
none chosen says so – "Alle Bundesländer", "Alle Landkreise", "Alle Gemeinden" (the first option of its list) –, those
not possible yet faded. Narrowed to an area, the band takes a green line on its left. A page
renders its `ScopeBar` where it likes – or not – and the bar goes into the header through a portal (`ScopeSlot` in
`scopeSlot.js`, provided by `Dashboard.jsx`). Beside "Alle Seiten zeigen …" the area's outline (`ScopeOutline.jsx`:
Germany, the Land, or the Kreis – a Gemeinde shows its Kreis). While the header is scrolled out of view, a small card at
the bottom left keeps the outline and the name in sight (`ScopeIndicator.jsx`); its "ändern" goes back up to the Gebiet,
which lights up and takes the keyboard.

`useDashboardState.js` reads the state all pages share from the URL – scope, technology and its filters – and keeps it
when switching pages (`hrefOf(view)`; on Zubau down to the Kreis: its views have no Gemeinden). Each technology's filters have their own
parameters, so the timeline can read solar's choice while wind is active (`selectionOf`).

### URL state

| Where | Meaning |
| --- | --- |
| path `/<dashboard>/<page>` | The page (`zubau`, `anlagen`, `regionen`; none: the map) |
| path `…/:land` | Selected Bundesland (ISO code, e.g. `by`) – zooms in and masks the rest of Germany |
| path `…/:land/:kreis` | Selected Landkreis of that Land (5-digit key, e.g. `by/09175`) – zooms in further |
| `?technologie=` | Technology id, default = first in `technologies` |
| `?kennzahl=` | Metric id, default = first in `metrics`; the toolbar chooses it in two steps, Kennzahl (its `quantity`) and Bezug (its `basis`) |
| `?ebene=` | Resolution id from `GRANULARITIES`, default = `defaultGranularity` |
| `?anlagenart=gebaeude` | Solar sub-selection (comma separated). No parameter = all options |
| `?lage=an_land` | Wind: an Land or auf See. No parameter = both |
| `?spannung=hochspannung` | Netzanschlüsse: Spannungsebenen (comma separated). No parameter = all |
| `?gemeinde=` | A Gemeinde of the Kreis (8-digit key), on the pages with `gemeinde` in `VIEWS` (Anlagen, Landkreis/Gemeinde) |

Defaults are never written to the URL.

### Zooming in and out (Deutschland › Bundesland › Landkreis)

- Clicking a Land (Bundesländer resolution) or picking it in the scope bar navigates to `/erzeuger/<land>` and switches
  the resolution to Landkreise. Clicking one of its Landkreise (or picking it in the second dropdown) navigates to
  `/erzeuger/<land>/<kreis>` and switches to Gemeinden. Gemeinden are the deepest level.
- `selectScope(land, kreis)` in `useDashboardState.js` handles every move between the levels, on every page. The switch made when entering
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

The technology and its filters are one band at the top of every page that has a choice of them – Karte (the top band
of the map card, its toolbar the second row), Regionen im Detail, Anlagen, Regionen im Vergleich – the same everywhere
(`SelectionBar.jsx`): a box "Technologie" (the Netzanschlüsse: `technologyLabel`, "Anschlüsse") with the technologies,
the chosen one filled in the topic's colour, and right after it a box per filter of the chosen technology
(`TechFilters.jsx`): the `SubtypePicker` (Anlagenart, Lage …: at least one stays selected; an option with a `color`
shows it in its box) and the `OptionSwitch` Netto (AC) / Brutto (DC). The `note` of `leistung` is a remark at the
page's bottom, marked ¹ at the switch and in the map title. Further rows of the band: the map's toolbar, on Anlagen
the wind turbines' status and colour (`WindControls.jsx`). Also with a single technology (Speicher; Regionen im Detail:
the dashboard's one).
A technology's selection comes from its own parameters, so a page can show another one than the URL's (Anlagen: the
batteries while the map is on Pumpspeicher) with its filters (`setSubtypesOf`, `setLeistungOf`).

Solar: both go to every solar request as the same parameters as in the page URL
(`?anlagenart=freiflaeche&leistung=brutto`, only what differs from the default: all Anlagenarten, Netto – the API has
the same default) – map, KPIs, ranking, analysis cards and the table per region (`selectionQuery` from
`useDashboardState.js`). The solar views hold one row per Anlagenart (gebaeude: 853, 2484, 2961 and none; freiflaeche: 852)
with Brutto and Netto columns; the API sums the chosen Anlagenarten and answers with the usual field names, so nothing
else changes on the page. Map title, legend and Top 10 name the measure ("· Netto (AC)"), the map subtitle a narrowed
selection ("· nur Freifläche"). The Ausbau im Zeitverlauf follows the Leistung (series with `netto`), not the
Anlagenart.

Wind: `subtypes` Lage (`?lage=an_land|auf_see`). Offshore wind is the region `offshore` on every level; the API leaves
it out without `auf_see` and gives the regions on land zeros without `an_land` (`by_lage` in `routers/wind.py`); the
size classes hold one row per Lage. The map shows the sea while Auf See is chosen (`offshore: 'auf_see'`).

Sites (`plantsPath`) with `subtypes` filter their plants in the browser by the plant's `subtypes.field` instead (Gas:
Technologie, Speicherart), and colour them by the option's `color`.

### Analysis cards with data (`kind`)

`AnalysisCard.jsx` renders an analysis by its `kind`, in the scope (`region`: `DE`, the Land or the Kreis key, from
the URL), and falls back to the `ChartPlaceholder` ("bald") where the active technology has no data for it:

| kind | Chart | Data |
| --- | --- | --- |
| `sizes` | `SizeDistribution.jsx`: share of power and units per size class as columns side by side (`components/charts/GroupedBarChart.jsx`), one scale for both; `measure` `capacity` (batteries, MWh) or `arbeitsgas` (gas storages, GWh) instead of the power. Solar counts Anlagen, not units: those at one grid connection together, balcony-size ones each on its own (`aggregate_size_distribution.sql`) – said in a footnote below the chart (`note`: the technology's `sizesNote`, on Regionen im Detail the analysis' `note`, both `SOLAR_SIZES_NOTE`). Solar adds below it, in the card, the difference of inverter and peak power (`InverterGap.jsx`: the size classes summed once Netto, once Brutto; on average, weighted by power) | `analysis.path`, else `technology.sizesPath` (`/{solar,wind,water}/size-distribution`, `mrt.size_distribution`; `/battery/size-distribution`; `/gas/{erzeuger,speicher}/size-distribution`) |
| `orientation` | `OrientationRose.jsx`: compass rose, power and share inside the 8 sectors, Ost-West and nachgeführt in the centre, unknown below | `analysis.path` (`/solar/orientation`, `mrt.solar_orientation`) |
| `kinds` | `KindShares.jsx`: a ring per kind (`groups`, `components/charts/PieChart.jsx`), the shares of the measure the switch chooses (`measures`: capacity, power or the number), legend with share and amount | `analysis.path`: `/battery/kinds` (`mrt.battery_kinds`: Batterietechnologie, AC/DC-Kopplung), `/gas/erzeuger/kinds` (technology), `/gas/speicher/kinds` (Speicherart) |

The size views hold one row per region (Deutschland, Länder, Kreise, Gemeinden) and class, also empty ones, so a request
returns exactly the rows of one scope. Classes, thresholds and labels live in the SQL
(`backend/app/etl/queries/aggregate_size_distribution.sql`, `aggregate_battery_size_distribution.sql`) – for gas, with its
few hundred sites, in `backend/app/models/gas.py`, which sums the sites of `mrt.gaserzeuger`/`mrt.gasspeicher` per
request (in operation in Germany, in the region by the start of their Gemeindeschlüssel, the chosen kinds:
`?technik=…`, `?speicherart=…`). `mrt.battery_kinds` holds only the kinds that occur in a region; their colours are in
the analysis' `groups` (tokens `--series-lithium` … `--series-unbekannt`, gas: its subtypes' colours).

### Analyses one below the other (`AnalysisPanel.jsx`)

On every page each analysis as a card of its own that starts with a clear head – accent bar, tinted band, icon (`icon` of the analysis), title, what it
shows, its switches on the right (`tools`). Timelines, registrations, the registration delay, PV-Speicher and the table
per region all use it.

### Abstand zwischen Inbetriebnahmen und Registierung (`RegistrationDelayAnalysis.jsx`, kind `registration-delay`)

How long after going into operation units were registered, per year of commissioning since the register started
(31.01.2019), as shares stacked to 100 %: before going into operation, within a month (the deadline of § 5 MaStRV),
1–3 months, 3–12 months, more than a year. One technology at a time like the registrations; the summary names the last
complete year (share in time, median days). Data: `/zubau/registrierungsverzug` from `mrt.registrierungsverzug`
(`aggregate_registrierungsverzug.sql`). The latest years still gain late registrations.

### Überblick (`overview/`, page `ueberblick`)

One technology of the scope for a period, like a report – the page most visitors need. The technology is chosen in the
band on top (`SelectionBar` without filters, the URL's `technologie`), the period below it: a year, the running one by
default (`?jahr=`), and a month of it or the whole year (`?monat=`). The page is all its own (`OverviewView.jsx`; the
numbers in `model.js`, `pageModel`, the blocks in `blocks.jsx`, the same on the page and in the PDF). Everything comes
from the monthly series of the Zubau of the parts (`/zubau/zeitverlauf`, `mrt.zubau_zeitverlauf_regions`: Zubau and
Bestand, in amount and units, per month and year) – so any year or month works – and the Bestand of the area and its
peers at the period's end (`/zubau/bestand`). The series count by commissioning and final decommissioning date, a few
per mille more than the map, which counts by today's status (a remark says so).

- **Tiles:** the Bestand at the period's end (Leistung netto; the batteries their capacity, `overview.measure`, and power,
  `overview.also`) with its share of the area above and its rank among its peers, the units with their average size,
  the Zubau of the period with the growth of the Bestand it made (net of what was decommissioned), against the same
  period a year before (the running year by its complete months, the running month not at all), what is planned (the
  running period only, `/zubau/geplant`). All in one row.
- **Arten** (`overview.parts`, each with its `series`, less another where it has one: `minus`): Solar Gebäude,
  Balkonkraftwerke (`solar_balkon_netto`, the only place they are apart; hatched – `hatch` in the config,
  `hatchOf` in `lib/colorScale.js`, a pattern in `StackedChart` – as a lower bound) and Freifläche, Wind an Land and auf See, the
  batteries' Heim-, Gewerbe- and Großspeicher – side by side, each a column: its units and its measure, their shares as
  slim bars, their Zubau in the period relative to their Bestand at its start.
- **Zubau:** per year, the 15 up to the year chosen, or per month of the year with the month chosen and the others
  faint; the running period lighter.
- **Germany:** beside it the national targets for 2030 in Bruttoleistung (`overview.targets`: target → its series,
  `config/targets.js`) at the period's end, with the earlier goal as a mark and the pace of the last full year then.
- **PDF report** ("Bericht als PDF"): the page rendered once more off screen at the width of a page (`OverviewReport`):
  a title with the area's outline, the period and the Datenstand, the blocks, the remarks; drawn by
  html2canvas in a desktop-wide window (the same from a phone), cut between the blocks onto A4 pages (`report.js`: a
  block never cut, one a little too tall shrinks to fit), the source, the page's address and the page number in text
  at the foot of every page.

Netto throughout, no switch; only the targets are brutto, as the law counts. Remarks: how the Bestand is counted, the
planned units, the Balkonkraftwerke (a lower bound, see Datenqualität), the targets. Every section has its downloads.

### Registrierungen im MaStR (`RegistrationsAnalysis.jsx`, kind `registrations`)

Units registered per year or month (`Registrierungsdatum`) since the first registration (2019, when the register
started), in the scope (Deutschland, Land or Kreis, `?region=`): one technology at a time (a switch; Speicher, Gas) or, with `registrations.stacked`, stacked
like the Ausbau with the legend to hide one (Erzeuger: Solar Gebäude and Solar Freifläche alone at first, `hidden` on
the others; the Abstand keeps solar as one, `delay`): `/zubau/registrierungen?technology=…` (only the card's
technologies: a URL of its own per set of series, never an older cached answer without a new one) from
`mrt.registrierungen` (`aggregate_registrierungen.sql`: per month and, with `month` null, per year; `units` registered in
the period, `total` all up to its end; `?yearly=true` only the years), every unit the register lists whatever its
status. The same time controls as the Ausbau im Zeitverlauf (below): aggregiert (all registered so far), Jährlich or
Monatlich, the span. Each dashboard lists its technologies in `registrations.series` (Erzeuger: Solar Gebäude and
Freifläche, Wind an Land and auf See, Wasserkraft; Speicher: Batterie, Pumpspeicher; Gas: Gaserzeuger, Gasspeicher). Counts from 10,000 on read in thousands
on the axis (`StackedChart`, unit `Anzahl`).

### Ausrichtung nach Neigungswinkel (`OrientationTiltAnalysis.jsx`, kind `orientation-tilt`)

The rose of the orientations once per tilt class of the modules, five small ones side by side as wide as the page
(`RoseSvg` of `OrientationRose.jsx`, compact: the shares only, power and units in the tooltips), in the scope and the
selection like the Ausrichtung card. The register knows classes, not degrees (`HauptausrichtungNeigungswinkel`): 0–20°
(with the newer "unter 5°"), 21–40°, 41–60°, 61–89°, 90°. Each rose shows the shares within its class, all on one colour
scale; tracked units and those without a tilt (mostly Balkonkraftwerke) are named in the note. Data:
`/solar/orientation-tilt?region=…` → `mrt.solar_orientation_tilt` (one row per tilt, orientation, Anlagenart and region
that occurs).

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
shaded against each other on the dashboard's ramp, like the rose: an area's largest category is its darkest. Sorted by name at
first, so the order stays when the values change; sortable by every column, searchable by name or key, 50 rows at a time; the CSV holds every row found, in the chosen values plus
both totals.

The controls look like what they choose: the analysis (Ausrichtung / Anlagengröße) as tabs in the header, the rows as
the labelled dropdown "Gebiete", the cells in two steps – "Werte" (Leistung MW, for batteries Kapazität MWh, or Anzahl)
and "Darstellung" (Wert, or Anteil % of the area's total) – search and CSV as tools on the right.

On the page Regionen im Vergleich, for the technology chosen there – or the first one with a table (Speicher:
Batteriespeicher, with the size classes by capacity, `/battery/size-distribution/regions`).

Data: `{path of the card}/regions?level=…&within=…` (e.g. `/solar/orientation/regions?level=gemeinde&within=09`),
`{ columns: [{ key, label, hint }], rows: [{ region, units: [...], power: [...] }] }` with the values in the order of
the columns. The names come from the boundaries of the level, like on the map. The views are indexed by
(level, region, column) with byte-ordered keys, so a level is read presorted: all 10 956 Gemeinden take ~0.6 s, the
Kreise of a Land ~0.1 s.

### Technology-specific analyses (`analyses` on a technology)

Appended to the dashboard's `analyses` of their page while that technology is active; Solar adds "Ausrichtung",
"Ausrichtung nach Neigungswinkel" and "Solaranlagen mit Batteriespeicher" (page Anlagen), the wide panels in the order
of the config; batteries "Verteilung nach Speichergröße" and "Batterietechnologie und Kopplung", the gas producers and
storages their size classes and "Gastechnologie" or "Gasspeicherart". Two cards stand side by side, one takes the full
width. The Anlagen page offers the technologies with cards of their own there (also the gas sites, though the map shows
them as sites), and the choice only when there is one: a single technology without filters (Speicher) gets no bar.

### Resolutions (`GRANULARITIES`)

| id | Boundaries | Stats |
| --- | --- | --- |
| `bundesland` | `public/states_boundaries.topojson` (16 Länder, key `ags` 2-digit) | `apiLevel: 'bundesland'` |
| `landkreis` | `public/landkreise_boundaries.topojson` (400 Kreise, key `ags` 5-digit) | `apiLevel: 'landkreis'` |
| `gemeinde` | `public/gemeinden_boundaries.topojson` (10 956 Gemeinden, key `ags` 8-digit) | `apiLevel: 'gemeinde'` |
| `plz2`, `plz3`, `plz5` | `public/plz*_boundaries.topojson` | `apiLevel: 'plz…'` (Solar only) |
| `heatmap` | – (drawn in the browser) | points from `heatmapPath` (Solar, Wind, Batterie) |

A technology can restrict the resolutions it has data for (`granularities: [...]`, checked by `isAvailable`); Wind and
Batterie have the three region levels and the heatmap, Wasserkraft the region levels only. Länder, Kreise and Gemeinden also contain the sea (`ags: 'offshore'`), shown
only for technologies with `offshore` (Wind, while Auf See is chosen) – the map then also zooms out to include it
(`GERMANY_SEA_BOUNDS`).

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
tooltip. The technology brings its own `metrics` (ranking, the Kennzahl; plants only `absolut`) and `kpis`,
computed from the plants per Land/Kreis: `plants` in operation, `planned`, and the sum of every other KPI field. Plants
abroad (Austria, Luxembourg, the Netherlands) are on the map but not in the KPIs. `note` on a technology is a line below
the map. The Analysen section only shows when it has something (Gas: nothing yet).

### Europe, the sea and the place names (`ChoroplethMap.jsx`, `PlaceLabels.jsx`)

- **Europe around Germany**: `public/basemap_europe.topojson` (`scripts/geo/build_basemap.py`, Natural Earth): the land
  plain grey on the blue of the sea, white borders between the other countries, below everything (pane `basemap`). The
  map can't be moved beyond it (`EUROPE_BOUNDS`); zooming out stops where Europe still fills the frame. Germany's own
  borders come from the region layers, which lie on top.
- **Germany's outline**: its border and coast as a thin dark line over the areas (pane `germany`, below the focus mask),
  so the lightest areas stay apart from the land around them: the edges of the Länder that no other Land shares, the
  sea left out (`useOutline`). The small maps of the start page draw the same line (`linesToPath`).
- **The German sea** (offshore wind): hatched in its colour (`hatchOf`, a canvas pattern, so exports keep it), no
  border along the coast, a dashed line where it ends out at sea (the edges it shares with no other area of the states
  topology: `useOpenEdge`). The choropleth keeps the area invisible, for tooltip, hover and click.
- **Place names** (`PlaceLabels.jsx`, `public/places.json` from `scripts/geo/build_places.py`, BKG): Gemeinden at their
  main settlement, in three fixed layers, one per view – not more and more the further one zooms in:
  - Germany: the cities from 500 000 inhabitants (and the names of the countries and seas around),
  - a Land: its 8 largest towns that fit side by side when the map shows the whole Land (Landeshauptstadt counted
    half again as much); Berlin, Hamburg and Bremen name just their cities,
  - a Kreis: its 4 largest towns, chosen the same way.

  The names of a Land or Kreis are chosen at the zoom that fits it (`getBoundsZoom`), so zooming in or out moves them
  but adds none. Each name sits at the first free spot around its dot (`lib/labelPlacement.js`, a grid index of the
  boxes), never under the legend, the zoom buttons or the name of the area.
- **The area in view** is named in the top left corner (`map-scope` in `MapView.jsx`): "Bundesland" above a Land, its
  Land above a Kreis.

### Ausbau im Zeitverlauf (`timeline` on an analysis)

An analysis with `timeline` is drawn full-width above the other cards (`TimelineAnalysis.jsx`), in the scope:
Deutschland, a Land or a Kreis. Data: `/zubau/zeitverlauf?region=…&technology=…` from `mrt.zubau_zeitverlauf_regions`
(`aggregate_zubau_zeitverlauf_regions.sql`; the Registrierungen and the Abstand likewise from `…_regions`), one row per
region, series and month plus one per year (`month` null), with `added` (Zubau) and `installed` (Bestand at the period's end).
Views: Zubau (what went into operation per period, bars) or Bestand (in operation at its end, bars or a curve of stacked
areas – switched on, always bars first), per year (from–to, or every year since `since` with one click) or per month
(the last 12 months, a year or all months since `since`), or as Jahresvergleich: Jan … Dez along the bottom and a
column per year, up to six years (`buildComparison`, `YearComparison.jsx` on `GroupedBarChart`; the Zubau of the series
shown, added up – choosing it switches aggregiert off, aggregiert on goes back to Monatlich). The controls and the
periods are shared with the Registrierungen: `TimeControls.jsx` and `timeView.js` (`useTimeView`, `indexRows`,
`buildPeriods`). Years and months
are chosen in dropdowns of their own (`components/ui/ListSelect.jsx`: the list floats above the page, scrolls, opens
upwards where there is more room), not the browser's `<select>`, whose list came out cut off. The Registrierungen
start with the dashboard's first technology, whatever the map shows. Series are stacked in config
order, the first at the bottom; a click on the legend hides one. Bars carry their total where every one fits. A curve's
axis starts near its lowest point (`curveFloor`: 35 → 40 reads from 30) when the curve stays high up; series that then
lie wholly below the axis are named under the chart, which also switches the axis back to 0. The chart itself (`components/charts/StackedChart.jsx`) is plain SVG, no chart library. On the Zubau page the
timeline has its own Netto/Brutto switch for solar (`leistungOption`, `onLeistung`).

- Erzeuger: Solar Gebäude and Solar Freifläche (`solar_gebaeude`, `solar_freiflaeche`; two yellows, `--series-solar`
  and `--series-solar-freiflaeche`), Wind an Land, Wind auf See and Wasserkraft (`hidden`: off at first) in MW
  (`Bruttoleistung`; solar as `Nettonennleistung`, series `…_netto`, while the Leistung is Netto, the default). The start
  page shows solar as one (`solar`, `solar_netto`) and no Wasserkraft.
- Speicher: battery capacity in MWh (`NutzbareSpeicherkapazitaet` of the Speicheranlage) or, switched in the card's
  head (`timeline.measures`), their power in MW (`Bruttoleistung`, series `source: …speicher_leistung`), by size class
  and with the plausibility check of
  battery-charts.de.

**Geplante (genehmigte) Anlagen** (Erzeuger, between the Registrierungen and the Abstand) is the same chart for units
in planning (`EinheitBetriebsstatus` 31) by their planned commissioning date (`GeplantesInbetriebnahmedatum`):
`/zubau/geplant?region=…&technology=…` from `mrt.geplant_zeitverlauf_regions`. `timeline.planned` turns the time axis
forward (`now`, `thisMonth()` in `timeView.js`): this year ("ab Oktober") and the next five at first, "Nächste 12
Monate", the Jahresvergleich from this year on, nothing marked as running; aggregiert adds up all planned to the
period's end.
Wind (an Land, auf See) alone at first – nearly every planned turbine has its permit (`GenMastrNummer`) in the
register; solar and Wasserkraft off (`hidden`). Only dates from the current month on (that of the nightly refresh) –
a date that has passed means planned but never reported in operation, mostly small solar units – and none after 2040
(`aggregate_geplant_zeitverlauf_regions.sql`).

### The map page as one workspace (`MapView.jsx`, `MapToolbar.jsx`, `MapRail.jsx`)

The map, its settings and what it shows are one card, so they read as one tool: the title and export on top, how the
map shows the technology chosen above the card in a band below it (Kennzahl, Bezug, resolution or smoothing, in a
row, chosen in green), the map, and beside it, as high as the map (`--map-height`), the rail with tabs: the Rangliste and the technology's
analyses of one area (`scopeAnalysesOf`). Clicking an area that leads no deeper picks it: the rail switches to its
analysis next to the map. Full screen takes the whole workspace. Below 1200 px the rail goes under the map. The notes
of `config.todos` show only in `npm run dev`.

### Key figures with bars (`components/ui/FigureBlock.jsx`) and the targets (`config/targets.js`)

The size classes (`SizeDistribution.jsx` → `components/charts/GroupedBarChart.jsx`) show absolute values on two
axes: the power (batteries: the capacity) on the left, the number of units on the right, both in steps that share
their grid lines.

`FigureBlock` holds rows of `FigureRow`: a name, a value and a bar of its share of a named whole ("15,4 %"), under a
head with icon, title, a chip with the gist (`good`/`fair`/`poor`/`neutral`) and an info. Used for the expansion
targets – the national ones in `config/targets.js` (EEG 2023 § 4, WindSeeG § 1, in Bruttoleistung) – on the start page
(`TargetsOverview.jsx`: Germany against the 2030 targets and last year's pace) and on the Landkreis/Gemeinde page
(`KommuneTargets.jsx`: the area's solar against its Land or Kreis, how far Germany is with the targets for 2030 and 2040
and what the area contributes to them, its Zubau beside Germany's pace). Kreise and Gemeinden get no target of their
own: there is no official one, and a share of the national target (e.g. by population) would be made up. The batteries
of a Landkreis are compared instead (`KommuneStorage.jsx`).

### Landkreis/Gemeinde (`KommuneView.jsx`, `KommuneMap.jsx`, `config/kommune.js`)

For people who want to know their region: one Landkreis and its Gemeinden, for the dashboard's technology – solar on
the Erzeuger, batteries on the Speicher. Everything that differs between them is a profile in `config/kommune.js`
(figures, map metrics, split, timeline, analyses, the block of key figures, table columns); the page only reads it, so
another technology is another profile. Batteries: capacity, power and units per Gemeinde (`/battery/dashboard-stats`),
Zubau and Bestand per size class (`/battery/zubau`, `mrt.battery_zubau_regions`), size classes by the plant's capacity
(`/battery/size-distribution`) and, as there is no statutory target, a comparison with solar, the Land and Germany
(`KommuneStorage.jsx`). Without a Kreis the page is a
search over every Kreis and Gemeinde (names from the Kreis boundaries and `/regions/areas?level=gemeinde`); a Gemeinde
found opens its Kreis with it picked.

- **Map** (`KommuneMap.jsx`): the Gemeinden of the Kreis, shaded by a figure (Leistung, je Einwohner, je km², Zubau
  12 Monate, Anlagen) on a background map of tiles (`config/basemaps.js`: basemap.de grey or in colour from the BKG,
  Sentinel-2 satellite from EOX, or none), with an opacity slider, the Kreise around as dashed lines, a light veil
  outside the Kreis, names at each Gemeinde's label point (`lib/geometry.js`, placed without overlap like the place
  names) and a scale bar. The switch's pictures are tiles of basemap.de only: EOX is asked first when its view is chosen
  (Datenschutzerklärung).
- **Panel** left of it: the Kreis (or the picked Gemeinde) in figures, each a unit between thin lines – its name, its
  value (the densities with the Einwohner or the Fläche beside it), and one quiet line: its rank among the Kreise of
  the Land (Gemeinden of the Kreis), then its share of the Land (Kreis) or its multiple of the averages ("0,8× Ø Land ·
  0,7× Ø Bund", the averages themselves in the line's tooltip); Gebäude against Freifläche; the largest Gemeinden. The
  solar filters above the page sit in one row.
- Below: Zubau and Bestand per year of the area (`/solar/zubau?region=…`, `mrt.solar_zubau_regions`, kW for small
  Gemeinden), Ausrichtung and Anlagengröße (their endpoints take Gemeinde keys too) and every Gemeinde in a sortable
  table with CSV export. A click on a Gemeinde – map, list, table, scope bar – picks it (`?gemeinde=`); again: the Kreis.

### Netzanschlüsse (`NETZ`, `NetzView.jsx`)

The Netzanschlusspunkte der Stromerzeugung of the bulk export (`raw.grid_connection_points`, Stand of the export – the
nightly update doesn't touch them), each in the place of the units of its Lokation, of every kind
(`backend/app/etl/queries/aggregate_netzanschluesse.sql`). A point is in operation while a unit of its Lokation is; its
power is that of those units (Netto, else Brutto), split evenly where a Lokation has several points. The largest power
plants are published with their Land only (no Gemeinde, postcode or coordinates): they count for the Land, not for a
Kreis – the Land's row is more than its Kreise.

- **Karte**: one "technology", Stromerzeugung, with the Spannungsebenen as its filter (`?spannung=`, each with the
  transformation below it: Höchstspannung = Netzebene 1–2, …, Niederspannung = 7; `mrt.netz_region_stats`, a row per
  Spannungsebene like the solar Anlagenarten). Kennzahl Anzahl (points) or Leistung, absolut, je km², je 1.000
  Einwohner; KPIs: points, power, new in 12 months, in planning.
- **Spannungsebenen & Netzbetreiber** (`/netz/ebenen`, `/netz/netzbetreiber`, `mrt.netz_anschluesse`): a table of
  the Netzebenen 1–7 with points, power, power per point, in planning, and a bar of the power of all units at their
  points by technology (`NETZ_TECHNOLOGIEN`; a Lokation with solar and a battery counts for both); the 15 largest grid
  operators of the Verteilnetz or the Übertragungsnetz (market role Übertragungsnetzbetreiber) by power or number, the
  rest in one row, both grids in the CSV. Deutschland includes the pump and hydro power plants in Luxemburg and Österreich on the
  German grid, which the map can't show.

## Start page (`pages/HomePage.jsx`, `features/home/`)

Beside the title, live previews in tabs (`HeroPreviews.jsx`): Solar and Wind per Land on the map of Germany (a click
on a Land opens its map), the batteries added per year by size class (`/battery/zubau`), the orientation of the solar
modules (the rose of the page Anlagen, `RoseSvg`; its styles in `features/dashboard/rose.css`). They turn every 8 s until
someone picks one – not while the pointer or the keyboard rests on them, never with reduced motion; each leads to its
page and has its downloads.

After the hero: the register in five large numbers (`RegisterFigures.jsx`: solar, wind, batteries, gas storages,
Netzanschlusspunkte, live from the dashboards' endpoints), one chapter per dashboard with a live chart of its data
(`Chapters.jsx`: the Zubau of both timelines per year, the gas storages as circles on a small SVG map, `lib/svgMap.js`,
the power connected per Spannungsebene by technology), then where the numbers come from. What it requests is in
`homeData.js`.

## Analytics (`components/layout/AppLayout.jsx`, `lib/usage.js`)

- **Vercel Web Analytics** (`<Analytics />`): a page view per path, with its route (`routeOf`: the Land and Kreis of
  a dashboard as `[land]`, `[kreis]`, so the panel "Routes" adds up e.g. every Kreis map). A new choice in the query
  (technology, filters) is no page view. Cookieless; visitors are a daily hash, no IP addresses.
- **Vercel Speed Insights** (`<SpeedInsights />`): loading times of real visitors per route.
- **Custom events** (`trackEvent`): `Kartenexport` (format, map), `Tabellenexport` (analysis, level), `Grafikexport`
  (chart), `Technologie` (dashboard, technology), `Filter` (parameter, choice), `Kartenansicht` (Kennzahl or Ebene). They need the Pro plan
  and are only sent with `VITE_ANALYTICS_EVENTS=true` (Vercel env); the Datenschutzerklärung mentions them only then.
  At most 2 properties each (Pro).

In development both only log to the console. Enabling them in the Vercel dashboard, the IP addresses (Firewall →
Traffic) and the API's access log: `DEPLOY.md` §13.

## Search engines (`scripts/prerender.mjs`, `config/seo.js`)

The app renders in the browser; search engines, link previews and AI crawlers read the HTML as it arrives. So after
`vite build` the script writes a page of its own for what should be found – its title, description, canonical address,
robots tag and its content as text with the numbers of the API (styles: `.prerender` in `index.css`), which the app
replaces as soon as it runs:

- the start page, every page of the dashboards, the map of every Land (`/erzeuger/by`, `/speicher/by`), the
  Landkreis/Gemeinde page of every Land and of every Kreis (`/erzeuger/kommune/sn/14524`: Photovoltaik with figures and
  all Gemeinden; `/speicher/kommune/…`: batteries), info and legal pages: about 880, a little over 7 MB
- `dist/<path>.html`, served at `/<path>` (`cleanUrls` in `vercel.json`); every other address gets the app's shell
  `dist/spa.html` (the rewrite), the old `/maerkte/*` a redirect to the start page
- `dist/sitemap.xml` with every page but the placeholders (lastmod: the Datenstand); `public/robots.txt` points to it
- Titles, descriptions and texts come from the app's config (`scripts/prerender-modules.js`, bundled by Vite for Node);
  the Kreis pages are titled by their place, as people search ("Landkreis Zwickau: Photovoltaik – …",
  `kommuneTitle`), the same title the app sets (`useDocumentTitle`) – else search engines take the app's
- The numbers come from the API (`VITE_API_URL`) at build time: they are as fresh as the last deploy of the frontend.
  Without the API the pages keep their texts without numbers; the build doesn't fail on it.
- In the app: `<link rel="canonical">` follows every route (`AppLayout.jsx`: path without query, lower case, www),
  `useRobots` sets `index, nofollow` (Impressum) and `noindex` (404, Datenqualität while it is being built)
- The Kreise and Länder of the Landkreis/Gemeinde finder are links, so crawlers find every Kreis also in the app

## Datenstand

Every "Datenstand" on the site (dashboard header, map footer, site footer, home page, Info page, PDF export) comes from
`useDatenstand()` in `src/lib/data.js`: `GET /meta/datenstand`, which serves the day noted by the last complete nightly
update (`backend/app/etl/update.py`, table `meta.update_runs`). Until one is noted, or while the API is unreachable, it
falls back to `SITE.dataStand` in `src/config/site.js`.

## Continuous map (heatmap)

Räumliche Auflösung → Kontinuierlich: the power (Speicher: power or capacity) as a density surface, drawn in the browser
for every view (`HeatmapLayer.jsx`, the maths in `src/lib/heatmap.js`). The API sends points (`GET /solar/heatmap`,
`/wind/heatmap`, `/battery/heatmap?measure=capacity`; columns `lon`, `lat`, `sigma`, `value`, from
`mrt.heatmap_points`):

- **site:** units with coordinates (the register publishes them above 30 kW: 61 % of the solar power, all wind turbines
  but the smallest, the large batteries), summed per cell of about 1 km at their power-weighted centre, `sigma` 0.35 km.
  A coordinate far from its unit's postcode counts at the postcode instead (typos, swapped digits).
- **area:** the units without coordinates (roofs, home batteries) per postcode (PLZ 5) at its centre, `sigma` from its
  area (0.35 · √km², 0.4–8 km): spread over the postcode.

Each point spreads its value with a Gaussian of its own `sigma` plus a smoothing in pixels (Glättung: fein 4 / mittel 8 /
grob 16 px, `?glaettung=`; the grid's cells grow with it). Points narrower than half a cell (at the zoom of all Germany:
almost all) go into the grid directly, and the grid is blurred once; the others get a kernel each. The sum per cell,
divided by the cell's area on the ground, is a density (kW/km², kWh/km²). The colours run on a logarithmic scale over
the view: from where its thinnest 2 % of the power lie to the 99.5th percentile of the cells, one to three decades;
below, they fade out. The legend shows the scale, the smoothing in km and the value under the pointer.

Only the absolute Kennzahlen have a `heat` entry (`config/dashboards.js`): per km² and per inhabitant aren't offered
there, the Bezug reads „Dichte“.

The Kennzahl of the map is chosen in two rows, the same for every dashboard (`MapToolbar.jsx`): Kennzahl – Leistung,
Kapazität or Anzahl (`QUANTITIES`; Anzahl: the Netzanschlusspunkte) – then Bezug – Absolut, je km², je Einwohner
(`BASES`). Each metric names its `quantity` and
`basis`; a row with a single choice still shows (Erzeuger: Leistung; plants: Absolut), and a new Kennzahl keeps the
Bezug where it has one. The Rangliste beside it lists the Landkreise. The technology's filters (Anlagenart, Leistung, Lage) apply.

## Map export

PNG/PDF (`exportMap.js`) contain the map as it is on screen, also after moving and zooming: the layers (canvases, the
SVG of the focus mask, the heatmap's canvas) are copied first, each at its position on screen and in the order of its
pane; html2canvas only adds what lies on top (place names, legend, chips), with the animations switched off. html2canvas
alone misplaced Leaflet's layers once the map had moved (exports without shading, an offset mask). An SVG layer loses
its style before it becomes an image: Leaflet places it with a CSS transform, which would move its content twice.

The map's CSV holds its areas or plants with every value; on the continuous map, the points it spreads (position, kW
or kWh, the width of each point's kernel).

## Exports of every chart: CSV, JSON, PNG, PDF

Each chart, the Rangliste, the tables and the Kreis map have a "Download" button with the download pictogram at the
right of the chart's foot (`components/ui/ChartExport.jsx`, `ChartFoot` beside its note or legend); it opens a menu
in two groups, Rohdaten (CSV, JSON) and Bilder (PNG, PDF) (`ExportMenu.jsx`; the map card the same in its head). The data files hold what the
chart shows, in its current settings (Zubau or Bestand, years or months, the series shown, the scope and the
selection, which also name the file): CSV with numbers unformatted with a decimal point, units in the column names
(UTF-8 with a byte order mark for Excel), JSON the same rows as a list of objects (`lib/files.js`). PNG and PDF show the
card or figure the chart lies in, without the export links (`lib/exportChart.js`, html2canvas; the PDF an A4 page with
the card's title and the source, landscape when the card is wide); a chart in the map's rail its panel, a block can
mark itself as what is shown (`data-export`), a card can name a part of it (`target`: the Kreis map its map frame). A
Leaflet map goes through the map's own capture (`exportMap.js`: its layers and background tiles copied first, html2canvas
misplaces them). The map card has the same four. html2canvas reads no `color-mix()`: the CSS keeps to plain colours.
Two more of its quirks are handled in `renderCanvas` and `prepareCopy`: it measures the baseline of a font with a 1×1
image beside a text on the page, which the site's `img { display: block }` put on a line of its own (every text came
out half a line too low) – a style puts it back inline while it renders; and without letter-spacing it draws a text
word by word and loses the room between them ("Baden -Württemberg") – its copy gets 0.01 px where there is none. The
images go into a PDF compressed (`'FAST'`), else jsPDF keeps every pixel (megabytes a page).
The Rangliste's file ranks all areas of the scope, not only the ten shown.
