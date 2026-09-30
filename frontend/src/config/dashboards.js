import { BatteryCharging, Droplets, Gauge, Leaf, Mountain, Package, Sun, TrendingUp, Trophy, Wind, Zap } from 'lucide-react';
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

// The resolutions a technology has data for (`granularities`, default: all) and that make sense for it.
const REGION_LEVELS = ['bundesland', 'landkreis', 'gemeinde'];
export const isAvailable = (granularity, technology) =>
  granularity.available !== false &&
  (granularity.kind !== 'heatmap' || Boolean(technology.heatmapPath)) &&
  (!technology.granularities || technology.granularities.includes(granularity.id));

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
      heatmapPath: '/plz5_heatmap_image',
      // Units and power per size class, for the "Verteilung nach Anlagengröße" (mrt.size_distribution)
      sizesPath: '/solar/size-distribution',
      // Multiple choice shown below the chip while the technology is active; no param in the URL = all selected.
      subtypes: {
        param: 'anlagenart',
        label: 'Anlagenart',
        options: [
          { id: 'gebaeude', label: 'Gebäude' },
          { id: 'freiflaeche', label: 'Freifläche' },
        ],
      },
      // Shown after the dashboard-wide analyses while the technology is active.
      analyses: [
        {
          id: 'ausrichtung',
          title: 'Ausrichtung',
          description: 'Hauptausrichtung der Module – Anteile je Himmelsrichtung, Ost-West und nachgeführt.',
          variant: 'radial',
          kind: 'orientation',
          path: '/solar/orientation', // mrt.solar_orientation
        },
      ],
    },
    {
      id: 'wind',
      label: 'Wind',
      icon: Wind,
      statsPath: '/wind/dashboard-stats',
      sizesPath: '/wind/size-distribution',
      granularities: REGION_LEVELS,
      // Offshore wind is shown as an area of its own in the sea (key "offshore" on every level)
      offshore: true,
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
  metrics: [
    { id: 'total_power', label: 'Absolut', legend: 'Installierte Leistung', unit: 'MW', digits: 1 },
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
    { id: 'growth', kind: 'placeholder', label: 'Zubau (12 Monate)', icon: TrendingUp },
  ],
  analyses: [
    {
      id: 'timeline',
      title: 'Zubau im Zeitverlauf',
      // Germany-wide chart across the full width (mrt.zubau_zeitverlauf). Stacked in this order, the first at the bottom.
      timeline: {
        path: '/zubau/zeitverlauf',
        unit: 'MW',
        quantity: 'Leistung',
        since: 2000,
        series: [
          { id: 'solar', label: 'Solar', color: 'var(--series-solar)' },
          { id: 'wind_an_land', label: 'Wind an Land', color: 'var(--series-wind-land)' },
          { id: 'wind_auf_see', label: 'Wind auf See', color: 'var(--series-wind-sea)' },
        ],
      },
    },
    // In the scope, for the active technology (its sizesPath); a placeholder for technologies without one
    {
      id: 'distribution',
      title: 'Verteilung nach Anlagengröße',
      description: 'Anteile an Leistung und Anlagen je Leistungsklasse.',
      variant: 'bars',
      kind: 'sizes',
    },
  ],
  todos: [
    'Backend: Bundesland-Spalte in die PLZ-Rollups aufnehmen, damit die Rangliste im Bundesland-Modus auch PLZ-Regionen filtern kann (Landkreise/Gemeinden filtern schon über den Gemeindeschlüssel).',
    'Solar-PLZ-Rollup (aggregate_pv_by_plz_power.sql) zählt alle Betriebsstatus mit, die Bundesland/Landkreis/Gemeinde-Rollups nur Einheiten in Betrieb – angleichen.',
    'Weitere Technologien: statsPath in src/config/dashboards.js setzen, sobald die Endpoints existieren.',
    'Solar-Anlagenart (Gebäude/Freifläche): Auswahl steht als ?anlagenart=… in der URL, wird aber noch nicht an den Endpoint übergeben (ArtDerSolaranlage 853/852).',
  ],
};

