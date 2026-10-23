import {
  BatteryCharging,
  ChartColumnIncreasing,
  ClipboardList,
  Compass,
  Construction,
  Cylinder,
  Droplets,
  Factory,
  Flame,
  Gauge,
  Layers,
  Leaf,
  Mountain,
  Package,
  Sun,
  Thermometer,
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

// The analyses of a technology that have a table per region (RegionTable): the endpoints of their cards, with /regions.
// measures: what the cells can add up (default the power in MW; batteries also their capacity, from `regions` of the
// analysis); unitsLabel: what the number counts
export function regionTablesOf(technology) {
  const orientation = technology.analyses?.find((a) => a.kind === 'orientation');
  const sizes = technology.analyses?.find((a) => a.kind === 'sizes' && a.regions);
  // The size classes first: the default table (solar: before the Ausrichtung)
  return [
    technology.sizesPath && { id: 'groesse', label: 'Anlagengröße', path: `${technology.sizesPath}/regions` },
    orientation && { id: 'ausrichtung', label: 'Ausrichtung', path: `${orientation.path}/regions` },
    sizes && {
      id: 'groesse',
      label: sizes.regions.label,
      path: `${sizes.path}/regions`,
      measures: sizes.regions.measures,
      unitsLabel: sizes.unitsLabel,
    },
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

// A metric of the map is a quantity in a basis: Leistung, Wärme (KWK), Kapazität or Anzahl, absolut, je km² or je
// Einwohner (the continuous map: as a density). The toolbar chooses them in two boxes, Messgröße and Metrik
// (MapToolbar.jsx), the same for every technology, each with the quantities its metrics have; the URL keeps the metric's
// id (?kennzahl=…). Before them, for the technologies with `zeit`, the Kennzahl of the map in time: Bestand, Zubau,
// Stilllegungen, In Planung (features/dashboard/mapTime.js).
export const QUANTITIES = [
  { id: 'kapazitaet', label: 'Kapazität' },
  { id: 'leistung', label: 'Leistung' },
  { id: 'waerme', label: 'Wärme' },
  { id: 'anzahl', label: 'Anzahl' },
];
export const BASES = [
  { id: 'absolut', label: 'Absolut' },
  { id: 'flaeche', label: 'je km²' },
  { id: 'einwohner', label: 'je Einwohner' },
  { id: 'dichte', label: 'Dichte' },
];

// The resolutions a technology has data for (`granularities`, default: all) and that make sense for it.
const REGION_LEVELS = ['bundesland', 'landkreis', 'gemeinde'];
export const isAvailable = (granularity, technology) =>
  granularity.available !== false &&
  (granularity.kind !== 'heatmap' || Boolean(technology.heatmapPath)) &&
  (!technology.granularities || technology.granularities.includes(granularity.id));

// Analyses on more than one dashboard. view: the page of the dashboard that shows them (config/views.js).

// Registrierungen im MaStR per year or month, in the scope (mrt.registrierungen_regions). series: the technologies, as
// the API names them – one at a time (a switch), or with `stacked` stacked like the Ausbau, a click on the legend hiding
// one (`hidden`: off at first)
const registrationsOf = (series, { stacked = false, units, note } = {}) => ({
  id: 'registrierungen',
  title: 'Registrierungen im MaStR',
  kind: 'registrations',
  view: 'zubau',
  icon: ClipboardList,
  registrations: { path: '/zubau/registrierungen', series, stacked, ...(units && { units }), ...(note && { note }) },
});

// Abstand zwischen Inbetriebnahmen und Registierung, in the scope (mrt.registrierungsverzug_regions), one technology at
// a time
const delayOf = (series) => ({
  id: 'registrierungsverzug',
  title: 'Abstand zwischen Inbetriebnahmen und Registierung',
  kind: 'registration-delay',
  view: 'zubau',
  icon: Timer,
  delay: { path: '/zubau/registrierungsverzug', series },
});

// Solar units and batteries at the same Lokation, Germany-wide (mrt.pv_speicher): for solar and for the batteries
const PV_SPEICHER = {
  id: 'pv-speicher',
  title: 'Solaranlagen mit Batteriespeicher',
  kind: 'pv-speicher',
  view: 'anlagen',
  path: '/solar/pv-speicher',
  icon: BatteryCharging,
};

// Below the solar size classes (Anlagen, Regionen im Detail): they count Anlagen, the units at one grid connection
// together (aggregate_size_distribution.sql)
export const SOLAR_SIZES_NOTE =
  'Einheiten am selben Netzanschluss (Lokation im MaStR) zählen als eine Anlage, auch mit verschiedenen Betreibern – ' +
  'etwa Solarparks, die in Teilen registriert sind. Balkonkraftwerke bis 2 kWp zählen einzeln.';

// Below the maps of the technologies whose large plants the register publishes with their Land only
const LAND_ONLY_NOTE =
  'Große Kraftwerke sind im Register nur mit ihrem Bundesland veröffentlicht: Sie zählen für das Land, nicht für ' +
  'einen Kreis oder eine Gemeinde.';

export const ERZEUGER = {
  id: 'erzeuger',
  basePath: '/erzeuger',
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
      // Its series of the Registrierungen (KPI „Registrierungen (12 Monate)“; parts: per subtype)
      registrations: { all: 'solar', parts: { gebaeude: 'solar_gebaeude', freiflaeche: 'solar_freiflaeche', balkon: 'solar_balkon' } },
      // The map in time: Bestand, Zubau, Stilllegungen per year or month and what is planned (/karte/<zeit>,
      // features/dashboard/mapTime.js)
      zeit: 'solar',
      // The points of the continuous map (mrt.heatmap_points): plants at their coordinates, small ones per postcode
      heatmapPath: '/solar/heatmap',
      // Units and power per size class, for the "Verteilung nach Anlagengröße" (mrt.size_distribution), and its footnote
      sizesPath: '/solar/size-distribution',
      sizesNote: SOLAR_SIZES_NOTE,
      // Multiple choice in the technology's filters while it is active; no param in the URL = all selected.
      // Gebäude: Gebäude- und sonstige Anlagen and those without an Art; Freifläche: Freiflächenanlagen; Balkonkraftwerke:
      // the steckerfertigen. Passed to every solar request as ?anlagenart=… (the views have one row per Anlagenart, the
      // API sums the chosen). note: a remark at the page's bottom, marked at its option (TechFilters), with a link.
      subtypes: {
        param: 'anlagenart',
        label: 'Anlagenart',
        options: [
          { id: 'gebaeude', label: 'Gebäude' },
          { id: 'freiflaeche', label: 'Freifläche' },
          { id: 'balkon', label: 'Balkonkraftwerke', note: true },
        ],
        note: {
          text:
            'Balkonkraftwerke: die als steckerfertige Solaranlage registrierten Einheiten. Viele sind nicht registriert – ' +
            'auf jedes registrierte kommen Schätzungen zufolge rund zwei nicht registrierte –, manche stehen als ' +
            'Gebäudeanlage im Register. Die Zahlen sind eine Untergrenze.',
          link: { to: '/datenqualitaet#balkonkraftwerke', label: 'Mehr in der Datenqualität' },
        },
      },
      // Which power the solar values show, passed as ?leistung=… (the first option is the default, like in the API).
      // The note is a footnote below the choice of technology (SelectionBar), marked ¹ at the switch and in the map title.
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
      // Überblick (OverviewView): its Arten from the monthly series of the Zubau (/zubau/zeitverlauf, Netto), each part
      // its series – the Gebäude without the Balkonkraftwerke, the only place they are apart: everywhere else they count
      // with the Gebäude –, the total of the comparison among its peers (/zubau/bestand), the series of its planned
      // units (/zubau/geplant) and the national target with the series it counts (config/targets.js, Bruttoleistung)
      overview: {
        title: 'Dach, Balkon oder Freifläche',
        // What the units are called in a sentence: one, several
        name: ['Solaranlage', 'Solaranlagen'],
        parts: [
          {
            id: 'gebaeude',
            series: 'solar_gebaeude_netto',
            minus: 'solar_balkon_netto',
            label: 'Gebäude',
            hint: 'Dach, Fassade',
            color: 'var(--series-solar)',
          },
          {
            id: 'balkon',
            series: 'solar_balkon_netto',
            label: 'Balkonkraftwerke',
            hint: 'steckerfertig',
            color: 'var(--series-solar-balkon)',
            // Hatched: a lower bound (Datenqualität)
            hatch: 'var(--series-solar-balkon-hatch)',
          },
          { id: 'freiflaeche', series: 'solar_freiflaeche_netto', label: 'Freifläche', hint: 'Solarparks', color: 'var(--series-solar-freiflaeche)' },
        ],
        total: ['solar_netto'],
        planned: ['solar_gebaeude_netto', 'solar_freiflaeche_netto'],
        targets: { solar: ['solar'] },
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
        // The rose once per tilt class of the modules, as wide as the page (OrientationTiltAnalysis)
        {
          id: 'ausrichtung-neigung',
          title: 'Ausrichtung nach Neigungswinkel',
          kind: 'orientation-tilt',
          view: 'anlagen',
          path: '/solar/orientation-tilt', // mrt.solar_orientation_tilt
          icon: Compass,
        },
        // Where the modules face, per Land or Kreis on a map (OrientationMap, /solar/orientation/regions)
        { id: 'ausrichtung-karte', title: 'Ausrichtung nach Region', kind: 'orientation-map', view: 'anlagen' },
        PV_SPEICHER,
      ],
    },
    {
      id: 'wind',
      label: 'Wind',
      icon: Wind,
      statsPath: '/wind/dashboard-stats',
      // Its series of the Registrierungen (KPI „Registrierungen (12 Monate)“; parts: per subtype)
      registrations: { all: 'wind', parts: { an_land: 'wind_an_land', auf_see: 'wind_auf_see' } },
      zeit: 'wind',
      // The map in its own hue (lib/colorScale.js)
      ramp: RAMPS.green,
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
      // Überblick: an Land and auf See from the monthly series of the Zubau, each with its national target
      overview: {
        title: 'An Land oder auf See',
        name: ['Windenergieanlage', 'Windenergieanlagen'],
        parts: [
          { id: 'wind_an_land', series: 'wind_an_land', label: 'An Land', color: 'var(--series-wind-land)' },
          { id: 'wind_auf_see', series: 'wind_auf_see', label: 'Auf See', hint: 'Nord- und Ostsee', color: 'var(--series-wind-sea)' },
        ],
        total: ['wind_an_land', 'wind_auf_see'],
        planned: ['wind_an_land', 'wind_auf_see'],
        targets: { wind_an_land: ['wind_an_land'], wind_auf_see: ['wind_auf_see'] },
      },
    },
    {
      id: 'biomasse',
      label: 'Biomasse',
      icon: Leaf,
      statsPath: '/biomass/dashboard-stats',
      // Its series of the Registrierungen (KPI „Registrierungen (12 Monate)“; parts: per subtype)
      registrations: { all: 'biomasse' },
      zeit: 'biomass',
      // The map in its own hue (lib/colorScale.js)
      ramp: RAMPS.olive,
      sizesPath: '/biomass/size-distribution',
      granularities: REGION_LEVELS,
      // Biogas (with Biomethan, Klär- and Deponiegas), solid and liquid biomass: passed as ?art=… (no param = all, the
      // API sums them)
      subtypes: {
        param: 'art',
        label: 'Biomasseart',
        options: [
          { id: 'gasfoermig', label: 'Biogas' },
          { id: 'fest', label: 'Fest' },
          { id: 'fluessig', label: 'Flüssig' },
        ],
      },
      // Überblick: per Biomasseart from the monthly series of the Zubau, no target
      overview: {
        title: 'Biogas, fest oder flüssig',
        name: ['Biomasseanlage', 'Biomasseanlagen'],
        parts: [
          { id: 'biomasse_gasfoermig', series: 'biomasse_gasfoermig', label: 'Biogas', hint: 'mit Klär- und Deponiegas', color: 'var(--series-biogas)' },
          { id: 'biomasse_fest', series: 'biomasse_fest', label: 'Feste Biomasse', hint: 'Holz, Stroh', color: 'var(--series-biomasse-fest)' },
          { id: 'biomasse_fluessig', series: 'biomasse_fluessig', label: 'Flüssige Biomasse', hint: 'Pflanzenöl', color: 'var(--series-biomasse-fluessig)' },
        ],
        total: ['biomasse'],
        planned: ['biomasse'],
      },
      note: LAND_ONLY_NOTE,
    },
    {
      id: 'wasserkraft',
      label: 'Wasserkraft',
      icon: Droplets,
      statsPath: '/water/dashboard-stats',
      // Its series of the Registrierungen (KPI „Registrierungen (12 Monate)“; parts: per subtype)
      registrations: { all: 'wasserkraft' },
      zeit: 'water',
      // The map in its own hue (lib/colorScale.js)
      ramp: RAMPS.petrol,
      sizesPath: '/water/size-distribution',
      granularities: REGION_LEVELS,
      // Überblick: from the monthly series of the Zubau, no parts, no target
      overview: {
        name: ['Wasserkraftanlage', 'Wasserkraftanlagen'],
        parts: [{ id: 'wasserkraft', series: 'wasserkraft', label: 'Wasserkraft', color: 'var(--series-wasserkraft)' }],
        total: ['wasserkraft'],
        planned: ['wasserkraft'],
      },
    },
    // The units of the register's EinheitenGeothermieGrubengasDruckentspannung: Geothermie, Grubengas from coal mines,
    // Klärschlamm, turbines in gas and water pipelines (Druckentspannung) and Solarthermie
    {
      id: 'geothermie',
      label: 'Geothermie & Grubengas',
      icon: Thermometer,
      statsPath: '/geothermal/dashboard-stats',
      // Its series of the Registrierungen (KPI „Registrierungen (12 Monate)“; parts: per subtype)
      registrations: { all: 'geothermie_grubengas' },
      zeit: 'geothermal',
      // The map in its own hue (lib/colorScale.js)
      ramp: RAMPS.terracotta,
      sizesPath: '/geothermal/size-distribution',
      granularities: REGION_LEVELS,
      subtypes: {
        param: 'art',
        label: 'Energieträger',
        options: [
          { id: 'geothermie', label: 'Geothermie' },
          { id: 'grubengas', label: 'Grubengas' },
          { id: 'klaerschlamm', label: 'Klärschlamm' },
          { id: 'druckentspannung', label: 'Druckentspannung' },
          { id: 'solarthermie', label: 'Solarthermie' },
        ],
      },
      overview: {
        title: 'Erdwärme, Grubengas, Klärschlamm, Druck',
        name: ['Anlage', 'Anlagen'],
        parts: [
          { id: 'geothermie', series: 'geothermie', label: 'Geothermie', hint: 'Erdwärme', color: 'var(--series-geothermie)' },
          { id: 'grubengas', series: 'grubengas', label: 'Grubengas', hint: 'aus Kohlegruben', color: 'var(--series-grubengas)' },
          { id: 'klaerschlamm', series: 'klaerschlamm', label: 'Klärschlamm', color: 'var(--series-klaerschlamm)' },
          {
            id: 'druckentspannung',
            series: 'druckentspannung',
            label: 'Druckentspannung',
            hint: 'Turbinen in Gas- und Wasserleitungen',
            color: 'var(--series-druckentspannung)',
          },
          { id: 'solarthermie', series: 'solarthermie', label: 'Solarthermie', color: 'var(--series-solarthermie)' },
        ],
        total: ['geothermie_grubengas'],
        planned: ['geothermie_grubengas'],
      },
      note: LAND_ONLY_NOTE,
    },
    // KWK plants (Kraft-Wärme-Kopplung): power and heat at once. Their units are biomass and combustion units, so they
    // overlap with Biomasse; the plant counts by the fuel of its largest unit.
    {
      id: 'kwk',
      label: 'KWK',
      icon: Factory,
      statsPath: '/kwk/dashboard-stats',
      // Its series of the Registrierungen (KPI „Registrierungen (12 Monate)“; parts: per subtype)
      registrations: { all: 'kwk' },
      zeit: 'kwk',
      // The map in its own hue (lib/colorScale.js)
      ramp: RAMPS.violet,
      sizesPath: '/kwk/size-distribution',
      granularities: REGION_LEVELS,
      subtypes: {
        param: 'energietraeger',
        label: 'Energieträger',
        options: [
          { id: 'erdgas', label: 'Erdgas' },
          { id: 'biomasse', label: 'Biomasse' },
          { id: 'kohle', label: 'Kohle' },
          { id: 'sonstige', label: 'Sonstige' },
        ],
      },
      // The electrical power like the other Erzeuger, the heat (thermische Nutzleistung) as a Kennzahl of its own
      metrics: [
        { id: 'total_power', quantity: 'leistung', basis: 'absolut', legend: 'Elektrische Leistung', unit: 'MW', digits: 1 },
        { id: 'relative_area_power', quantity: 'leistung', basis: 'flaeche', legend: 'Elektrische Leistung je Fläche', unit: 'kW/km²', digits: 1 },
        {
          id: 'relative_population_power',
          quantity: 'leistung',
          basis: 'einwohner',
          legend: 'Elektrische Leistung je Einwohner',
          unit: 'kW/Einw.',
          digits: 2,
        },
        { id: 'total_heat', quantity: 'waerme', basis: 'absolut', legend: 'Thermische Leistung', unit: 'MW', digits: 1 },
        { id: 'relative_area_heat', quantity: 'waerme', basis: 'flaeche', legend: 'Thermische Leistung je Fläche', unit: 'kW/km²', digits: 1 },
        {
          id: 'relative_population_heat',
          quantity: 'waerme',
          basis: 'einwohner',
          legend: 'Thermische Leistung je Einwohner',
          unit: 'kW/Einw.',
          digits: 2,
        },
      ],
      tooltipRows: [
        { key: 'total_units', label: 'KWK-Anlagen', digits: 0 },
        { key: 'total_power', label: 'elektrisch', unit: 'MW', digits: 1 },
        { key: 'total_heat', label: 'thermisch', unit: 'MW', digits: 1 },
        { key: 'relative_population_power', label: 'el. je Einwohner', unit: 'kW', digits: 2 },
      ],
      kpis: [
        { id: 'units', kind: 'sum', field: 'total_units', label: 'KWK-Anlagen', icon: Factory },
        { id: 'power', kind: 'sum', field: 'total_power', format: 'power', label: 'Elektrische Leistung', icon: Zap },
        { id: 'heat', kind: 'sum', field: 'total_heat', format: 'power', label: 'Thermische Leistung', icon: Flame },
        { id: 'growth', kind: 'sum', field: 'added_12m_power', format: 'power', label: 'Zubau (12 Monate)', icon: TrendingUp },
      ],
      overview: {
        title: 'Erdgas, Biomasse, Kohle',
        name: ['KWK-Anlage', 'KWK-Anlagen'],
        parts: [
          { id: 'kwk_erdgas', series: 'kwk_erdgas', label: 'Erdgas', hint: 'mit anderen Gasen, Wasserstoff', color: 'var(--series-kwk-erdgas)' },
          { id: 'kwk_biomasse', series: 'kwk_biomasse', label: 'Biomasse', hint: 'vor allem Biogas', color: 'var(--series-kwk-biomasse)' },
          { id: 'kwk_kohle', series: 'kwk_kohle', label: 'Kohle', hint: 'Stein- und Braunkohle', color: 'var(--series-kwk-kohle)' },
          { id: 'kwk_sonstige', series: 'kwk_sonstige', label: 'Sonstige', hint: 'Öl, Abfall, Wärme, Grubengas', color: 'var(--series-kwk-sonstige)' },
        ],
        total: ['kwk'],
      },
      note:
        'KWK-Anlagen erzeugen Strom und Wärme zugleich. Ihre Einheiten sind Biomasse- und Verbrennungseinheiten, sie ' +
        'überschneiden sich also mit Biomasse; eine Anlage zählt mit dem Energieträger ihrer größten Einheit, an ' +
        'deren Ort. Die thermische Leistung nur, wo sie plausibel ist: höchstens das 50-Fache der elektrischen. ' +
        LAND_ONLY_NOTE,
    },
  ],
  // heat: what the continuous map shows of an absolute Kennzahl – its density, the measure of its points (default power),
  // and its label there if another
  metrics: [
    {
      id: 'total_power',
      quantity: 'leistung',
      basis: 'absolut',
      legend: 'Installierte Leistung',
      unit: 'MW',
      digits: 1,
      heat: { legend: 'Leistungsdichte', unit: 'kW/km²' },
    },
    { id: 'relative_area_power', quantity: 'leistung', basis: 'flaeche', legend: 'Leistung je Fläche', unit: 'kW/km²', digits: 1 },
    { id: 'relative_population_power', quantity: 'leistung', basis: 'einwohner', legend: 'Leistung je Einwohner', unit: 'kW/Einw.', digits: 2 },
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
    // In operation since less than 12 months (added_12m_power of the region views)
    { id: 'growth', kind: 'sum', field: 'added_12m_power', format: 'power', label: 'Zubau (12 Monate)', icon: TrendingUp },
    // Registered in the MaStR in the last 12 months, in the area (mrt.registrierungen_regions, the technology's
    // `registrations` series)
    { id: 'registrations', kind: 'registrations', label: 'Registrierungen (12 Monate)', icon: ClipboardList },
  ],
  analyses: [
    {
      id: 'timeline',
      title: 'Ausbau im Zeitverlauf',
      icon: ChartColumnIncreasing,
      view: 'zubau',
      // Germany-wide chart across the full width (mrt.zubau_zeitverlauf). Stacked in this order, the first at the bottom.
      timeline: {
        path: '/zubau/zeitverlauf',
        unit: 'MW',
        quantity: 'Leistung',
        since: 2000,
        // A series with `netto` follows the solar Leistung: that series of the API while it is Netto (AC), the default
        // Solar per Anlagenart: Gebäude (also steckerfertige and sonstige) at the bottom, Freifläche a deeper yellow
        series: [
          { id: 'solar_gebaeude', netto: 'solar_gebaeude_netto', label: 'Solar Gebäude', color: 'var(--series-solar)' },
          {
            id: 'solar_freiflaeche',
            netto: 'solar_freiflaeche_netto',
            label: 'Solar Freifläche',
            color: 'var(--series-solar-freiflaeche)',
          },
          { id: 'wind_an_land', label: 'Wind an Land', color: 'var(--series-wind-land)' },
          { id: 'wind_auf_see', label: 'Wind auf See', color: 'var(--series-wind-sea)' },
          // Off at first: next to solar and wind hardly visible. Not KWK: its units are biomass and combustion units.
          { id: 'biomasse', label: 'Biomasse', color: 'var(--series-biomasse)', hidden: true },
          { id: 'wasserkraft', label: 'Wasserkraft', color: 'var(--series-wasserkraft)', hidden: true },
          { id: 'geothermie_grubengas', label: 'Geothermie & Grubengas', color: 'var(--series-geothermie)', hidden: true },
        ],
      },
    },
    // Stacked like the Ausbau, solar (Gebäude, Freifläche) alone at first: it has by far the most registrations
    registrationsOf(
      [
        { id: 'solar_gebaeude', label: 'Solar Gebäude', color: 'var(--series-solar)' },
        { id: 'solar_freiflaeche', label: 'Solar Freifläche', color: 'var(--series-solar-freiflaeche)' },
        { id: 'solar_balkon', label: 'Balkonkraftwerke', color: 'var(--series-solar-balkon-bar)' },
        { id: 'wind_an_land', label: 'Wind an Land', color: 'var(--series-wind-land)', hidden: true },
        { id: 'wind_auf_see', label: 'Wind auf See', color: 'var(--series-wind-sea)', hidden: true },
        { id: 'biomasse', label: 'Biomasse', color: 'var(--series-biomasse)', hidden: true },
        { id: 'wasserkraft', label: 'Wasserkraft', color: 'var(--series-wasserkraft)', hidden: true },
        { id: 'geothermie_grubengas', label: 'Geothermie & Grubengas', color: 'var(--series-geothermie)', hidden: true },
        { id: 'kwk', label: 'KWK-Anlagen', color: 'var(--series-kwk)', hidden: true },
      ],
      { stacked: true },
    ),
    // Units in planning (EinheitBetriebsstatus 31) by their planned commissioning date, like the Ausbau
    // (mrt.geplant_zeitverlauf_regions): wind (an Land, auf See) alone at first – nearly every planned wind turbine has
    // its permit in the register; solar is noisy (many planned dates long past) and off at first
    {
      id: 'geplant',
      title: 'Geplante (genehmigte) Anlagen',
      icon: Construction,
      view: 'zubau',
      timeline: {
        // From the current month on (the chart's years from this one)
        path: '/zubau/geplant',
        planned: true,
        unit: 'MW',
        quantity: 'Leistung',
        series: [
          {
            id: 'solar_gebaeude',
            netto: 'solar_gebaeude_netto',
            label: 'Solar Gebäude',
            color: 'var(--series-solar)',
            hidden: true,
          },
          {
            id: 'solar_freiflaeche',
            netto: 'solar_freiflaeche_netto',
            label: 'Solar Freifläche',
            color: 'var(--series-solar-freiflaeche)',
            hidden: true,
          },
          { id: 'wind_an_land', label: 'Wind an Land', color: 'var(--series-wind-land)' },
          { id: 'wind_auf_see', label: 'Wind auf See', color: 'var(--series-wind-sea)' },
          { id: 'biomasse', label: 'Biomasse', color: 'var(--series-biomasse)', hidden: true },
          { id: 'wasserkraft', label: 'Wasserkraft', color: 'var(--series-wasserkraft)', hidden: true },
          { id: 'geothermie_grubengas', label: 'Geothermie & Grubengas', color: 'var(--series-geothermie)', hidden: true },
        ],
        note:
          'Einheiten „in Planung“ im Marktstammdatenregister, nach dem geplanten Inbetriebnahmedatum, wie es die Betreiber ' +
          'angeben; fast alle geplanten Windenergieanlagen haben ihre Genehmigung im Register. Nur Termine ab dem ' +
          'laufenden Monat: Ist ein Termin verstrichen, wurde die Anlage geplant, aber nie als in Betrieb gemeldet – das ' +
          'betrifft vor allem viele kleine Solaranlagen. Termine nach 2040 (eine Handvoll, meist Tippfehler) sind nicht ' +
          'enthalten.',
      },
    },
    delayOf([
      { id: 'solar', label: 'Solar', color: 'var(--series-solar)' },
      { id: 'wind', label: 'Wind', color: 'var(--series-wind-land)' },
      { id: 'biomasse', label: 'Biomasse', color: 'var(--series-biomasse)' },
      { id: 'wasserkraft', label: 'Wasserkraft', color: 'var(--series-wasserkraft)' },
      { id: 'geothermie_grubengas', label: 'Geothermie & Grubengas', color: 'var(--series-geothermie)' },
      { id: 'kwk', label: 'KWK-Anlagen', color: 'var(--series-kwk)' },
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
};

// The size classes of the battery timelines (aggregate_zubau.sql)
const BATTERY_NOTE =
  'Größenklassen wie battery-charts.de: Heimspeicher unter 30 kWh und 30 kW, Großspeicher ab 1 MWh oder 1 MW. ' +
  'Speicher mit unplausibler Kapazität (unter 6 Minuten oder über 12 Stunden Volllast) sind nicht enthalten.';

export const SPEICHER = {
  id: 'speicher',
  basePath: '/speicher',
  title: 'Speicher',
  description:
    'Kapazität und Leistung von Batterie-, Pump- und sonstigen Speichern – vom Heimspeicher bis zum Großspeicher, von ' +
    'Druckluft bis Wasserstoff.',
  ramp: RAMPS.blue,
  defaultGranularity: 'bundesland',
  technologies: [
    {
      id: 'batterie',
      label: 'Batteriespeicher',
      icon: BatteryCharging,
      statsPath: '/battery/dashboard-stats',
      // Its series of the Registrierungen (KPI „Registrierungen (12 Monate)“; parts: per subtype)
      registrations: {
        all: 'batterie',
        parts: { heimspeicher: 'batterie_heimspeicher', gewerbespeicher: 'batterie_gewerbespeicher', grossspeicher: 'batterie_grossspeicher' },
      },
      zeit: 'battery',
      // The size classes of the Zubau (battery-charts.de) as the map's filter (?groesse=…): only on the map, the other
      // pages show the classes in their own charts
      subtypes: {
        param: 'groesse',
        label: 'Anlagenart',
        mapOnly: true,
        options: [
          { id: 'heimspeicher', label: 'Heimspeicher', hint: 'unter 30 kWh und 30 kW' },
          { id: 'gewerbespeicher', label: 'Gewerbespeicher', hint: 'dazwischen' },
          { id: 'grossspeicher', label: 'Großspeicher', hint: 'ab 1.000 kWh oder 1.000 kW' },
        ],
      },
      heatmapPath: '/battery/heatmap',
      granularities: [...REGION_LEVELS, 'heatmap'],
      // Überblick: the batteries by their capacity (MWh), their power beside it (also: each class's series of power);
      // the size classes of the monthly series of the Zubau; no series of planned ones
      overview: {
        title: 'Heim-, Gewerbe- oder Großspeicher',
        measure: { format: 'capacity', label: 'Speicherkapazität' },
        also: { format: 'power', label: 'Leistung' },
        // What the units are: one, several; in a sentence (and none of them: "keine …" unless said)
        units: ['Speicher', 'Speicher'],
        name: ['Batteriespeicher', 'Batteriespeicher', 'kein Batteriespeicher'],
        parts: [
          {
            id: 'heimspeicher',
            series: 'heimspeicher',
            also: 'heimspeicher_leistung',
            label: 'Heimspeicher',
            hint: 'unter 30 kWh',
            color: 'var(--series-heimspeicher)',
          },
          {
            id: 'gewerbespeicher',
            series: 'gewerbespeicher',
            also: 'gewerbespeicher_leistung',
            label: 'Gewerbespeicher',
            hint: 'bis 1 MWh',
            color: 'var(--series-gewerbespeicher)',
          },
          {
            id: 'grossspeicher',
            series: 'grossspeicher',
            also: 'grossspeicher_leistung',
            label: 'Großspeicher',
            hint: 'ab 1 MWh',
            color: 'var(--series-grossspeicher)',
          },
        ],
        total: ['heimspeicher', 'gewerbespeicher', 'grossspeicher'],
      },
      // The page Anlagen, in the scope: size classes by the plant's capacity (mrt.battery_size_distribution), and the
      // units by battery technology and by coupling (mrt.battery_kinds)
      analyses: [
        {
          id: 'groesse',
          title: 'Verteilung nach Speichergröße',
          kind: 'sizes',
          view: 'anlagen',
          path: '/battery/size-distribution',
          measure: 'capacity',
          measures: ['capacity', 'power'],
          unitsLabel: 'Speicher',
          what: 'Kapazität oder Leistung und Speicher je Größenklasse der Speicheranlage',
          // Regionen im Vergleich: a table of every area per class (/battery/size-distribution/regions)
          regions: {
            label: 'Speichergröße',
            measures: [
              { field: 'capacity', label: 'Kapazität', unit: 'MWh' },
              { field: 'power', label: 'Leistung', unit: 'MW' },
            ],
          },
        },
        {
          id: 'arten',
          title: 'Batterietechnologie und Kopplung',
          kind: 'kinds',
          view: 'anlagen',
          path: '/battery/kinds',
          unitsLabel: 'Speicher',
          what: 'Anteile nach Batterietechnologie und AC/DC-Kopplung',
          measures: [
            { id: 'capacity', label: 'Kapazität', field: 'total_capacity', unit: 'MWh' },
            { id: 'power', label: 'Leistung', field: 'total_power', unit: 'MW' },
            { id: 'units', label: 'Anzahl', field: 'total_units' },
          ],
          groups: [
            {
              id: 'technologie',
              title: 'Batterietechnologie',
              colors: {
                lithium: 'var(--series-lithium)',
                blei: 'var(--series-blei)',
                redox_flow: 'var(--series-redox-flow)',
                hochtemperatur: 'var(--series-hochtemperatur)',
                nickel: 'var(--series-nickel)',
                sonstige: 'var(--series-batterie-sonstige)',
              },
            },
            { id: 'kopplung', title: 'AC/DC-Kopplung', colors: { ac: 'var(--series-ac)', dc: 'var(--series-dc)' } },
          ],
        },
      ],
    },
    {
      id: 'pumpspeicher',
      label: 'Pumpspeicher',
      icon: Mountain,
      // Each plant as an icon at its location instead of shaded areas (mrt.pumpkraftwerke)
      plantsPath: '/pumped-storage/plants',
      // Its series of the Registrierungen (KPI „Registrierungen (12 Monate)“; parts: per subtype)
      registrations: { all: 'pumpspeicher' },
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
        { id: 'total_capacity', quantity: 'kapazitaet', basis: 'absolut', legend: 'Speicherkapazität', unit: 'MWh', digits: 0 },
        { id: 'total_power', quantity: 'leistung', basis: 'absolut', legend: 'Turbinenleistung', unit: 'MW', digits: 0 },
      ],
      // Plants in operation in Germany. Capacities are not summed: plants sharing a reservoir report it each.
      kpis: [
        { id: 'plants', kind: 'sum', field: 'plants', label: 'Kraftwerke in Betrieb', icon: Mountain },
        { id: 'power', kind: 'sum', field: 'total_power', format: 'power', label: 'Turbinenleistung', icon: Zap },
        { id: 'pump', kind: 'sum', field: 'pump_power', format: 'power', label: 'Pumpleistung', icon: Gauge },
        { id: 'registrations', kind: 'registrations', label: 'Registrierungen (12 Monate)', icon: ClipboardList },
      ],
    },
    // The storages that are neither batteries nor pumped storage: few and small, most of them hydrogen storages in houses
    {
      id: 'sonstige',
      label: 'Sonstige',
      icon: Package,
      statsPath: '/other-storage/dashboard-stats',
      // Its series of the Registrierungen (KPI „Registrierungen (12 Monate)“; parts: per subtype)
      registrations: { all: 'speicher_sonstige' },
      zeit: 'other_storage',
      granularities: REGION_LEVELS,
      // Druckluft, Schwungrad, Wasserstoff: passed as ?art=… (no param = all, the API sums them)
      subtypes: {
        param: 'art',
        label: 'Speichertechnologie',
        options: [
          { id: 'druckluft', label: 'Druckluft' },
          { id: 'schwungrad', label: 'Schwungrad' },
          { id: 'wasserstoff', label: 'Wasserstoff' },
        ],
      },
      // Überblick: by their capacity like the batteries, their power beside it
      overview: {
        title: 'Druckluft, Schwungrad oder Wasserstoff',
        measure: { format: 'capacity', label: 'Speicherkapazität' },
        also: { format: 'power', label: 'Leistung' },
        units: ['Speicher', 'Speicher'],
        name: ['Speicher', 'Speicher', 'kein solcher Speicher'],
        parts: [
          {
            id: 'wasserstoffspeicher',
            series: 'wasserstoffspeicher',
            also: 'wasserstoffspeicher_leistung',
            label: 'Wasserstoff',
            hint: 'mit Rückverstromung',
            color: 'var(--series-wasserstoffspeicher)',
          },
          {
            id: 'druckluftspeicher',
            series: 'druckluftspeicher',
            also: 'druckluftspeicher_leistung',
            label: 'Druckluft',
            color: 'var(--series-druckluft)',
          },
          {
            id: 'schwungradspeicher',
            series: 'schwungradspeicher',
            also: 'schwungradspeicher_leistung',
            label: 'Schwungrad',
            color: 'var(--series-schwungrad)',
          },
        ],
        total: ['wasserstoffspeicher', 'druckluftspeicher', 'schwungradspeicher'],
      },
      note:
        'Die Kapazität wie registriert, ohne Plausibilitätsprüfung: Ein Wasserstoffspeicher hält Strom für Wochen. Der ' +
        'Druckluftspeicher Huntorf ist mit 1 kW und 1,7 GWh registriert und nur mit seinem Bundesland veröffentlicht.',
    },
  ],
  // The usable capacity first, the default (only batteries with a plausible one, aggregate_bat_by_region_power.sql), and
  // the power, like the Erzeuger
  metrics: [
    {
      id: 'total_capacity',
      quantity: 'kapazitaet',
      basis: 'absolut',
      legend: 'Speicherkapazität',
      unit: 'MWh',
      digits: 1,
      heat: { legend: 'Kapazitätsdichte', unit: 'kWh/km²', measure: 'capacity' },
    },
    { id: 'relative_area_capacity', quantity: 'kapazitaet', basis: 'flaeche', legend: 'Kapazität je Fläche', unit: 'kWh/km²', digits: 1 },
    { id: 'relative_population_capacity', quantity: 'kapazitaet', basis: 'einwohner', legend: 'Kapazität je Einwohner', unit: 'kWh/Einw.', digits: 2 },
    {
      id: 'total_power',
      quantity: 'leistung',
      basis: 'absolut',
      legend: 'Speicherleistung',
      unit: 'MW',
      digits: 1,
      heat: { legend: 'Leistungsdichte', unit: 'kW/km²' },
    },
    { id: 'relative_area_power', quantity: 'leistung', basis: 'flaeche', legend: 'Leistung je Fläche', unit: 'kW/km²', digits: 1 },
    { id: 'relative_population_power', quantity: 'leistung', basis: 'einwohner', legend: 'Leistung je Einwohner', unit: 'kW/Einw.', digits: 2 },
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
    // Usable capacity in operation since less than 12 months (added_12m_capacity of mrt.battery_region_stats)
    { id: 'growth', kind: 'sum', field: 'added_12m_capacity', format: 'capacity', label: 'Zubau (12 Monate)', icon: TrendingUp },
    { id: 'registrations', kind: 'registrations', label: 'Registrierungen (12 Monate)', icon: ClipboardList },
  ],
  analyses: [
    {
      id: 'timeline',
      title: 'Ausbau im Zeitverlauf',
      icon: ChartColumnIncreasing,
      view: 'zubau',
      // The batteries by size class, like battery-charts.de (RWTH Aachen): their capacity or their power (Bruttoleistung,
      // as on the map), switched in the head of the card. A series keeps its id in both (its legend stays as it is);
      // source: the technology of the API, where it is another
      timeline: {
        path: '/zubau/zeitverlauf',
        since: 2013,
        measures: [
          {
            id: 'kapazitaet',
            label: 'Kapazität',
            unit: 'MWh',
            quantity: 'Batteriekapazität',
            series: [
              { id: 'grossspeicher', label: 'Großspeicher', color: 'var(--series-grossspeicher)' },
              { id: 'gewerbespeicher', label: 'Gewerbespeicher', color: 'var(--series-gewerbespeicher)' },
              { id: 'heimspeicher', label: 'Heimspeicher', color: 'var(--series-heimspeicher)' },
            ],
          },
          {
            id: 'leistung',
            label: 'Leistung',
            unit: 'MW',
            quantity: 'Batterieleistung',
            series: [
              { id: 'grossspeicher', source: 'grossspeicher_leistung', label: 'Großspeicher', color: 'var(--series-grossspeicher)' },
              { id: 'gewerbespeicher', source: 'gewerbespeicher_leistung', label: 'Gewerbespeicher', color: 'var(--series-gewerbespeicher)' },
              { id: 'heimspeicher', source: 'heimspeicher_leistung', label: 'Heimspeicher', color: 'var(--series-heimspeicher)' },
            ],
          },
        ],
        note: BATTERY_NOTE,
      },
    },
    ...[registrationsOf, delayOf].map((of) =>
      of([
        { id: 'batterie', label: 'Batteriespeicher', color: 'var(--series-gewerbespeicher)' },
        { id: 'pumpspeicher', label: 'Pumpspeicher', color: 'var(--series-grossspeicher)' },
        { id: 'speicher_sonstige', label: 'Sonstige Speicher', color: 'var(--series-wasserstoffspeicher)' },
      ]),
    ),
    // Batteries at solar units: how many solar units have one, and how much capacity per kW of solar
    PV_SPEICHER,
  ],
};

// The kinds of gas producers and storages: the filters of the map and of the Anlagen page, the colours of their sites
// and of their slices
const GAS_TECHNIK = [
  { id: 'biomethan', label: 'Biomethan', color: 'var(--series-biomethan)' },
  { id: 'erdgas', label: 'Erdgasförderung', color: 'var(--series-erdgas)' },
  { id: 'lng', label: 'LNG', color: 'var(--series-lng)' },
  { id: 'wasserstoff', label: 'Power-to-Gas: Wasserstoff', color: 'var(--series-wasserstoff)' },
  { id: 'methan', label: 'Power-to-Gas: Methan', color: 'var(--series-methan)' },
];
const GAS_SPEICHERARTEN = [
  { id: 'kaverne', label: 'Kavernenspeicher', color: 'var(--series-kaverne)' },
  { id: 'pore', label: 'Porenspeicher', color: 'var(--series-pore)' },
  { id: 'aquifer', label: 'Aquiferspeicher', color: 'var(--series-aquifer)' },
];
const colorsOf = (options) => Object.fromEntries(options.map((o) => [o.id, o.color]));

// Gas: producers and storages, few enough to show each at its location like the Pumpspeicher (mrt.gaserzeuger,
// mrt.gasspeicher). Their subtypes filter the sites in the browser and colour them; on the Anlagen page they go to the
// API (?technik=…, ?speicherart=…).
export const GAS = {
  id: 'gas',
  basePath: '/gas',
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
      // Its series of the Registrierungen (KPI „Registrierungen (12 Monate)“; parts: per subtype)
      registrations: { all: 'gaserzeuger' },
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
        label: 'Gastechnologie',
        field: 'technologie',
        options: GAS_TECHNIK,
      },
      // The page Anlagen, in the scope: the producers in operation by their Erzeugungsleistung and by technology
      analyses: [
        {
          id: 'groesse',
          title: 'Verteilung nach Anlagengröße',
          kind: 'sizes',
          view: 'anlagen',
          path: '/gas/erzeuger/size-distribution',
          what: 'Erzeugungsleistung und Anlagen je Größenklasse',
        },
        {
          id: 'technologie',
          title: 'Gastechnologie',
          kind: 'kinds',
          view: 'anlagen',
          path: '/gas/erzeuger/kinds',
          what: 'Anteile der Technologien',
          measures: [
            { id: 'power', label: 'Leistung', field: 'total_power', unit: 'MW' },
            { id: 'units', label: 'Anzahl', field: 'total_units' },
          ],
          groups: [{ id: 'technologie', title: 'Gastechnologie', colors: colorsOf(GAS_TECHNIK) }],
        },
      ],
      metrics: [{ id: 'total_power', quantity: 'leistung', basis: 'absolut', legend: 'Erzeugungsleistung', unit: 'MW', digits: 1 }],
      // Einheiten in Germany; a unit's Erzeugungsleistung is the most gas it can feed in, in MW (kWh per hour)
      kpis: [
        { id: 'plants', kind: 'sum', field: 'plants', label: 'Anlagen in Betrieb', icon: Flame },
        { id: 'power', kind: 'sum', field: 'total_power', format: 'power', label: 'Erzeugungsleistung', icon: Gauge },
        { id: 'planned', kind: 'sum', field: 'planned', label: 'In Planung', icon: Construction },
        { id: 'registrations', kind: 'registrations', label: 'Registrierungen (12 Monate)', icon: ClipboardList },
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
      // Its series of the Registrierungen (KPI „Registrierungen (12 Monate)“; parts: per subtype)
      registrations: { all: 'gasspeicher' },
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
        options: GAS_SPEICHERARTEN,
      },
      // The page Anlagen, in the scope: the storages in operation by their working gas and by Speicherart
      analyses: [
        {
          id: 'groesse',
          title: 'Verteilung nach Speichergröße',
          kind: 'sizes',
          view: 'anlagen',
          path: '/gas/speicher/size-distribution',
          measure: 'arbeitsgas',
          measures: ['arbeitsgas', 'power'],
          unitsLabel: 'Speicher',
          what: 'Arbeitsgas oder Ausspeicherleistung und Speicher je Größenklasse',
        },
        {
          id: 'speicherart',
          title: 'Gasspeicherart',
          kind: 'kinds',
          view: 'anlagen',
          path: '/gas/speicher/kinds',
          unitsLabel: 'Speicher',
          what: 'Anteile der Speicherarten',
          measures: [
            { id: 'capacity', label: 'Arbeitsgas', field: 'total_capacity', unit: 'GWh' },
            { id: 'power', label: 'Leistung', field: 'total_power', unit: 'MW' },
            { id: 'units', label: 'Anzahl', field: 'total_units' },
          ],
          groups: [{ id: 'speicherart', title: 'Gasspeicherart', colors: colorsOf(GAS_SPEICHERARTEN) }],
        },
      ],
      metrics: [
        { id: 'total_capacity', quantity: 'kapazitaet', basis: 'absolut', legend: 'Arbeitsgas', unit: 'GWh', digits: 0 },
        { id: 'total_power', quantity: 'leistung', basis: 'absolut', legend: 'Ausspeicherleistung', unit: 'MW', digits: 0 },
      ],
      kpis: [
        { id: 'plants', kind: 'sum', field: 'plants', label: 'Speicher in Betrieb', icon: Cylinder },
        { id: 'capacity', kind: 'sum', field: 'total_capacity', format: 'amount', unit: 'GWh', label: 'Arbeitsgas', icon: Layers },
        { id: 'power', kind: 'sum', field: 'total_power', format: 'power', label: 'Ausspeicherleistung', icon: Gauge },
        { id: 'registrations', kind: 'registrations', label: 'Registrierungen (12 Monate)', icon: ClipboardList },
      ],
      note:
        'Das MaStR nennt es „maximal nutzbares Arbeitsgasvolumen“, gibt es aber als Energie an (kWh). Das Volumen folgt über ' +
        'den durchschnittlichen Brennwert. Ein- und Ausspeicherleistung wie von den Betreibern gemeldet.',
    },
  ],
  metrics: [{ id: 'total_power', quantity: 'leistung', basis: 'absolut', legend: 'Leistung', unit: 'MW', digits: 0 }],
  tooltipRows: [],
  kpis: [],
  analyses: [registrationsOf, delayOf].map((of) =>
    of([
      { id: 'gaserzeuger', label: 'Gaserzeuger', color: 'var(--topic-gas)' },
      { id: 'gasspeicher', label: 'Gasspeicher', color: 'var(--topic-gas-strong)' },
    ]),
  ),
};

