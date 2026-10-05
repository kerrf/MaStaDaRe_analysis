import { BatteryCharging, Sun } from 'lucide-react';
import { formatAmountFine, formatFixed, formatNumber, formatPercent } from '../lib/format';

// The page Landkreis/Gemeinde of a dashboard (KommuneView.jsx): one technology of it in a Landkreis and its Gemeinden.
// Everything that differs between the technologies is here, the page itself only reads it:
//
//   technology: the technology of the dashboard (config/dashboards.js) whose statsPath the map and figures read
//   size:       the field that measures an area (largest Gemeinden, share of the Kreis, the table's bar) and its unit
//   metrics:    what the map can shade the Gemeinden by; count: a number of units (no unit after it)
//   figures:    the panel left of the map: field, how to write it, and what to add – its share of the whole it lies in
//               (share), against the average of that whole and of Germany (compare: the density's sums, of/per), its
//               rank among its peers (rank), its growth over the Bestand before (growthOf)
//   split:      how the area's size splits into its kinds (Solar: Gebäude/Freifläche; batteries: Heim/Gewerbe/Groß)
//   timeline:   Zubau and Bestand per year in the area, the series stacked, in one or more measures
//   analyses:   the cards below the timeline
//   goals:      the block of key figures against targets or comparisons (KommuneTargets / KommuneStorage)
//   table:      the columns of the table of all Gemeinden; csv: a row of its export

const mw = (v) => formatAmountFine(v, 'MW');
const mwh = (v) => formatAmountFine(v, 'MWh');

