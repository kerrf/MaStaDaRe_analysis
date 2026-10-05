import {
  BatteryCharging,
  ChartColumnIncreasing,
  ClipboardList,
  Construction,
  Cylinder,
  Droplets,
  Flame,
  Gauge,
  Layers,
  Leaf,
  Mountain,
  Package,
  Sun,
  Timer,
  TrendingUp,
  Trophy,
  Wind,
  Zap,
} from 'lucide-react';
import { RAMPS } from '../lib/colorScale';

// Spatial resolution of the shading. Independent of the *scope* (Deutschland / Bundesland / Landkreis),
// which lives in the URL path.
// Länder, Kreise and Gemeinden are keyed by the Gemeindeschlüssel (2, 5 and 8 digits; "offshore" for the sea) and
// built from the same source by scripts/geo/build_boundaries.py. An entry without apiLevel shows its borders only.
export const GRANULARITIES = [
  { id: 'bundesland', label: 'Bundesländer', topology: '/states_boundaries.topojson', apiLevel: 'bundesland', featureKey: 'ags', labelKey: 'name' },
  { id: 'landkreis', label: 'Landkreise', topology: '/landkreise_boundaries.topojson', apiLevel: 'landkreis', featureKey: 'ags', labelKey: 'name' },
  { id: 'gemeinde', label: 'Gemeinden', topology: '/gemeinden_boundaries.topojson', apiLevel: 'gemeinde', featureKey: 'ags', labelKey: 'name' },
  { id: 'plz2', label: 'PLZ 2-stellig', topology: '/plz2_boundaries.topojson', apiLevel: 'plz2', featureKey: 'plz', regionPrefix: 'PLZ-Region ' },
  { id: 'plz3', label: 'PLZ 3-stellig', topology: '/plz3_boundaries.topojson', apiLevel: 'plz3', featureKey: 'plz', regionPrefix: 'PLZ-Region ' },
  { id: 'plz5', label: 'PLZ 5-stellig', topology: '/plz5_boundaries.topojson', apiLevel: 'plz5', featureKey: 'plz', regionPrefix: 'PLZ ' },
  { id: 'heatmap', label: 'Kontinuierlich (Heatmap)', kind: 'heatmap' },
];

export const STATES_TOPOLOGY = '/states_boundaries.topojson';

// Data comes either as stats per area (statsPath) or as a list of sites shown as icons (plantsPath).
export const hasData = (technology) => Boolean(technology.statsPath || technology.plantsPath);

// Id of an option's footnote below the map (e.g. the Leistung of solar), which its control and the map title point to
export const footnoteId = (option) => `fussnote-${option.param}`;

// The analyses of a technology that have a table per region (RegionTable): the endpoints of their cards, with /regions
export function regionTablesOf(technology) {
  const orientation = technology.analyses?.find((a) => a.kind === 'orientation');
  return [
    orientation && { id: 'ausrichtung', label: 'Ausrichtung', path: `${orientation.path}/regions` },
    technology.sizesPath && { id: 'groesse', label: 'Anlagengröße', path: `${technology.sizesPath}/regions` },
  ].filter(Boolean);
}

// The analyses of a technology that show one area (Deutschland, a Land, Kreis or Gemeinde): the orientation of the
// modules (solar) and the size classes, with the endpoint of each (?region=…)
export function scopeAnalysesOf(technology) {
  const orientation = technology.analyses?.find((a) => a.kind === 'orientation');
  return [
    orientation && { id: 'ausrichtung', label: 'Ausrichtung', path: orientation.path, what: 'Leistung nach Hauptausrichtung der Module' },
    technology.sizesPath && { id: 'groesse', label: 'Anlagengröße', path: technology.sizesPath, what: `${technology.label}: Leistung und Anlagen je Leistungsklasse` },
  ].filter(Boolean);
}

// The resolutions a technology has data for (`granularities`, default: all) and that make sense for it.
const REGION_LEVELS = ['bundesland', 'landkreis', 'gemeinde'];
export const isAvailable = (granularity, technology) =>
  granularity.available !== false &&
  (granularity.kind !== 'heatmap' || Boolean(technology.heatmapPath)) &&
  (!technology.granularities || technology.granularities.includes(granularity.id));

// Analyses on more than one dashboard. view: the page of the dashboard that shows them (config/views.js).