export const SPEICHER = {
  id: 'speicher',
  basePath: '/speicher',
  eyebrow: 'Stromspeicher',
  title: 'Speicher',
  description: 'Kapazität und Leistung von Batterie- und Pumpspeichern – vom Heimspeicher bis zum Großspeicher.',
  ramp: RAMPS.blue,
  defaultGranularity: 'bundesland',
  technologies: [
    { id: 'batterie', label: 'Batteriespeicher', icon: BatteryCharging, statsPath: '/battery/dashboard-stats', granularities: REGION_LEVELS },
    {
      id: 'pumpspeicher',
      label: 'Pumpspeicher',
      icon: Mountain,
      // Each plant as an icon at its location instead of shaded areas (mrt.pumpkraftwerke)
      plantsPath: '/pumped-storage/plants',
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
  // Power, like the Erzeuger. The capacity (kWh) is not part of the unit data, see todos.
  metrics: [
    { id: 'total_power', label: 'Absolut', legend: 'Speicherleistung', unit: 'MW', digits: 1 },
    { id: 'relative_area_power', label: 'je km²', legend: 'Leistung je Fläche', unit: 'kW/km²', digits: 1 },
    { id: 'relative_population_power', label: 'je Einw.', legend: 'Leistung je Einwohner', unit: 'kW/Einw.', digits: 2 },
  ],
  tooltipRows: [
    { key: 'total_units', label: 'Speicher', digits: 0 },
    { key: 'total_power', label: 'Leistung', unit: 'MW', digits: 1 },
    { key: 'relative_area_power', label: 'je Fläche', unit: 'kW/km²', digits: 1 },
    { key: 'relative_population_power', label: 'je Einwohner', unit: 'kW', digits: 2 },
  ],
  kpis: [
    { id: 'units', kind: 'sum', field: 'total_units', label: 'Speicher', icon: BatteryCharging },
    { id: 'power', kind: 'sum', field: 'total_power', format: 'power', label: 'Leistung', icon: Zap },
    { id: 'leader', kind: 'leader', field: 'total_power', label: 'Spitzenreiter', icon: Trophy },
    { id: 'growth', kind: 'placeholder', label: 'Zubau (12 Monate)', icon: TrendingUp },
  ],
  analyses: [
    {
      id: 'timeline',
      title: 'Zubau im Zeitverlauf',
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
        note:
          'Größenklassen wie battery-charts.de: Heimspeicher unter 30 kWh und 30 kW, Großspeicher ab 1 MWh oder 1 MW. ' +
          'Speicher mit unplausibler Kapazität (unter 6 Minuten oder über 12 Stunden Volllast) sind nicht enthalten.',
      },
    },
    { id: 'ratio', title: 'Speicher je PV-Leistung', description: 'Wie viel Speicherkapazität steht je kW Photovoltaik bereit?', variant: 'bars' },
  ],
  todos: [
    'Speicherkapazität (kWh) auf der Karte: raw.storage_plants (AnlagenStromSpeicher, NutzbareSpeicherkapazitaet über SpeMastrNummer) ist geladen und fließt schon in den Zubau im Zeitverlauf – noch in aggregate_bat_by_region_power.sql summieren und als Kennzahl ergänzen.',
    'Pumpspeicher und Sonstige: eigene Rollups analog aggregate_bat_by_region_power.sql (Technologie 1537 bzw. 525/526/3067).',
    'Achtung: aggregate_bat_by_bundesland.sql droppt und überschreibt mrt.solar_units_bundesland_agg (die alte Solar-View) – wird nicht mehr gebraucht.',
    'Größenklassen (Heim/Gewerbe/Groß) als Filter-Parameter im Karten-Endpoint vorsehen – mit den Grenzen aus aggregate_zubau.sql (wie battery-charts.de).',
  ],
};

export const NUMERIC_FIELDS = [
  'total_units',
  'pump_power',
  'lat',
  'lon',
  'total_power',
  'total_capacity',
  'relative_area_power',
  'relative_population_power',
  'relative_area_capacity',
  'relative_population_capacity',
];