export const KOMMUNE = {
  erzeuger: {
    technology: 'solar',
    icon: Sun,
    noun: 'Solaranlagen',
    unitsLabel: 'Anlagen',
    finderLead: 'Solaranlagen eines Landkreises und seiner Gemeinden: auf der Karte, in Kennzahlen mit Rang und Vergleich, im Zubau je Jahr.',
    // Solar's filters (Anlagenart, Leistung) above the page
    filters: true,
    size: { field: 'total_power', unit: 'MW', format: mw },
    metrics: [
      { id: 'total_power', label: 'Leistung', legend: 'Installierte Leistung', unit: 'MW', digits: 1 },
      { id: 'relative_population_power', label: 'je Einwohner', legend: 'Leistung je Einwohner', unit: 'kW/Einw.', digits: 2 },
      { id: 'relative_area_power', label: 'je km²', legend: 'Leistung je Fläche', unit: 'kW/km²', digits: 0 },
      { id: 'added_12m_power', label: 'Zubau 12 Monate', legend: 'Zubau der letzten 12 Monate', unit: 'MW', digits: 1 },
      { id: 'total_units', label: 'Anlagen', legend: 'Anlagen in Betrieb', unit: 'Anlagen', digits: 0, count: true },
    ],
    figures: [
      { field: 'total_power', label: 'Installierte Leistung', format: mw, share: true, rank: true },
      { field: 'total_units', label: 'Anlagen in Betrieb', format: (v) => formatNumber(v), rank: true },
      {
        field: 'relative_population_power',
        label: 'Leistung je Einwohner',
        format: (v) => `${formatNumber(v, 2)} kW`,
        compare: { of: 'total_power', per: 'einwohner' },
        rank: true,
      },
      {
        field: 'relative_area_power',
        label: 'Leistung je km²',
        format: (v) => `${formatNumber(v, 0)} kW`,
        compare: { of: 'total_power', per: 'qkm' },
        rank: true,
      },
      { field: 'added_12m_power', label: 'Zubau der letzten 12 Monate', format: mw, growthOf: 'total_power' },
    ],
    // From the Freifläche alone (the stats with anlagenart=freiflaeche): Gebäude is the rest. Only while both are chosen.
    split: {
      kind: 'freiflaeche',
      title: 'Gebäude und Freifläche',
      series: [
        { id: 'gebaeude', label: 'Gebäude', color: 'var(--series-solar)' },
        { id: 'freiflaeche', label: 'Freifläche', color: 'var(--series-freiflaeche)' },
      ],
    },
    timeline: {
      path: '/solar/zubau',
      key: 'anlagenart',
      // The page's selection (Anlagenart, Leistung) goes with it
      withSelection: true,
      series: [
        { id: 'gebaeude', label: 'Gebäude', color: 'var(--series-solar)' },
        { id: 'freiflaeche', label: 'Freifläche', color: 'var(--series-freiflaeche)' },
      ],
      measures: [{ id: 'leistung', label: 'Leistung', added: 'added', installed: 'installed', unit: 'MW', quantity: 'Solarleistung' }],
      note: 'Bestand: in Betrieb am Jahresende, endgültig stillgelegte Anlagen abgezogen; Anlagen vor 2000 zählen in den Bestand.',
    },
    analyses: [
      { id: 'ausrichtung', title: 'Ausrichtung', subtitle: 'Leistung nach Hauptausrichtung der Module', path: '/solar/orientation' },
      { id: 'groesse', title: 'Anlagengröße', subtitle: 'Leistung und Anlagen je Leistungsklasse', path: '/solar/size-distribution', measure: 'power' },
    ],
    goals: 'solar',
    table: [
      { id: 'einwohner', label: 'Einwohner', format: (v) => formatNumber(v) },
      { id: 'total_units', label: 'Anlagen', format: (v) => formatNumber(v) },
      { id: 'total_power', label: 'Leistung (MW)', format: (v) => formatFixed(v, 1), bar: true },
      { id: 'relative_population_power', label: 'je Einw. (kW)', format: (v) => formatFixed(v, 2) },
      { id: 'relative_area_power', label: 'je km² (kW)', format: (v) => formatNumber(v, 0) },
      { id: 'added_12m_power', label: 'Zubau 12 Mon. (MW)', format: (v) => formatFixed(v, 1) },
      { id: 'share', label: 'Anteil am Kreis', format: (v) => formatPercent(v) },
    ],
    csv: (r) => ({
      gemeindeschluessel: r.ags,
      gemeinde: r.name,
      einwohner: r.einwohner,
      anlagen: r.total_units,
      leistung_mw: r.total_power,
      leistung_je_einwohner_kw: r.relative_population_power,
      leistung_je_km2_kw: r.relative_area_power,
      zubau_12_monate_mw: r.added_12m_power,
    }),
  },

  speicher: {
    technology: 'batterie',
    icon: BatteryCharging,
    noun: 'Batteriespeicher',
    unitsLabel: 'Speicher',
    finderLead:
      'Batteriespeicher eines Landkreises und seiner Gemeinden – vom Heim- bis zum Großspeicher: auf der Karte, in Kennzahlen mit Rang und Vergleich, im Zubau je Jahr.',
    filters: false,
    size: { field: 'total_capacity', unit: 'MWh', format: mwh },
    metrics: [
      { id: 'total_capacity', label: 'Kapazität', legend: 'Speicherkapazität', unit: 'MWh', digits: 1 },
      { id: 'total_power', label: 'Leistung', legend: 'Speicherleistung', unit: 'MW', digits: 1 },
      { id: 'relative_population_capacity', label: 'je Einwohner', legend: 'Kapazität je Einwohner', unit: 'kWh/Einw.', digits: 2 },
      { id: 'added_12m_capacity', label: 'Zubau 12 Monate', legend: 'Zubau der letzten 12 Monate', unit: 'MWh', digits: 1 },
      { id: 'total_units', label: 'Speicher', legend: 'Speicher in Betrieb', unit: 'Speicher', digits: 0, count: true },
    ],
    figures: [
      { field: 'total_capacity', label: 'Speicherkapazität', format: mwh, share: true, rank: true },
      { field: 'total_power', label: 'Speicherleistung', format: mw, rank: true },
      { field: 'total_units', label: 'Speicher in Betrieb', format: (v) => formatNumber(v), rank: true },
      {
        field: 'relative_population_capacity',
        label: 'Kapazität je Einwohner',
        format: (v) => `${formatNumber(v, 2)} kWh`,
        compare: { of: 'total_capacity', per: 'einwohner' },
        rank: true,
      },
      { field: 'added_12m_capacity', label: 'Zubau der letzten 12 Monate', format: mwh, growthOf: 'total_capacity' },
    ],
    // The Bestand of the size classes at the end of the latest year (mrt.battery_zubau_regions)
    split: {
      kind: 'zubau',
      title: 'Heim-, Gewerbe- und Großspeicher',
      field: 'installed_capacity',
      series: [
        { id: 'heimspeicher', label: 'Heimspeicher', color: 'var(--series-heimspeicher)' },
        { id: 'gewerbespeicher', label: 'Gewerbespeicher', color: 'var(--series-gewerbespeicher)' },
        { id: 'grossspeicher', label: 'Großspeicher', color: 'var(--series-grossspeicher)' },
      ],
    },
    timeline: {
      path: '/battery/zubau',
      key: 'size_class',
      withSelection: false,
      // Stacked like the Germany-wide timeline of the Speicher: Großspeicher at the bottom
      series: [
        { id: 'grossspeicher', label: 'Großspeicher', color: 'var(--series-grossspeicher)' },
        { id: 'gewerbespeicher', label: 'Gewerbespeicher', color: 'var(--series-gewerbespeicher)' },
        { id: 'heimspeicher', label: 'Heimspeicher', color: 'var(--series-heimspeicher)' },
      ],
      measures: [
        { id: 'kapazitaet', label: 'Kapazität', added: 'added_capacity', installed: 'installed_capacity', unit: 'MWh', quantity: 'Speicherkapazität' },
        { id: 'leistung', label: 'Leistung', added: 'added_power', installed: 'installed_power', unit: 'MW', quantity: 'Speicherleistung' },
      ],
      note:
        'Bestand: in Betrieb am Jahresende, endgültig stillgelegte Speicher abgezogen; Speicher vor 2013 zählen in den Bestand. ' +
        'Größenklassen wie battery-charts.de: Heimspeicher unter 30 kWh und 30 kW, Großspeicher ab 1 MWh oder 1 MW. Speicher ' +
        'mit unplausibler Kapazität (unter 6 Minuten oder über 12 Stunden Volllast) sind nicht enthalten.',
    },
    analyses: [
      {
        id: 'groesse',
        title: 'Speichergröße',
        subtitle: 'Kapazität und Anzahl der Speicher je Größenklasse (Kapazität der Speicheranlage)',
        path: '/battery/size-distribution',
        measure: 'capacity',
      },
    ],
    goals: 'storage',
    table: [
      { id: 'einwohner', label: 'Einwohner', format: (v) => formatNumber(v) },
      { id: 'total_units', label: 'Speicher', format: (v) => formatNumber(v) },
      { id: 'total_capacity', label: 'Kapazität (MWh)', format: (v) => formatFixed(v, 1), bar: true },
      { id: 'total_power', label: 'Leistung (MW)', format: (v) => formatFixed(v, 1) },
      { id: 'relative_population_capacity', label: 'je Einw. (kWh)', format: (v) => formatFixed(v, 2) },
      { id: 'added_12m_capacity', label: 'Zubau 12 Mon. (MWh)', format: (v) => formatFixed(v, 1) },
      { id: 'share', label: 'Anteil am Kreis', format: (v) => formatPercent(v) },
    ],
    csv: (r) => ({
      gemeindeschluessel: r.ags,
      gemeinde: r.name,
      einwohner: r.einwohner,
      speicher: r.total_units,
      kapazitaet_mwh: r.total_capacity,
      leistung_mw: r.total_power,
      kapazitaet_je_einwohner_kwh: r.relative_population_capacity,
      zubau_12_monate_mwh: r.added_12m_capacity,
    }),
  },
};
