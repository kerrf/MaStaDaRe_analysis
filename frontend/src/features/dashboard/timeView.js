import { useState } from 'react';

// A time series by year or month, Germany-wide: Ausbau im Zeitverlauf (TimelineAnalysis) and Registrierungen
// (RegistrationsAnalysis). Their views hold a row per series and month and, with month null, per year; these helpers
// index the rows and build the periods the chart shows, TimeControls (beside) chooses them.

export const MONTHS = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];

// vergleich: the months of a few years side by side (Jan … Dez on the axis, a column per year), the Zubau only
export const TIME_VIEWS = [
  { id: 'jahr', label: 'Jährlich' },
  { id: 'monat', label: 'Monatlich' },
  { id: 'vergleich', label: 'Jahresvergleich' },
];
// The most years a Jahresvergleich shows side by side
export const MAX_COMPARED = 6;
// The months shown: the last 12, all since the first year, or one year ("2025")
export const LAST_12 = 'letzte-12';
export const ALL = 'alle';

const periodKey = (year, month) => (month ? `${year}-${month}` : String(year));
const monthIndex = (year, month) => year * 12 + month - 1;

/**
 * The choices of a time chart: Jährlich, Monatlich or Jahresvergleich; the years shown (from–to, null: all; `years` to
 * start with another span), the months, or the years compared (from–to, null: the last three); aggregiert (the Bestand,
 * what was there at the end of each period, instead of what came in it) as bars or a curve – not in the Jahresvergleich,
 * which compares the Zubau: one switches the other off (aggregiert on goes back to Monatlich)
 */