// The Spannungsebenen of the Netzanschlüsse, each with the transformation below it (aggregate_netzanschluesse.sql): the
// filter of the map (?spannung=…), and the Netzebenen 1–7 of the analyses (/netz/ebenen: netzebene)
export const NETZEBENEN = [
  { ne: 1, ebene: 'hoechstspannung', label: 'Höchstspannung' },
  { ne: 2, ebene: 'hoechstspannung', label: 'Umspannung Höchst-/Hochspannung' },
  { ne: 3, ebene: 'hochspannung', label: 'Hochspannung' },
  { ne: 4, ebene: 'hochspannung', label: 'Umspannung Hoch-/Mittelspannung' },
  { ne: 5, ebene: 'mittelspannung', label: 'Mittelspannung' },
  { ne: 6, ebene: 'mittelspannung', label: 'Umspannung Mittel-/Niederspannung' },
  { ne: 7, ebene: 'niederspannung', label: 'Niederspannung' },
];

// The technologies of the units at the Netzanschlusspunkte, in the API's names (/netz/ebenen: technologien)
export const NETZ_TECHNOLOGIEN = [
  { id: 'solar', label: 'Solar', color: 'var(--series-solar)' },
  { id: 'wind', label: 'Wind', color: 'var(--series-wind-land)' },
  { id: 'wasser', label: 'Wasserkraft', color: 'var(--series-wasserkraft)' },
  { id: 'speicher', label: 'Speicher', color: 'var(--series-netz-speicher)' },
  { id: 'biomasse', label: 'Biomasse', color: 'var(--series-netz-biomasse)' },
  { id: 'erdgas', label: 'Erdgas', color: 'var(--series-netz-erdgas)' },
  { id: 'kohle', label: 'Kohle', color: 'var(--series-netz-kohle)' },
  { id: 'sonstige', label: 'Sonstige', color: 'var(--series-netz-sonstige)' },
];