// Registrierungen im MaStR per year and Zeit bis zur Registrierung, Germany-wide, one technology at a time
// (mrt.registrierungen, mrt.registrierungsverzug). series: the technologies of the switch, as the API names them.
const registrations = (series) => [
  {
    id: 'registrierungen',
    title: 'Registrierungen im MaStR',
    kind: 'registrations',
    view: 'zubau',
    icon: ClipboardList,
    registrations: { path: '/zubau/registrierungen', series },
  },
  {
    id: 'registrierungsverzug',
    title: 'Zeit bis zur Registrierung',
    kind: 'registration-delay',
    view: 'zubau',
    icon: Timer,
    delay: { path: '/zubau/registrierungsverzug', series },
  },
];

// Solar units and batteries at the same Lokation, Germany-wide (mrt.pv_speicher): for solar and for the batteries
const PV_SPEICHER = {
  id: 'pv-speicher',
  title: 'Solaranlagen mit Batteriespeicher',
  kind: 'pv-speicher',
  view: 'anlagen',
  path: '/solar/pv-speicher',
  icon: BatteryCharging,
};

export const ERZEUGER = {
  id: 'erzeuger',
  basePath: '/erzeuger',
  eyebrow: 'Stromerzeugung',
  title: 'Erzeuger',
  description: 'Installierte Leistung von Stromerzeugungsanlagen – bundesweit, je Bundesland und kleinräumig nach Postleitzahl.',
  ramp: RAMPS.orange,
  defaultGranularity: 'bundesland',
  technologies: [
    {
      id: 'solar',
      label: 'Solar',
      icon: Sun,
      statsPath: '/solar/dashboard-stats',
      // The points of the continuous map (mrt.heatmap_points): plants at their coordinates, small ones per postcode
      heatmapPath: '/solar/heatmap',
      // Units and power per size class, for the "Verteilung nach Anlagengröße" (mrt.size_distribution)
      sizesPath: '/solar/size-distribution',
      // Multiple choice in the technology's filters while it is active; no param in the URL = all selected.
      // Gebäude: Gebäude-, sonstige und steckerfertige Anlagen and those without an Art; Freifläche: Freiflächenanlagen.
      // Passed to every solar request as ?anlagenart=… (the views have one row per Anlagenart, the API sums the chosen).
      subtypes: {
        param: 'anlagenart',
        label: 'Anlagenart',
        options: [
          { id: 'gebaeude', label: 'Gebäude' },
          { id: 'freiflaeche', label: 'Freifläche' },
        ],
      },
      // Which power the solar values show, passed as ?leistung=… (the first option is the default, like in the API).
      // The note is a footnote below the map, marked ¹ at the switch and in the map title.
      leistung: {
        param: 'leistung',
        label: 'Leistung',
        options: [
          { id: 'netto', label: 'Netto (AC)' },
          { id: 'brutto', label: 'Brutto (DC)' },
        ],
        note:
          'Jede Solaranlage besitzt im MaStR eine Bruttoleistung und Nettonennleistung. Die Bruttoleistung entspricht ' +
          'der Peakproduktion der Anlage, während die Nettonennleistung dem Minimum aus Bruttoleistung und Wechselrichterwirkleistung entspricht.',
      },
      // Shown after the dashboard-wide analyses of their page while the technology is active
      analyses: [
        {
          id: 'ausrichtung',
          title: 'Ausrichtung',
          description: 'Hauptausrichtung der Module – Anteile je Himmelsrichtung, Ost-West und nachgeführt.',
          variant: 'radial',
          kind: 'orientation',
          view: 'anlagen',
          path: '/solar/orientation', // mrt.solar_orientation
        },
        PV_SPEICHER,
      ],
    },
    {
      id: 'wind',
      label: 'Wind',
      icon: Wind,
      statsPath: '/wind/dashboard-stats',
      sizesPath: '/wind/size-distribution',
      heatmapPath: '/wind/heatmap',
      granularities: [...REGION_LEVELS, 'heatmap'],
      // An Land and auf See, like the Anlagenarten of solar: passed as ?lage=… (no param = both, the API sums them)
      subtypes: {
        param: 'lage',
        label: 'Lage',
        options: [
          { id: 'an_land', label: 'An Land' },
          { id: 'auf_see', label: 'Auf See' },
        ],
      },
      // Offshore wind is an area of its own in the sea (key "offshore" on every level), shown while this subtype is chosen
      offshore: 'auf_see',
    },
    { id: 'biomasse', label: 'Biomasse', icon: Leaf },
    {
      id: 'wasserkraft',
      label: 'Wasserkraft',
      icon: Droplets,
      statsPath: '/water/dashboard-stats',
      sizesPath: '/water/size-distribution',
      granularities: REGION_LEVELS,
    },
  ],
  // heat: what the continuous map shows of an absolute Kennzahl – its density, the measure of its points (default power),
  // and its label there if another
  metrics: [
    {
      id: 'total_power',
      label: 'Absolut',
      legend: 'Installierte Leistung',
      unit: 'MW',
      digits: 1,
      heat: { legend: 'Leistungsdichte', unit: 'kW/km²' },
    },
    { id: 'relative_area_power', label: 'je km²', legend: 'Leistung je Fläche', unit: 'kW/km²', digits: 1 },
    { id: 'relative_population_power', label: 'je Einw.', legend: 'Leistung je Einwohner', unit: 'kW/Einw.', digits: 2 },
  ],
  tooltipRows: [
    { key: 'total_units', label: 'Anlagen', digits: 0 },
    { key: 'total_power', label: 'Leistung', unit: 'MW', digits: 1 },
    { key: 'relative_area_power', label: 'je Fläche', unit: 'kW/km²', digits: 1 },
    { key: 'relative_population_power', label: 'je Einwohner', unit: 'kW', digits: 2 },
  ],
  kpis: [
    { id: 'units', kind: 'sum', field: 'total_units', label: 'Anlagen', icon: Zap },
    { id: 'power', kind: 'sum', field: 'total_power', format: 'power', label: 'Installierte Leistung', icon: Gauge },
    { id: 'leader', kind: 'leader', field: 'total_power', label: 'Spitzenreiter', icon: Trophy },
    // In operation since less than 12 months (added_12m_power of the region views)
    { id: 'growth', kind: 'sum', field: 'added_12m_power', format: 'power', label: 'Zubau (12 Monate)', icon: TrendingUp },
  ],
  analyses: [
    {
      id: 'timeline',
      title: 'Zubau im Zeitverlauf',
      icon: ChartColumnIncreasing,
      view: 'zubau',
      // Germany-wide chart across the full width (mrt.zubau_zeitverlauf). Stacked in this order, the first at the bottom.
      timeline: {
        path: '/zubau/zeitverlauf',
        unit: 'MW',
        quantity: 'Leistung',
        since: 2000,
        // A series with `netto` follows the solar Leistung: that series of the API while it is Netto (AC), the default
        series: [
          { id: 'solar', netto: 'solar_netto', label: 'Solar', color: 'var(--series-solar)' },
          { id: 'wind_an_land', label: 'Wind an Land', color: 'var(--series-wind-land)' },
          { id: 'wind_auf_see', label: 'Wind auf See', color: 'var(--series-wind-sea)' },
        ],
      },
    },
    ...registrations([
      { id: 'solar', label: 'Solar', color: 'var(--series-solar)' },
      { id: 'wind', label: 'Wind', color: 'var(--series-wind-land)' },
      { id: 'wasserkraft', label: 'Wasserkraft', color: 'var(--series-wasserkraft)' },
    ]),
    // In the scope, for the active technology (its sizesPath); a placeholder for technologies without one
    {
      id: 'distribution',
      title: 'Verteilung nach Anlagengröße',
      description: 'Leistung und Anzahl der Anlagen je Leistungsklasse.',
      variant: 'bars',
      kind: 'sizes',
      view: 'anlagen',
    },
  ],
  todos: [
    'Backend: Bundesland-Spalte in die PLZ-Rollups aufnehmen, damit die Rangliste im Bundesland-Modus auch PLZ-Regionen filtern kann (Landkreise/Gemeinden filtern schon über den Gemeindeschlüssel).',
    'Weitere Technologien: statsPath in src/config/dashboards.js setzen, sobald die Endpoints existieren.',
  ],
};