export function useTimeView({ years: initialYears = null } = {}) {
  const [view, setView] = useState('jahr');
  const [range, setRange] = useState(LAST_12);
  const [years, setYears] = useState(initialYears);
  const [compared, setCompared] = useState(null);
  const [aggregiert, setAggregiert] = useState(false);
  const [style, setStyle] = useState('balken');
  return {
    view,
    // The Jahresvergleich compares the Zubau: choosing it switches aggregiert off
    setView: (next) => {
      setView(next);
      if (next === 'vergleich') setAggregiert(false);
    },
    range,
    setRange,
    years,
    setYears,
    compared,
    setCompared,
    aggregiert,
    setAggregiert: (on) => {
      setAggregiert(on);
      if (on) setView((current) => (current === 'vergleich' ? 'monat' : current));
    },
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

// The current month: where a chart of dates ahead (planned units) starts, instead of at its latest data
export const thisMonth = () => {
  const today = new Date();
  return { year: today.getFullYear(), month: today.getMonth() + 1 };
};

// The years a Jahresvergleich shows: the chosen ones within the data, else the last three – or, for dates ahead (now:
// the current month), this year and the next two
export function comparedSpan(compared, since, latestYear, now = null) {
  const [from, to] = compared ?? (now ? [now.year, now.year + 2] : [latestYear - 2, latestYear]);
  return [Math.max(from, since), Math.min(to, latestYear)];
}

const SHORT_MONTHS = MONTHS.map((name) => name.slice(0, 3));

/**
 * The Jahresvergleich: a category per month (Jan … Dez) with a value per year compared – the Zubau of the series shown,
 * added up (null where a month hasn't come yet) – and the years, the latest one's months marked as partial up to the
 * latest month (not for dates ahead, now: the current month). valueKey: the Zubau field of a row ("added", "units")
 */
export function buildComparison({ byPeriod, latest }, [from, to], series, valueKey, now = null) {
  const years = Array.from({ length: to - from + 1 }, (_, i) => from + i);
  const months = MONTHS.map((name, i) => {
    const month = i + 1;
    const values = {};
    for (const year of years) {
      const rows = byPeriod.get(periodKey(year, month));
      const found = series.map((s) => rows?.[s.id]?.[valueKey]).filter((v) => v != null);
      values[year] = found.length ? found.reduce((total, v) => total + v, 0) : null;
    }
    return {
      key: String(month),
      label: SHORT_MONTHS[i],
      title: name,
      values,
      partial: Object.fromEntries(years.map((year) => [year, !now && year === latest.year && month === latest.month])),
    };
  });
  // start: for dates ahead, the month they start from (its year reads "ab Oktober")
  return { years, months, latest: now ? null : latest, start: now };
}

/**
 * The periods of the chart. time: the choices (useTimeView); fields: the value of a row per measure, e.g.
 * { zubau: 'added', bestand: 'installed' }; since: the first year of the series. now: for dates ahead (planned units)
 * the current month – the months shown start there ("Nächste 12 Monate"), and no period is the running one.
 */
export function buildPeriods({ byPeriod, latest }, time, series, since, fields, now = null) {
  const { view, range, years, measure } = time;
  const bestand = measure === 'bestand';
  const valueKey = fields[measure];
  // The running period, drawn light: the latest data's (none for dates ahead)
  const running = now ? null : latest;
  const period = (year, month, label, tick) => ({
    key: periodKey(year, month),
    label,
    tick,
    partial: Boolean(running) && year === running.year && (!month || month === running.month),
    values: Object.fromEntries(series.map((s) => [s.id, byPeriod.get(periodKey(year, month))?.[s.id]?.[valueKey] ?? null])),
  });

  if (view === 'jahr') {
    const [from, to] = yearSpan(years, since, latest.year);
    return Array.from({ length: to - from + 1 }, (_, i) => {
      const year = from + i;
      const current = !now && year === latest.year;
      // Dates ahead: this year's from the current month on
      const label = bestand
        ? current ? `Stand ${MONTHS[latest.month - 1]} ${year}` : `Ende ${year}`
        : current
          ? `${year} (bis ${MONTHS[latest.month - 1]})`
          : now && year === now.year
            ? `${year} (ab ${MONTHS[now.month - 1]})`
            : String(year);
      return period(year, null, label, String(year));
    });
  }

  const last = monthIndex(latest.year, latest.month);
  const start = now && monthIndex(now.year, now.month);
  const [first, end] =
    range === LAST_12
      ? now
        ? [start, start + 11]
        : [last - 11, last]
      : range === ALL
        ? [now ? start : monthIndex(since, 1), last]
        : [monthIndex(Number(range), 1), monthIndex(Number(range), 12)];
  return Array.from({ length: end - first + 1 }, (_, i) => {
    const [year, month] = [Math.floor((first + i) / 12), ((first + i) % 12) + 1];
    const name = `${MONTHS[month - 1]} ${year}`;
    const isLatest = !now && first + i === last;
    const label = bestand ? (isLatest ? `${name} (aktueller Stand)` : `Ende ${name}`) : isLatest ? `${name} (laufend)` : name;
    const short = MONTHS[month - 1].slice(0, 3);
    const tick = range === LAST_12 ? `${short} ${String(year).slice(2)}` : range === ALL ? (month === 1 ? String(year) : null) : short;
    return period(year, month, label, tick);
  });
}

// The part of a CSV's file name that says what it shows: "jaehrlich-2010-2020", "monatlich-letzte-12" (now: for dates
// ahead, "monatlich-naechste-12")
export const timeSlug = (time, since, latestYear, now = null) => {
  if (time.view === 'monat') return `monatlich-${now && time.range === LAST_12 ? 'naechste-12' : time.range}`;
  if (time.view === 'vergleich') return `jahresvergleich-${comparedSpan(time.compared, since, latestYear, now).join('-')}`;
  if (!time.years) return 'jaehrlich';
  const [from, to] = yearSpan(time.years, since, latestYear);
  return `jaehrlich-${from}-${to}`;
};

/**
 * The series a chart can show, those with `hidden: true` off at first (Ausbau: Wasserkraft; Registrierungen: all but
 * Solar). Returns the ids switched off and the toggle of one, for SeriesLegend.jsx.
 */
export function useHiddenSeries(series) {
  const [hidden, setHidden] = useState(() => new Set(series.filter((s) => s.hidden).map((s) => s.id)));
  const toggle = (id) =>
    setHidden((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  return [hidden, toggle];
}
