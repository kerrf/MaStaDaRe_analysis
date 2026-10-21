import { API_BASE_URL } from '../../config/site';

// The map in time (backend routers/karte.py, mrt.karte_zeit): besides the Bestand of today (the dashboard-stats), what
// stood at the end of a year or month, what came in it, what was shut down in it, and what is planned. The URL keeps
// the Kennzahl (?wert=, default bestand) and the period (?zeit=2024 or ?zeit=2024-05; none: the Datenstand's year).
export const WERTE = [
  { id: 'bestand', label: 'Bestand', title: 'Was am Ende des Zeitraums in Betrieb war' },
  { id: 'zubau', label: 'Zubau', title: 'Was im Zeitraum in Betrieb ging' },
  { id: 'stilllegung', label: 'Stilllegungen', title: 'Was im Zeitraum endgültig stillgelegt wurde' },
  { id: 'geplant', label: 'In Planung', title: 'Alles, was heute in Planung ist – ohne Zeitraum' },
];
export const FIRST_YEAR = 2000;

export const MONTHS = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];

// The newest period with data: the Datenstand's month ('2026-10-04' → 2026, 10)
export function latestOf(datenstand) {
  const [year, month] = String(datenstand).split('-').map(Number);
  return { jahr: year, monat: month };
}

/**
 * The period of the URL (?zeit=), checked against what there is: { raster: 'jahr' | 'monat', jahr, monat (or null),
 * explicit: whether the URL chose one }. None or an unknown one: the newest year.
 */
export function periodOf(param, latest) {
  const match = /^(\d{4})(?:-(\d{2}))?$/.exec(param ?? '');
  const jahr = match ? Number(match[1]) : NaN;
  const monat = match?.[2] ? Number(match[2]) : null;
  const inRange =
    jahr >= FIRST_YEAR && jahr <= latest.jahr && (monat == null || (monat >= 1 && monat <= 12 && (jahr < latest.jahr || monat <= latest.monat)));
  if (!inRange) return { raster: 'jahr', jahr: latest.jahr, monat: null, explicit: false };
  return { raster: monat ? 'monat' : 'jahr', jahr, monat, explicit: true };
}

export const periodParam = ({ jahr, monat }) => (monat ? `${jahr}-${String(monat).padStart(2, '0')}` : String(jahr));

// The period in words: "2024", "Mai 2024"
export const periodLabel = ({ jahr, monat }) => (monat ? `${MONTHS[monat - 1]} ${jahr}` : String(jahr));

// Whether the period is still running (the Datenstand's year, or its month): its Bestand is the one of the Datenstand
const isRunning = (period, latest) => period.jahr === latest.jahr && (!period.monat || period.monat === latest.monat);

/**
 * What the map shows, in words, from the metric's own name ("Installierte Leistung", "Leistung je Fläche"):
 *   Bestand      "Installierte Leistung Ende 2024", "… Ende Mai 2024"; a running period: "…, Stand Oktober 2026"
 *   Zubau        "Zubau im Jahr 2024 – Leistung", "Zubau im Mai 2024 – Leistung je Fläche"
 *   Stilllegung  "Stilllegungen im Jahr 2024 – Leistung"
 *   In Planung   "In Planung – Leistung"
 * Without a chosen period, the Bestand keeps the metric's name: the map of today.
 */
export function legendOf(metricLegend, wert, period, latest) {
  const base = metricLegend.replace(/^Installierte /, '');
  const word = base.charAt(0).toUpperCase() + base.slice(1);
  const within = period.monat ? `im ${periodLabel(period)}` : `im Jahr ${period.jahr}`;
  if (wert === 'geplant') return `In Planung – ${word}`;
  if (wert === 'zubau') return `Zubau ${within} – ${word}`;
  if (wert === 'stilllegung') return `Stilllegungen ${within} – ${word}`;
  if (!period.explicit) return metricLegend;
  if (isRunning(period, latest)) return `${metricLegend}, Stand ${MONTHS[latest.monat - 1]} ${latest.jahr}`;
  return `${metricLegend} Ende ${periodLabel(period)}`;
}

// The request of the map in time, for the technology's selection (its ?anlagenart=, ?lage=, ?art=, ?leistung=…)
export function karteUrl(technology, apiLevel, wert, period, selectionQuery) {
  const params = new URLSearchParams({ level: apiLevel, kennzahl: wert });
  if (wert !== 'geplant') {
    params.set('jahr', period.jahr);
    if (period.monat) params.set('monat', period.monat);
  }
  return `${API_BASE_URL}/karte/${technology.zeit}?${params}${selectionQuery ? `&${selectionQuery}` : ''}`;
}
