import { BatteryCharging, Droplets, Gauge, Leaf, Mountain, Package, Sun, TrendingUp, Trophy, Waves, Wind, Zap } from 'lucide-react';
import { RAMPS } from '../lib/colorScale';

// Spatial resolution of the shading. Independent of the *scope* (Deutschland / Bundesland / Landkreis),
// which lives in the URL path.
export const GRANULARITIES = [
  { id: 'bundesland', label: 'Bundesländer', topology: '/states_boundaries.topojson', apiLevel: 'Bundesland', featureKey: 'name', regionPrefix: '' },
  { id: 'landkreis', label: 'Landkreise', available: false, note: 'folgt' },
  { id: 'plz2', label: 'PLZ 2-stellig', topology: '/plz2_boundaries.topojson', apiLevel: 'plz2', featureKey: 'plz', regionPrefix: 'PLZ-Region ' },
  { id: 'plz3', label: 'PLZ 3-stellig', topology: '/plz3_boundaries.topojson', apiLevel: 'plz3', featureKey: 'plz', regionPrefix: 'PLZ-Region ' },
  { id: 'plz5', label: 'PLZ 5-stellig', topology: '/plz5_boundaries.topojson', apiLevel: 'plz5', featureKey: 'plz', regionPrefix: 'PLZ ' },
  { id: 'heatmap', label: 'Kontinuierlich (Heatmap)', kind: 'heatmap' },
];

export const STATES_TOPOLOGY = '/states_boundaries.topojson';

export const ERZEUGER = {
  id: 'erzeuger',
  basePath: '/erzeuger',
  eyebrow: 'Stromerzeugung',
  title: 'Erzeuger',
  description: 'Installierte Leistung von Stromerzeugungsanlagen – bundesweit, je Bundesland und kleinräumig nach Postleitzahl.',
  ramp: RAMPS.orange,
  defaultGranularity: 'bundesland',
  technologies: [
    { id: 'solar', label: 'Solar', icon: Sun, statsPath: '/solar/dashboard-stats', heatmapPath: '/plz5_heatmap_image' },
    { id: 'wind-an-land', label: 'Wind an Land', icon: Wind },
    { id: 'wind-auf-see', label: 'Wind auf See', icon: Waves },
    { id: 'biomasse', label: 'Biomasse', icon: Leaf },
    { id: 'wasserkraft', label: 'Wasserkraft', icon: Droplets },
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
    { id: 'leader', kind: 'leader', field: 'total_power', label: 'Spitzenreiter', scopedLabel: 'Anteil an Deutschland', icon: Trophy },
    { id: 'growth', kind: 'placeholder', label: 'Zubau (12 Monate)', icon: TrendingUp },
  ],
  analyses: [
    { id: 'timeline', title: 'Zubau im Zeitverlauf', description: 'Monatlicher Zubau und kumulierte Leistung seit 2000.', variant: 'line' },
    { id: 'distribution', title: 'Verteilung nach Anlagengröße', description: 'Balkon-PV bis Freiflächenanlage – Anteile nach Leistungsklasse.', variant: 'bars' },
  ],
  todos: [
    'Backend: mrt.solar_rollup_stats und mrt.solar_units_bundesland_agg bauen – sonst liefert /solar/dashboard-stats einen 500er.',
    'Backend: Bundesland-Spalte in die PLZ-Rollups aufnehmen, damit Rangliste und Karte im Bundesland-Modus filtern können.',
    'Landkreise: Kreisgrenzen (BKG VG250) als TopoJSON + Aggregation über die ersten 5 Stellen des Gemeindeschlüssels.',
    'Weitere Technologien: statsPath in src/config/dashboards.js setzen, sobald die Endpoints existieren.',
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
    { id: 'batterie', label: 'Batteriespeicher', icon: BatteryCharging },
    { id: 'pumpspeicher', label: 'Pumpspeicher', icon: Mountain },
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
  metrics: [
    { id: 'total_capacity', label: 'Kapazität', legend: 'Speicherkapazität', unit: 'MWh', digits: 1 },
    { id: 'total_power', label: 'Leistung', legend: 'Speicherleistung', unit: 'MW', digits: 1 },
    { id: 'relative_population_capacity', label: 'je Einw.', legend: 'Kapazität je Einwohner', unit: 'kWh/Einw.', digits: 2 },
  ],
  tooltipRows: [
    { key: 'total_units', label: 'Speicher', digits: 0 },
    { key: 'total_capacity', label: 'Kapazität', unit: 'MWh', digits: 1 },
    { key: 'total_power', label: 'Leistung', unit: 'MW', digits: 1 },
    { key: 'relative_population_capacity', label: 'je Einwohner', unit: 'kWh', digits: 2 },
  ],
  kpis: [
    { id: 'units', kind: 'sum', field: 'total_units', label: 'Speicher', icon: BatteryCharging },
    { id: 'capacity', kind: 'sum', field: 'total_capacity', label: 'Kapazität', unit: 'MWh', icon: Gauge },
    { id: 'power', kind: 'sum', field: 'total_power', format: 'power', label: 'Leistung', icon: Zap },
    { id: 'growth', kind: 'placeholder', label: 'Zubau (12 Monate)', icon: TrendingUp },
  ],
  analyses: [
    { id: 'timeline', title: 'Zubau im Zeitverlauf', description: 'Kapazitätszubau je Monat, getrennt nach Größenklasse.', variant: 'line' },
    { id: 'ratio', title: 'Speicher je PV-Leistung', description: 'Wie viel Speicherkapazität steht je kW Photovoltaik bereit?', variant: 'bars' },
  ],
  todos: [
    'Backend: Endpoint für Speicher-Statistiken (Felder total_units, total_capacity, total_power, relative_population_capacity) und statsPath hier eintragen.',
    'Achtung: aggregate_bat_by_bundesland.sql droppt und überschreibt aktuell mrt.solar_units_bundesland_agg (die Solar-View!).',
    'Größenklassen (Heim/Gewerbe/Groß) als Filter-Parameter im Endpoint vorsehen, z. B. nach nutzbarer Speicherkapazität.',
  ],
};

export const NUMERIC_FIELDS = [
  'total_units',
  'total_power',
  'total_capacity',
  'relative_area_power',
  'relative_population_power',
  'relative_area_capacity',
  'relative_population_capacity',
];