// The Spannungsebenen as series of the Zubau page (mrt.netz_zubau_regions), the lowest at the bottom; suffix: the
// series of the API (the power: none; the points: _punkte)
const netzSeries = (suffix = '') =>
  [
    { ebene: 'niederspannung', label: 'Niederspannung', color: 'var(--series-netz-nieder)' },
    { ebene: 'mittelspannung', label: 'Mittelspannung', color: 'var(--series-netz-mittel)' },
    { ebene: 'hochspannung', label: 'Hochspannung', color: 'var(--series-netz-hoch)' },
    { ebene: 'hoechstspannung', label: 'Höchstspannung', color: 'var(--series-netz-hoechst)' },
  ].map(({ ebene, label, color }) => ({
    id: `netz_${ebene}`,
    ...(suffix ? { source: `netz_${ebene}${suffix}` } : {}),
    label,
    color,
  }));

const NETZ_ZUBAU_NOTE =
  'Netzanschlusspunkte haben im MaStR kein eigenes Datum: Ein Punkt gilt ab der ersten Inbetriebnahme einer Einheit seiner ' +
  'Lokation, als registriert mit ihrer ersten Registrierung; er geht, wenn alle ihre Einheiten endgültig stillgelegt sind. ' +
  'Die angeschlossene Leistung wächst mit jeder Einheit, die in Betrieb geht. Ein Punkt zählt im Land und Kreis seiner ' +
  'Lokation; große Kraftwerke, nur mit dem Bundesland veröffentlicht, nicht im Kreis.';