// The size classes of the battery timelines (aggregate_zubau.sql)
const BATTERY_NOTE =
  'Größenklassen wie battery-charts.de: Heimspeicher unter 30 kWh und 30 kW, Großspeicher ab 1 MWh oder 1 MW. ' +
  'Speicher mit unplausibler Kapazität (unter 6 Minuten oder über 12 Stunden Volllast) sind nicht enthalten.';

export const SPEICHER = {
  id: 'speicher',
  basePath: '/speicher',
  eyebrow: 'Stromspeicher',
  title: 'Speicher',
  description: 'Kapazität und Leistung von Batterie- und Pumpspeichern – vom Heimspeicher bis zum Großspeicher.',
  ramp: RAMPS.blue,
  defaultGranularity: 'bundesland',
  technologies: [
    {
      id: 'batterie',
      label: 'Batteriespeicher',
      icon: BatteryCharging,
      statsPath: '/battery/dashboard-stats',
      heatmapPath: '/battery/heatmap',
      granularities: [...REGION_LEVELS, 'heatmap'],
    },
    {
      id: 'pumpspeicher',
      label: 'Pumpspeicher',
      icon: Mountain,
      // Each plant as an icon at its location instead of shaded areas (mrt.pumpkraftwerke)
      plantsPath: '/pumped-storage/plants',
      site: {
        label: 'Kraftwerke',
        key: 'spe_mastr_nummer',
        icon: '<path d="m8 3 4 8 5-5 5 15H2L8 3z"/>',
        rows: [
          { key: 'total_capacity', label: 'Speicherkapazität', unit: 'MWh' },
          { key: 'total_power', label: 'Turbinenleistung', unit: 'MW' },
          { key: 'pump_power', label: 'Pumpleistung', unit: 'MW' },
          { key: 'total_units', label: 'Maschinen' },
        ],
      },
      metrics: [
        { id: 'total_capacity', label: 'Kapazität', legend: 'Speicherkapazität', unit: 'MWh', digits: 0 },
        { id: 'total_power', label: 'Leistung', legend: 'Turbinenleistung', unit: 'MW', digits: 0 },
      ],
      // Plants in operation in Germany. Capacities are not summed: plants sharing a reservoir report it each.
      kpis: [
        { id: 'plants', kind: 'sum', field: 'plants', label: 'Kraftwerke in Betrieb', icon: Mountain },
        { id: 'power', kind: 'sum', field: 'total_power', format: 'power', label: 'Turbinenleistung', icon: Zap },
        { id: 'pump', kind: 'sum', field: 'pump_power', format: 'power', label: 'Pumpleistung', icon: Gauge },
        { id: 'leader', kind: 'leader', field: 'total_power', label: 'Spitzenreiter', scopedLabel: 'Anteil an Deutschland', icon: Trophy },
      ],
    },
    { id: 'sonstige', label: 'Sonstige', icon: Package },
  ],
  segments: {
    label: 'Größenklasse',
    options: [
      { id: 'alle', label: 'Alle' },
      { id: 'heim', label: 'Heim' },
      { id: 'gewerbe', label: 'Gewerbe' },
      { id: 'gross', label: 'Groß' },
    ],
  },
  // Power, like the Erzeuger, and the usable capacity (only batteries with a plausible one, aggregate_bat_by_region_power.sql)
  metrics: [
    {
      id: 'total_power',
      label: 'Absolut',
      legend: 'Speicherleistung',
      unit: 'MW',
      digits: 1,
      heat: { label: 'Leistung', legend: 'Leistungsdichte', unit: 'kW/km²' },
    },
    { id: 'relative_area_power', label: 'je km²', legend: 'Leistung je Fläche', unit: 'kW/km²', digits: 1 },
    { id: 'relative_population_power', label: 'je Einw.', legend: 'Leistung je Einwohner', unit: 'kW/Einw.', digits: 2 },
    {
      id: 'total_capacity',
      label: 'Kapazität',
      legend: 'Speicherkapazität',
      unit: 'MWh',
      digits: 1,
      heat: { legend: 'Kapazitätsdichte', unit: 'kWh/km²', measure: 'capacity' },
    },
    { id: 'relative_population_capacity', label: 'kWh je Einw.', legend: 'Kapazität je Einwohner', unit: 'kWh/Einw.', digits: 2 },
  ],
  tooltipRows: [
    { key: 'total_units', label: 'Speicher', digits: 0 },
    { key: 'total_power', label: 'Leistung', unit: 'MW', digits: 1 },
    { key: 'total_capacity', label: 'Kapazität', unit: 'MWh', digits: 1 },
    { key: 'relative_area_power', label: 'je Fläche', unit: 'kW/km²', digits: 1 },
    { key: 'relative_population_power', label: 'je Einwohner', unit: 'kW', digits: 2 },
  ],
  kpis: [
    { id: 'units', kind: 'sum', field: 'total_units', label: 'Speicher', icon: BatteryCharging },
    { id: 'power', kind: 'sum', field: 'total_power', format: 'power', label: 'Leistung', icon: Zap },
    { id: 'leader', kind: 'leader', field: 'total_power', label: 'Spitzenreiter', icon: Trophy },
    // Usable capacity in operation since less than 12 months (added_12m_capacity of mrt.battery_region_stats)
    { id: 'growth', kind: 'sum', field: 'added_12m_capacity', format: 'capacity', label: 'Zubau (12 Monate)', icon: TrendingUp },
  ],
  analyses: [
    {
      id: 'timeline',
      title: 'Zubau im Zeitverlauf: Kapazität',
      icon: ChartColumnIncreasing,
      view: 'zubau',
      // Battery capacity by size class, like battery-charts.de (RWTH Aachen)
      timeline: {
        path: '/zubau/zeitverlauf',
        unit: 'MWh',
        quantity: 'Batteriekapazität',
        since: 2013,
        series: [
          { id: 'grossspeicher', label: 'Großspeicher', color: 'var(--series-grossspeicher)' },
          { id: 'gewerbespeicher', label: 'Gewerbespeicher', color: 'var(--series-gewerbespeicher)' },
          { id: 'heimspeicher', label: 'Heimspeicher', color: 'var(--series-heimspeicher)' },
        ],
        note: BATTERY_NOTE,
      },
    },
    {
      id: 'timeline-leistung',
      title: 'Zubau im Zeitverlauf: Leistung',
      icon: Zap,
      view: 'zubau',
      // The same batteries by their power (Bruttoleistung, as on the map)
      timeline: {
        path: '/zubau/zeitverlauf',
        unit: 'MW',
        quantity: 'Batterieleistung',
        since: 2013,
        series: [
          { id: 'grossspeicher_leistung', label: 'Großspeicher', color: 'var(--series-grossspeicher)' },
          { id: 'gewerbespeicher_leistung', label: 'Gewerbespeicher', color: 'var(--series-gewerbespeicher)' },
          { id: 'heimspeicher_leistung', label: 'Heimspeicher', color: 'var(--series-heimspeicher)' },
        ],
        note: BATTERY_NOTE,
      },
    },
    ...registrations([
      { id: 'batterie', label: 'Batteriespeicher', color: 'var(--series-gewerbespeicher)' },
      { id: 'pumpspeicher', label: 'Pumpspeicher', color: 'var(--series-grossspeicher)' },
    ]),
    // Batteries at solar units: how many solar units have one, and how much capacity per kW of solar
    PV_SPEICHER,
  ],
  todos: [
    'Pumpspeicher und Sonstige: eigene Rollups analog aggregate_bat_by_region_power.sql (Technologie 1537 bzw. 525/526/3067).',
    'Achtung: aggregate_bat_by_bundesland.sql droppt und überschreibt mrt.solar_units_bundesland_agg (die alte Solar-View) – wird nicht mehr gebraucht.',
    'Größenklassen (Heim/Gewerbe/Groß) als Filter-Parameter im Karten-Endpoint vorsehen – mit den Grenzen aus aggregate_zubau.sql (wie battery-charts.de).',
  ],
};

