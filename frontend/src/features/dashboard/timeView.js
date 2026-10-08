import { useState } from 'react';

// A time series by year or month, Germany-wide: Ausbau im Zeitverlauf (TimelineAnalysis) and Registrierungen
// (RegistrationsAnalysis). Their views hold a row per series and month and, with month null, per year; these helpers
// index the rows and build the periods the chart shows, TimeControls (beside) chooses them.

export const MONTHS = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];

export const TIME_VIEWS = [
  { id: 'jahr', label: 'Jährlich' },
  { id: 'monat', label: 'Monatlich' },
];
// The months shown: the last 12, all since the first year, or one year ("2025")
export const LAST_12 = 'letzte-12';
export const ALL = 'alle';

const periodKey = (year, month) => (month ? `${year}-${month}` : String(year));
const monthIndex = (year, month) => year * 12 + month - 1;

/**
 * The choices of a time chart: Jährlich or Monatlich; the years shown (from–to, null: all) or the months; aggregiert
 * (the Bestand, what was there at the end of each period, instead of what came in it) as bars or a curve
 */
export function useTimeView() {
  const [view, setView] = useState('jahr');
  const [range, setRange] = useState(LAST_12);
  const [years, setYears] = useState(null);
  const [aggregiert, setAggregiert] = useState(false);
  const [style, setStyle] = useState('balken');
  return {
    view,
    setView,
    range,
    setRange,
    years,
    setYears,
    aggregiert,
    setAggregiert,
    style,
    setStyle,
    measure: aggregiert ? 'bestand' : 'zubau',
    isCurve: aggregiert && style === 'kurve',
  };
}

/**
 * The rows by period ("2025" for the year, "2025-7" for July) and series (seriesOf: the series of a row's technology),
 * and the latest month
 */
export function indexRows(rows, seriesOf) {
  const byPeriod = new Map();
  let latest = -Infinity;
  for (const row of rows) {
    const key = periodKey(row.year, row.month);
    if (!byPeriod.has(key)) byPeriod.set(key, {});
    byPeriod.get(key)[seriesOf.get(row.technology) ?? row.technology] = row;
    if (row.month) latest = Math.max(latest, monthIndex(row.year, row.month));
  }
  if (latest === -Infinity) return null;
  return { byPeriod, latest: { year: Math.floor(latest / 12), month: (latest % 12) + 1 } };
}

// The years a yearly view shows: the chosen ones within the data, else every year since `since`
export function yearSpan(years, since, latestYear) {
  const [from, to] = years ?? [since, latestYear];
  return [Math.max(from, since), Math.min(to, latestYear)];
}

/**
 * The periods of the chart. time: the choices (useTimeView); fields: the value of a row per measure, e.g.
 * { zubau: 'added', bestand: 'installed' }; since: the first year of the series
 */
export function buildPeriods({ byPeriod, latest }, time, series, since, fields) {
  const { view, range, years, measure } = time;
  const bestand = measure === 'bestand';
  const valueKey = fields[measure];
  const period = (year, month, label, tick) => ({
    key: periodKey(year, month),
    label,
    tick,
    partial: year === latest.year && (!month || month === latest.month),
    values: Object.fromEntries(series.map((s) => [s.id, byPeriod.get(periodKey(year, month))?.[s.id]?.[valueKey] ?? null])),
  });

  if (view === 'jahr') {
    const [from, to] = yearSpan(years, since, latest.year);
    return Array.from({ length: to - from + 1 }, (_, i) => {
      const year = from + i;
      const current = year === latest.year;
      const label = bestand
        ? current ? `Stand ${MONTHS[latest.month - 1]} ${year}` : `Ende ${year}`
        : current ? `${year} (bis ${MONTHS[latest.month - 1]})` : String(year);
      return period(year, null, label, String(year));
    });
  }

  const last = monthIndex(latest.year, latest.month);
  const [first, end] =
    range === LAST_12
      ? [last - 11, last]
      : range === ALL
        ? [monthIndex(since, 1), last]
        : [monthIndex(Number(range), 1), monthIndex(Number(range), 12)];
  return Array.from({ length: end - first + 1 }, (_, i) => {
    const [year, month] = [Math.floor((first + i) / 12), ((first + i) % 12) + 1];
    const name = `${MONTHS[month - 1]} ${year}`;
    const isLatest = first + i === last;
    const label = bestand ? (isLatest ? `${name} (aktueller Stand)` : `Ende ${name}`) : isLatest ? `${name} (laufend)` : name;
    const short = MONTHS[month - 1].slice(0, 3);
    const tick = range === LAST_12 ? `${short} ${String(year).slice(2)}` : range === ALL ? (month === 1 ? String(year) : null) : short;
    return period(year, month, label, tick);
  });
}

// The part of a CSV's file name that says what it shows: "jaehrlich-2010-2020", "monatlich-letzte-12"
export const timeSlug = (time, since, latestYear) => {
  if (time.view === 'monat') return `monatlich-${time.range}`;
  if (!time.years) return 'jaehrlich';
  const [from, to] = yearSpan(time.years, since, latestYear);
  return `jaehrlich-${from}-${to}`;
};
