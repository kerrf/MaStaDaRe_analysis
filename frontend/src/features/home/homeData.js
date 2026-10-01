// What the start page reads: the dashboards' own endpoints, so it shows the same numbers as they do
import { ERZEUGER, SPEICHER } from '../../config/dashboards';
import { API_BASE_URL } from '../../config/site';
import { statsUrl } from '../../lib/data';

const technology = (config, id) => config.technologies.find((t) => t.id === id);
export const ERZEUGER_TIMELINE = ERZEUGER.analyses.find((a) => a.timeline).timeline;
export const SPEICHER_TIMELINE = SPEICHER.analyses.find((a) => a.timeline).timeline;

// The API series a timeline series shows by default (solar: Netto)
export const sourceOf = (series) => series.netto ?? series.id;

export const URLS = {
  solar: statsUrl(technology(ERZEUGER, 'solar').statsPath, 'bundesland'),
  wind: statsUrl(technology(ERZEUGER, 'wind').statsPath, 'bundesland'),
  batteries: statsUrl(technology(SPEICHER, 'batterie').statsPath, 'bundesland'),
  gasStorages: `${API_BASE_URL}/gas/speicher`,
  // Zubau per year of both timelines in one request
  zubau: `${API_BASE_URL}/zubau/zeitverlauf?yearly=true&${[...ERZEUGER_TIMELINE.series, ...SPEICHER_TIMELINE.series]
    .map((s) => `technology=${sourceOf(s)}`)
    .join('&')}`,
};

export const sum = (rows, field) => rows.reduce((total, row) => total + (row[field] ?? 0), 0);

// The installed battery capacity (MWh): the Bestand of the size classes at the end of the latest year
export function batteryCapacity(zubauRows) {
  const ids = new Set(SPEICHER_TIMELINE.series.map(sourceOf));
  const rows = zubauRows.filter((row) => ids.has(row.technology));
  const latest = Math.max(...rows.map((row) => row.year));
  return sum(
    rows.filter((row) => row.year === latest),
    'installed',
  );
}