const NETZ_NOTE =
  'Netzanschlusspunkte aus dem MaStR, jede Nacht aktualisiert, verortet über die Einheiten ihrer Lokation. ' +
  'Große Kraftwerke sind nur mit ihrem Bundesland veröffentlicht: sie zählen für das Land, nicht für einen Kreis.';

export const NETZ = {
  id: 'netz',
  basePath: '/netz',
  title: 'Netzanschlüsse',
  description:
    'Netzanschlusspunkte der Stromerzeugung im Marktstammdatenregister – je Spannungsebene, Netzbetreiber, Bundesland, ' +
    'Landkreis und Gemeinde.',
  ramp: RAMPS.rose,
  defaultGranularity: 'bundesland',
  // The row of the selection bar (SelectionBar): what is connected, its filter the Spannungsebene
  technologyLabel: 'Anschlüsse',
  technologies: [
    {
      id: 'stromerzeugung',
      label: 'Stromerzeugung',
      icon: Zap,
      // mrt.netz_region_stats: one row per Spannungsebene, the API sums the chosen (?spannung=…; ?ebene= is the map's
      // resolution)
      statsPath: '/netz/dashboard-stats',
      // What isn't on the map, per level and the chosen Spannungsebenen (the note at the map's bottom left)
      ohneOrtPath: '/netz/ohne-ort',
      granularities: REGION_LEVELS,
      subtypes: {
        param: 'spannung',
        label: 'Spannungsebene',
        options: [
          { id: 'hoechstspannung', label: 'Höchstspannung' },
          { id: 'hochspannung', label: 'Hochspannung' },
          { id: 'mittelspannung', label: 'Mittelspannung' },
          { id: 'niederspannung', label: 'Niederspannung' },
        ],
      },
      note: NETZ_NOTE,
    },
  ],
  // The points, and the power of their units
  metrics: [
    { id: 'total_units', quantity: 'anzahl', basis: 'absolut', legend: 'Netzanschlusspunkte', unit: 'Punkte', digits: 0 },
    { id: 'relative_area_units', quantity: 'anzahl', basis: 'flaeche', legend: 'Netzanschlusspunkte je Fläche', unit: 'je km²', digits: 2 },
    {
      id: 'relative_population_units',
      quantity: 'anzahl',
      basis: 'einwohner',
      legend: 'Netzanschlusspunkte je Einwohner',
      unit: 'je 1.000 Einw.',
      digits: 1,
    },
    { id: 'total_power', quantity: 'leistung', basis: 'absolut', legend: 'Angeschlossene Leistung', unit: 'MW', digits: 1 },
    { id: 'relative_area_power', quantity: 'leistung', basis: 'flaeche', legend: 'Leistung je Fläche', unit: 'kW/km²', digits: 1 },
    { id: 'relative_population_power', quantity: 'leistung', basis: 'einwohner', legend: 'Leistung je Einwohner', unit: 'kW/Einw.', digits: 2 },
  ],
  tooltipRows: [
    { key: 'total_units', label: 'Netzanschlusspunkte', digits: 0 },
    { key: 'total_power', label: 'Leistung', unit: 'MW', digits: 1 },
    { key: 'relative_area_units', label: 'je km²', digits: 2 },
    { key: 'relative_population_units', label: 'je 1.000 Einw.', digits: 1 },
  ],
  kpis: [
    { id: 'points', kind: 'sum', field: 'total_units', label: 'Netzanschlusspunkte', icon: Zap },
    { id: 'power', kind: 'sum', field: 'total_power', format: 'power', label: 'Angeschlossene Leistung', icon: Gauge },
    // Points whose first unit went into operation in the last 12 months (added_12m_units of mrt.netz_region_stats)
    { id: 'new', kind: 'sum', field: 'added_12m_units', label: 'Neu (12 Monate)', icon: TrendingUp },
    { id: 'planned', kind: 'sum', field: 'planned_units', label: 'In Planung', icon: Construction },
  ],
  // The page Zubau & Registrierungen (mrt.netz_zubau_regions) and the page Spannungsebenen & Netzbetreiber, in the scope
  // (mrt.netz_anschluesse)
  analyses: [
    {
      id: 'timeline',
      title: 'Neue Netzanschlüsse im Zeitverlauf',
      icon: ChartColumnIncreasing,
      view: 'zubau',
      timeline: {
        path: '/zubau/zeitverlauf',
        since: 2000,
        measures: [
          { id: 'leistung', label: 'Leistung', unit: 'MW', quantity: 'angeschlossene Leistung', series: netzSeries() },
          { id: 'punkte', label: 'Anschlusspunkte', unit: 'Punkte', quantity: 'Netzanschlusspunkte', series: netzSeries('_punkte') },
        ],
        note: NETZ_ZUBAU_NOTE,
      },
    },
    registrationsOf(netzSeries(), {
      stacked: true,
      units: 'Netzanschlusspunkte',
      note:
        'Ein Netzanschlusspunkt hat im MaStR kein eigenes Registrierungsdatum: Er gilt als registriert mit der ersten ' +
        'Einheit seiner Lokation – ob sie in Betrieb, geplant oder stillgelegt ist.',
    }),
    {
      id: 'netzebenen',
      title: 'Netzanschlüsse je Netzebene',
      kind: 'netzebenen',
      view: 'spannungsebenen',
      path: '/netz/ebenen',
      icon: Layers,
      note: NETZ_NOTE,
    },
    {
      id: 'netzbetreiber',
      title: 'Netzbetreiber',
      kind: 'netzbetreiber',
      view: 'spannungsebenen',
      path: '/netz/netzbetreiber',
      icon: Trophy,
      note: NETZ_NOTE,
    },
  ],
};

export const NUMERIC_FIELDS = [
  'total_units',
  'relative_area_units',
  'relative_population_units',
  'added_12m_units',
  'planned_units',
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