// Gas: producers and storages, few enough to show each at its location like the Pumpspeicher (mrt.gaserzeuger,
// mrt.gasspeicher). Their subtypes filter the sites in the browser and colour them.
export const GAS = {
  id: 'gas',
  basePath: '/gas',
  eyebrow: 'Gasinfrastruktur',
  title: 'Gas',
  description:
    'Gaserzeuger und Gasspeicher an ihren Standorten – von der Biomethananlage bis zum LNG-Terminal, vom Kavernen- bis zum Porenspeicher.',
  ramp: RAMPS.teal,
  defaultGranularity: 'bundesland',
  technologies: [
    {
      id: 'gaserzeuger',
      label: 'Gaserzeuger',
      icon: Flame,
      plantsPath: '/gas/erzeuger',
      site: {
        label: 'Anlagen',
        key: 'mastr_nummer',
        size: 16, // 330 sites
        icon: '<path d="M12 3q1 4 4 6.5t3 5.5a1 1 0 0 1-14 0 5 5 0 0 1 1-3 1 1 0 0 0 5 0c0-2-1.5-3-1.5-5q0-2 2.5-4"/>',
        rows: [{ key: 'total_power', label: 'Erzeugungsleistung', unit: 'MW' }],
        since: 'inbetriebnahme',
      },
      subtypes: {
        param: 'technik',
        label: 'Technologie',
        field: 'technologie',
        options: [
          { id: 'biomethan', label: 'Biomethan', color: 'var(--series-biomethan)' },
          { id: 'erdgas', label: 'Erdgasförderung', color: 'var(--series-erdgas)' },
          { id: 'lng', label: 'LNG', color: 'var(--series-lng)' },
          { id: 'wasserstoff', label: 'Power-to-Gas: Wasserstoff', color: 'var(--series-wasserstoff)' },
          { id: 'methan', label: 'Power-to-Gas: Methan', color: 'var(--series-methan)' },
        ],
      },
      metrics: [{ id: 'total_power', label: 'Leistung', legend: 'Erzeugungsleistung', unit: 'MW', digits: 1 }],
      // Einheiten in Germany; a unit's Erzeugungsleistung is the most gas it can feed in, in MW (kWh per hour)
      kpis: [
        { id: 'plants', kind: 'sum', field: 'plants', label: 'Anlagen in Betrieb', icon: Flame },
        { id: 'power', kind: 'sum', field: 'total_power', format: 'power', label: 'Erzeugungsleistung', icon: Gauge },
        { id: 'planned', kind: 'sum', field: 'planned', label: 'In Planung', icon: Construction },
        { id: 'leader', kind: 'leader', field: 'total_power', label: 'Spitzenreiter', icon: Trophy },
      ],
      note:
        'Speicher, deren Ausspeisung zusätzlich als „Förderung fossilen Erdgases“ registriert ist (Etzel, Epe, Staßfurt u. a.), ' +
        'zählen zu den Gasspeichern.',
    },
    {
      id: 'gasspeicher',
      label: 'Gasspeicher',
      icon: Cylinder,
      plantsPath: '/gas/speicher',
      site: {
        label: 'Speicher',
        key: 'mastr_nummer',
        icon: '<ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M3 5v14a9 3 0 0 0 18 0V5"/>',
        rows: [
          { key: 'total_capacity', label: 'Arbeitsgas', unit: 'GWh' },
          { key: 'volume', label: 'Arbeitsgasvolumen', unit: 'Mio. m³', digits: 0 },
          { key: 'total_power', label: 'Ausspeicherleistung', unit: 'MW' },
          { key: 'injection_power', label: 'Einspeicherleistung', unit: 'MW' },
        ],
      },
      subtypes: {
        param: 'speicherart',
        label: 'Speicherart',
        field: 'speicherart',
        options: [
          { id: 'kaverne', label: 'Kavernenspeicher', color: 'var(--series-kaverne)' },
          { id: 'pore', label: 'Porenspeicher', color: 'var(--series-pore)' },
          { id: 'aquifer', label: 'Aquiferspeicher', color: 'var(--series-aquifer)' },
        ],
      },
      metrics: [
        { id: 'total_capacity', label: 'Kapazität', legend: 'Arbeitsgas', unit: 'GWh', digits: 0 },
        { id: 'total_power', label: 'Ausspeicherung', legend: 'Ausspeicherleistung', unit: 'MW', digits: 0 },
      ],
      kpis: [
        { id: 'plants', kind: 'sum', field: 'plants', label: 'Speicher in Betrieb', icon: Cylinder },
        { id: 'capacity', kind: 'sum', field: 'total_capacity', format: 'amount', unit: 'GWh', label: 'Arbeitsgas', icon: Layers },
        { id: 'power', kind: 'sum', field: 'total_power', format: 'power', label: 'Ausspeicherleistung', icon: Gauge },
        { id: 'leader', kind: 'leader', field: 'total_capacity', label: 'Spitzenreiter', icon: Trophy },
      ],
      note:
        'Das MaStR nennt es „maximal nutzbares Arbeitsgasvolumen“, gibt es aber als Energie an (kWh). Das Volumen folgt über ' +
        'den durchschnittlichen Brennwert. Ein- und Ausspeicherleistung wie von den Betreibern gemeldet.',
    },
  ],
  metrics: [{ id: 'total_power', label: 'Leistung', legend: 'Leistung', unit: 'MW', digits: 0 }],
  tooltipRows: [],
  kpis: [],
  analyses: registrations([
    { id: 'gaserzeuger', label: 'Gaserzeuger', color: 'var(--topic-gas)' },
    { id: 'gasspeicher', label: 'Gasspeicher', color: 'var(--topic-gas-strong)' },
  ]),
};

export const NUMERIC_FIELDS = [
  'total_units',
  'added_12m_power',
  'added_12m_capacity',
  'pump_power',
  'injection_power',
  'volume',
  'lat',
  'lon',
  'total_power',
  'total_capacity',
  'relative_area_power',
  'relative_population_power',
  'relative_area_capacity',
  'relative_population_capacity',
];
