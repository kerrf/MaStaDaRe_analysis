import { TARGETS, neededPerYear, yearsLeft } from '../../../config/targets';
import { formatCapacity, formatNumber, formatPercent, formatPower, formatShare } from '../../../lib/format';

// What the page counts of a technology unless its `overview.measure` says otherwise (the batteries: their capacity)
export const POWER = { format: 'power', label: 'Installierte Leistung' };

const MAIN_GOAL = 2030; // the target year the page measures against, where a technology has one
const MINOR = 0.01; // a Zubau below 1 % of the Bestand a year (a twelfth of it a month) is hardly any
export const CHART_YEARS = 15; // the Zubau per year: the year chosen and the fourteen before

export const MONTHS = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];
const MONTHS_SHORT = ['Jan.', 'Feb.', 'März', 'Apr.', 'Mai', 'Juni', 'Juli', 'Aug.', 'Sept.', 'Okt.', 'Nov.', 'Dez.'];
const MONTH_TICKS = ['Jan', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez'];

// Power in MW (from 1,000 in GW), capacity in MWh (GWh) – below 1 in kW or kWh, so a small Kreis doesn't read "0 MW"
export const formatOf = (format) => (value) => {
  if (value > 0 && value < 1) return { value: formatNumber(value * 1000, value < 0.01 ? 1 : 0), unit: format === 'capacity' ? 'kWh' : 'kW' };
  return format === 'capacity' ? formatCapacity(value) : formatPower(value);
};
export const joined = ({ value, unit }) => `${value} ${unit}`.trim();

// Shares below 1 % with two decimals: "0,37 %", not "0,4 %"
export const percent = (share) => (share > 0 && share < 0.01 ? `${formatNumber(share * 100, 2)} %` : formatShare(share));
// A change as "+12 %" or "−8 %"
export const signed = (change) => `${change > 0 ? '+' : change < 0 ? '−' : '±'}${formatPercent(Math.abs(change))}`;

// ------------------------------------------------------------------------------------------------------- Periods
// A period: a year, or a month of it ({ year, month: 1–12 }). Its key among the rows of a series: "2026", "2026-3".
export const keyOf = ({ year, month }) => (month ? `${year}-${month}` : String(year));
// The period whose end is this one's start: the month before (for January the year before), the year before
const startOf = ({ year, month }) => (month > 1 ? { year, month: month - 1 } : { year: year - 1, month: null });
// The last day of a period as an ISO date
const lastDayOf = ({ year, month }) => {
  const day = new Date(Date.UTC(year, month || 12, 0));
  return day.toISOString().slice(0, 10);
};

/** The period's name: "2026", "März 2025". */
export const periodName = ({ year, month }) => (month ? `${MONTHS[month - 1]} ${year}` : String(year));
/** What a period's numbers refer to: "heute", "Ende 2025", "Ende März 2025". */
export const asOfName = (model) => (model.running ? 'heute' : `Ende ${periodName(model.period)}`);
/** The period in a sentence: "im Jahr 2026", "im März 2025". */
export const inPeriod = ({ period }) => (period.month ? `im ${periodName(period)}` : `im Jahr ${period.year}`);

/**
 * The period of the URL (?jahr=2025&monat=3), within what the series have: from their first year to their latest
 * month, the latest year if none (or an impossible one) is asked for.
 */
export function periodOf(searchParams, latest, firstYear) {
  const asked = Number(searchParams.get('jahr'));
  const year = asked >= firstYear && asked <= latest.year ? asked : latest.year;
  const month = Number(searchParams.get('monat'));
  const valid = Number.isInteger(month) && month >= 1 && month <= (year === latest.year ? latest.month : 12);
  return { year, month: valid ? month : null };
}

// --------------------------------------------------------------------------------------------------- The series
/** The rows of /zubau/zeitverlauf (months and years) by series and period key. */
export function indexSeries(rows) {
  const out = new Map();
  for (const row of rows ?? []) {
    if (!out.has(row.technology)) out.set(row.technology, new Map());
    out.get(row.technology).set(keyOf(row), row);
  }
  return out;
}

/** The latest month of the series – the latest commissioning anywhere, where every series ends – and their first year. */
export function extentOf(rows) {
  let latest = null;
  let firstYear = Infinity;
  for (const row of rows ?? []) {
    firstYear = Math.min(firstYear, row.year);
    if (row.month != null && (!latest || row.year > latest.year || (row.year === latest.year && row.month > latest.month))) {
      latest = { year: row.year, month: row.month };
    }
  }
  return latest ? { latest, firstYear } : null;
}

/** The yearly rows of a series response (the planned units) by technology and year. */
export function byTechnology(rows) {
  const out = new Map();
  for (const row of rows ?? []) {
    if (row.month != null) continue;
    if (!out.has(row.technology)) out.set(row.technology, new Map());
    out.get(row.technology).set(row.year, row);
  }
  return out;
}

const FIELDS = ['added', 'added_units', 'installed', 'installed_units'];
// A part's values in a period: its series, less another where it has one (the Gebäude without the Balkonkraftwerke);
// nothing where the series has no row (before its first unit)
function valuesOf(index, series, minus, key) {
  const own = index.get(series)?.get(key);
  const less = minus ? index.get(minus)?.get(key) : null;
  return Object.fromEntries(FIELDS.map((f) => [f, Math.max(0, (own?.[f] ?? 0) - (less?.[f] ?? 0))]));
}
const addedIn = (index, parts, keys) =>
  parts.reduce((total, p) => total + keys.reduce((t, key) => t + valuesOf(index, p.series, p.minus, key).added, 0), 0);

// The Zubau of the period against the same period a year before. The running year by its complete months (the running
// one would make it look weak), the running month not at all. nowLabel, beforeLabel: what is compared ("Jan.–Sept.
// 2026", "2025"); vsLabel: the earlier one on its own ("Jan.–Sept. 2025"); span: the months of a running year in a
// sentence ("Januar bis September"), else none.
function changeOf(index, parts, period, latest, running, bestand) {
  if (running && period.month) return null;
  let now;
  let before;
  let nowLabel;
  let beforeLabel;
  let vsLabel;
  let span = null;
  if (running) {
    const months = latest.month - 1;
    if (months < 1) return null;
    const keys = (year) => Array.from({ length: months }, (_, i) => `${year}-${i + 1}`);
    [now, before] = [addedIn(index, parts, keys(period.year)), addedIn(index, parts, keys(period.year - 1))];
    const short = months === 1 ? 'Jan.' : `Jan.–${MONTHS_SHORT[months - 1]}`;
    [nowLabel, beforeLabel] = [`${short} ${period.year}`, String(period.year - 1)];
    span = months === 1 ? 'im Januar' : `von Januar bis ${MONTHS[months - 1]}`;
    vsLabel = `${short} ${period.year - 1}`;
  } else {
    const earlier = { year: period.year - 1, month: period.month };
    [now, before] = [addedIn(index, parts, [keyOf(period)]), addedIn(index, parts, [keyOf(earlier)])];
    [nowLabel, beforeLabel] = [periodName(period), periodName(earlier)];
    vsLabel = beforeLabel;
  }
  const minor = Math.max(now, before) < (MINOR * bestand) / (period.month ? 12 : 1);
  return { now, before, nowLabel, beforeLabel, vsLabel, span, minor, change: before > 0 && !minor ? (now - before) / before : null };
}

// ---------------------------------------------------------------------------------------------------- The model
/**
 * Everything the page shows of a technology in the scope and period, all from the monthly series of its parts
 * (overview.parts: { id, series, minus, also }):
 * - total and parts: the Bestand at the period's end (amount, units; batteries also their power), the Zubau in it, the
 *   Bestand at its start; the parts' shares and their Zubau relative to their Bestand at the start;
 * - change: the Zubau against the same period a year before;
 * - comparison: the share of the area above and the rank among its peers (/zubau/bestand);
 * - targets (Germany): the Bruttoleistung at the period's end against the national targets, and the pace;
 * - planned (the running period only): the units in planning.
 * The Zubau's chart besides: historyOf, trailingMonths, yearToDate.
 * Null when the scope had nothing of it by the period's end.
 */
export function pageModel({ overview, index, period, latest, datenstand, bestand, scope, geplant }) {
  const measure = overview.measure ?? POWER;
  const key = keyOf(period);
  const startKey = keyOf(startOf(period));
  const running = period.year === latest.year && (!period.month || period.month === latest.month);
  const present = overview.parts.filter((p) => index.has(p.series));
  if (!present.length) return null;

  const parts = present.map((part) => {
    const now = valuesOf(index, part.series, part.minus, key);
    const before = valuesOf(index, part.series, part.minus, startKey);
    const also = part.also ? valuesOf(index, part.also, null, key) : null;
    return {
      ...part,
      value: now.installed,
      units: now.installed_units,
      also: also?.installed ?? null,
      added: now.added,
      addedUnits: now.added_units,
      start: before.installed,
      startUnits: before.installed_units,
    };
  });
  const sum = (field) => parts.reduce((t, p) => t + (p[field] ?? 0), 0);
  const total = {
    value: sum('value'),
    units: sum('units'),
    also: parts.some((p) => p.also != null) ? sum('also') : null,
    added: sum('added'),
    addedUnits: sum('addedUnits'),
    start: sum('start'),
    startUnits: sum('startUnits'),
  };
  if (!(total.value > 0)) return null;
  total.removed = Math.max(0, total.start + total.added - total.value);
  total.growth = total.start > 0 ? (total.value - total.start) / total.start : null;
  total.avgSize = total.units > 0 ? (total.value * 1000) / total.units : null; // kW or kWh
  total.avgNew = total.addedUnits > 0 ? (total.added * 1000) / total.addedUnits : null;
  for (const p of parts) {
    p.shareValue = p.value / total.value;
    p.shareUnits = total.units > 0 ? p.units / total.units : 0;
    p.growthValue = p.start > 0 ? p.added / p.start : null;
    p.growthUnits = p.startUnits > 0 ? p.addedUnits / p.startUnits : null;
  }
  const change = changeOf(index, parts, period, latest, running, total.value);

  // The area among its peers at the period's end: its share of the area above and its rank (not for Germany)
  let comparison = null;
  const own = bestand?.find((r) => r.region === scope.key);
  if (own) {
    const above = bestand.find((r) => r.region === scope.parentKey);
    const peers = bestand.filter((r) => r.region !== scope.parentKey);
    const ranked = scope.kind !== 'de' && own.installed > 0;
    comparison = {
      share: ranked && above?.installed > 0 ? own.installed / above.installed : null,
      rank: ranked ? { rank: peers.filter((r) => r.installed > own.installed).length + 1, of: peers.length } : null,
    };
  }

  // Germany: the national targets in Bruttoleistung (overview.targets: target → its series) at the period's end, and
  // the pace of the last full year then against what the target needs from then on. A technology with one target
  // counts all its parts toward it, with several (wind) each its own.
  let targets = null;
  if (scope.kind === 'de' && overview.targets) {
    const end = running ? datenstand : lastDayOf(period);
    const paceYear = period.month || running ? period.year - 1 : period.year;
    targets = Object.entries(overview.targets)
      .map(([id, series]) => {
        const target = TARGETS[id];
        const installed = series.reduce((t, s) => t + (index.get(s)?.get(key)?.installed ?? 0), 0);
        const actual = series.reduce((t, s) => t + (index.get(s)?.get(String(paceYear))?.added ?? 0), 0);
        const ahead = Object.keys(target.goals)
          .map(Number)
          .filter((year) => year >= period.year);
        const goalYear = ahead.includes(MAIN_GOAL) ? MAIN_GOAL : ahead[0];
        if (!goalYear) return null;
        const milestoneYear = ahead.find((year) => year < goalYear);
        const needed = neededPerYear(installed, target.goals[goalYear], yearsLeft(end, goalYear));
        return {
          id,
          label: target.label,
          source: target.source,
          installed,
          goal: { year: goalYear, value: target.goals[goalYear] },
          milestone: milestoneYear && { year: milestoneYear, value: target.goals[milestoneYear] },
          pace: { year: paceYear, actual, needed, ratio: needed > 0 ? actual / needed : null },
        };
      })
      .filter(Boolean);
    if (!targets.length) targets = null;
  }

  // Planned (the running period only): the units "in Planung" of the register by their planned commissioning from
  // this month on – all of them up to the last year planned, how many, until when
  let planned = null;
  if (running && overview.planned && geplant) {
    const series = overview.planned.map((id) => geplant.get(id)).filter(Boolean);
    const rows = series.flatMap((s) => [...s.values()]);
    const yearsAhead = rows.filter((r) => r.added > 0).map((r) => r.year);
    planned = {
      value: series.reduce((t, s) => t + Math.max(0, ...[...s.values()].map((r) => r.installed ?? 0)), 0),
      units: rows.reduce((t, r) => t + (r.added_units ?? 0), 0),
      to: yearsAhead.length ? Math.max(...yearsAhead) : null,
    };
  }

  return { measure, period, start: startOf(period), latest, running, total, parts, change, comparison, targets, planned };
}

// ------------------------------------------------------------------------------------------------ The Zubau chart
// Months counted from year 0 ({ year, month } <-> year * 12 + month - 1)
const offsetOf = ({ year, month }) => year * 12 + month - 1;
const monthAt = (offset) => ({ year: Math.floor(offset / 12), month: (offset % 12) + 1 });
const monthKeys = (from, to) => Array.from({ length: Math.max(0, to - from + 1) }, (_, i) => keyOf(monthAt(from + i)));
const addedAt = (index, parts, key) => parts.reduce((t, p) => t + valuesOf(index, p.series, p.minus, key).added, 0);

/**
 * The Zubau per year up to the period's (the fourteen before it and itself, from the first year of the series on), in
 * total and per part. The period's year ends with the period: up to its month, the running year up to today.
 */
export function historyOf(model, index, firstYear) {
  const { period, parts } = model;
  const keysOf = (year) => (year === period.year && period.month ? monthKeys(offsetOf({ year, month: 1 }), offsetOf(period)) : [String(year)]);
  return Array.from({ length: CHART_YEARS }, (_, i) => period.year - CHART_YEARS + 1 + i)
    .filter((year) => year >= firstYear)
    .map((year) => {
      const byPart = Object.fromEntries(parts.map((p) => [p.id, { added: keysOf(year).reduce((t, key) => t + valuesOf(index, p.series, p.minus, key).added, 0) }]));
      return {
        year,
        key: String(year),
        partial: year === period.year && (model.running || Boolean(period.month && period.month < 12)),
        added: Object.values(byPart).reduce((t, v) => t + v.added, 0),
        parts: byPart,
      };
    });
}

/**
 * The Zubau of the 12 months up to the period's end (a year's: its December) per part, and their sum against the 12
 * months before them. A month still running (the latest) is no part of the sums: its bar comes after them, light.
 */
export function trailingMonths(model, index) {
  const { period, latest, parts } = model;
  const end = period.month ? period : period.year === latest.year ? latest : { year: period.year, month: 12 };
  const running = end.year === latest.year && end.month === latest.month;
  const last = offsetOf(end) - (running ? 1 : 0);
  const sumOf = (from, to) => monthKeys(from, to).reduce((t, key) => t + addedAt(index, parts, key), 0);
  const periods = Array.from({ length: 12 + (running ? 1 : 0) }, (_, i) => {
    const offset = last - 11 + i;
    const m = monthAt(offset);
    const isRunning = offset > last;
    return {
      key: keyOf(m),
      label: `${MONTHS[m.month - 1]} ${m.year}${isRunning ? ' (bis heute)' : ''}`,
      tick: MONTH_TICKS[m.month - 1],
      partial: isRunning,
      values: Object.fromEntries(parts.map((p) => [p.id, valuesOf(index, p.series, p.minus, keyOf(m)).added])),
    };
  });
  const [now, before] = [sumOf(last - 11, last), sumOf(last - 23, last - 12)];
  const [from, to] = [monthAt(last - 11), monthAt(last)];
  return {
    periods,
    now,
    before,
    change: before > 0 ? (now - before) / before : null,
    span: `${MONTHS_SHORT[from.month - 1]} ${from.year} – ${MONTHS_SHORT[to.month - 1]} ${to.year}`,
    // A past year: its 12 months are the year itself
    wholeYear: !period.month && !running ? period.year : null,
  };
}

/** A month's year up to it against the same months a year before ("Jan.–März 2024"); null for a year. */
export function yearToDate(model, index) {
  const { period, parts } = model;
  if (!period.month) return null;
  const sumOf = (year) => monthKeys(offsetOf({ year, month: 1 }), offsetOf({ year, month: period.month })).reduce((t, key) => t + addedAt(index, parts, key), 0);
  const [now, before] = [sumOf(period.year), sumOf(period.year - 1)];
  const months = period.month === 1 ? 'Jan.' : `Jan.–${MONTHS_SHORT[period.month - 1]}`;
  return { now, before, change: before > 0 ? (now - before) / before : null, vsLabel: `${months} ${period.year - 1}` };
}
