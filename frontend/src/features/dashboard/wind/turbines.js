import { useMemo } from 'react';
import { API_BASE_URL } from '../../../config/site';
import { useJson } from '../../../lib/data';

// Every wind turbine on its own (/wind/turbines, mrt.wind_turbines): loaded once, filtered here by area, Lage and status
export const TURBINES_URL = `${API_BASE_URL}/wind/turbines`;

// The three sizes of a turbine, in the order of the matrix. scale: from the column to the unit shown (kW → MW)
export const VARIABLES = [
  { id: 'nabenhoehe', label: 'Nabenhöhe', unit: 'm', scale: 1, digits: 0 },
  { id: 'rotordurchmesser', label: 'Rotordurchmesser', unit: 'm', scale: 1, digits: 0 },
  { id: 'leistung', label: 'Bruttoleistung', unit: 'MW', scale: 0.001, digits: 1 },
];
export const variableOf = (id) => VARIABLES.find((v) => v.id === id);

export const STATUSES = [
  { id: 'in_betrieb', label: 'In Betrieb' },
  { id: 'geplant', label: 'In Planung' },
  { id: 'stillgelegt', label: 'Stillgelegt' },
];

// The turbine's year as a period (ordinal: one green, older lighter; validated against the card's surface). Planned
// turbines have a year ahead: the last, darkest step.
export const PERIODS = [
  { id: 'p1999', label: 'bis 1999', test: (y) => y <= 1999, color: '#78b584' },
  { id: 'p2009', label: '2000–2009', test: (y) => y <= 2009, color: '#5b9d68' },
  { id: 'p2014', label: '2010–2014', test: (y) => y <= 2014, color: '#43844f' },
  { id: 'p2019', label: '2015–2019', test: (y) => y <= 2019, color: '#316a3b' },
  { id: 'p2025', label: 'seit 2020', test: (y, planned) => !planned, color: '#21502a' },
  { id: 'geplant', label: 'In Planung', test: () => true, color: '#13371b' },
];

// The manufacturers' groups, in the API's order (categorical, validated; "Sonstige" last)
export const HERSTELLER_COLORS = ['#2a6496', '#e28316', '#8453d6', '#5ea66b', '#c0365b', '#b8901a', '#0f9fc4'];

export const COLOR_MODES = [
  { id: 'zeit', label: 'Jahr' },
  { id: 'hersteller', label: 'Hersteller' },
];

// A Gemeindeschlüssel as the API sends it (a number, the leading zero left off) under a scope key ("DE", 2, 5 or 8
// digits)
const inScope = (scopeKey) => {
  if (!scopeKey || scopeKey === 'DE') return () => true;
  const digits = scopeKey.length;
  const prefix = Number(scopeKey);
  const factor = 10 ** (8 - digits);
  return (ags) => ags != null && Math.floor(ags / factor) === prefix;
};

/**
 * The turbines of the area (scopeKey), of the chosen Lagen (["an_land", "auf_see"], null: both) and statuses. Returns
 * { status, data, rows, groups }: rows are the indexes of the turbines shown; data the columns (Float64Arrays where
 * numeric, null as NaN); groups the period or manufacturer of each turbine (index into PERIODS or HERSTELLER_COLORS)
 * and the legend of the colour mode.
 */
export function useTurbines({ scopeKey, lagen, statuses, colorMode = 'zeit', enabled = true }) {
  const json = useJson(enabled ? TURBINES_URL : null);

  const data = useMemo(() => {
    if (!json.data) return null;
    const { columns, status, lage, hersteller } = json.data;
    const numeric = (values) => Float64Array.from(values, (v) => (v == null ? NaN : v));
    return {
      n: columns.status.length,
      statusNames: status,
      lageNames: lage,
      herstellerNames: hersteller,
      status: Uint8Array.from(columns.status),
      lage: Uint8Array.from(columns.lage),
      hersteller: Uint8Array.from(columns.hersteller),
      jahr: numeric(columns.jahr),
      nabenhoehe: numeric(columns.nabenhoehe),
      rotordurchmesser: numeric(columns.rotordurchmesser),
      leistung: numeric(columns.leistung),
      lon: numeric(columns.lon),
      lat: numeric(columns.lat),
      ags: columns.ags,
    };
  }, [json.data]);

  const statusKey = statuses.join(',');
  const lageKey = (lagen ?? []).join(',');
  const rows = useMemo(() => {
    if (!data) return null;
    const wantedStatus = new Set(statusKey.split(',').map((id) => data.statusNames.indexOf(id)));
    const wantedLage = lageKey ? new Set(lageKey.split(',').map((id) => data.lageNames.indexOf(id))) : null;
    const scoped = inScope(scopeKey);
    const out = [];
    for (let i = 0; i < data.n; i += 1) {
      if (!wantedStatus.has(data.status[i])) continue;
      if (wantedLage && !wantedLage.has(data.lage[i])) continue;
      // Offshore turbines belong to Deutschland only
      if (scopeKey && scopeKey !== 'DE' && !scoped(data.ags[i])) continue;
      out.push(i);
    }
    return Int32Array.from(out);
  }, [data, statusKey, lageKey, scopeKey]);

  const groups = useMemo(() => {
    if (!data) return null;
    const planned = data.statusNames.indexOf('geplant');
    const group = new Uint8Array(data.n);
    for (let i = 0; i < data.n; i += 1) {
      if (colorMode === 'hersteller') group[i] = data.hersteller[i];
      else {
        const isPlanned = data.status[i] === planned;
        const year = data.jahr[i];
        group[i] = isPlanned ? PERIODS.length - 1 : PERIODS.findIndex((p) => p.test(Number.isNaN(year) ? 2025 : year, isPlanned));
      }
    }
    const legend =
      colorMode === 'hersteller'
        ? data.herstellerNames.map((label, i) => ({ id: label, label, color: HERSTELLER_COLORS[i] }))
        : PERIODS.map(({ id, label, color }) => ({ id, label, color }));
    return { group, legend, colors: legend.map((l) => l.color) };
  }, [data, colorMode]);

  return { status: json.status, retry: json.retry, data, rows, groups };
}

// The values of a variable for the rows shown, in its unit (MW for power); NaN where unknown
export const valuesOf = (data, rows, variable) => {
  const column = data[variable.id];
  return Float64Array.from(rows, (i) => column[i] * variable.scale);
};

// Pearson's r of two columns over the rows where both are known, and how many those are
export function correlation(xs, ys) {
  let n = 0;
  let sx = 0;
  let sy = 0;
  for (let k = 0; k < xs.length; k += 1) {
    if (Number.isNaN(xs[k]) || Number.isNaN(ys[k])) continue;
    n += 1;
    sx += xs[k];
    sy += ys[k];
  }
  if (n < 3) return { r: null, n };
  const [mx, my] = [sx / n, sy / n];
  let cov = 0;
  let vx = 0;
  let vy = 0;
  for (let k = 0; k < xs.length; k += 1) {
    if (Number.isNaN(xs[k]) || Number.isNaN(ys[k])) continue;
    const [dx, dy] = [xs[k] - mx, ys[k] - my];
    cov += dx * dy;
    vx += dx * dx;
    vy += dy * dy;
  }
  return { r: vx > 0 && vy > 0 ? cov / Math.sqrt(vx * vy) : null, n };
}

// The q-quantile (0..1) of sorted values
export const quantile = (sorted, q) => {
  if (!sorted.length) return NaN;
  const at = (sorted.length - 1) * q;
  const [lo, hi] = [Math.floor(at), Math.ceil(at)];
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (at - lo);
};

// Axis ticks in steps of 1, 2, 2.5 or 5 times a power of ten from 0 up to at least max
export function niceTicks(max, target = 5) {
  if (!(max > 0)) return [0, 1];
  const rough = max / target;
  const power = 10 ** Math.floor(Math.log10(rough));
  const step = [1, 2, 2.5, 5, 10].map((f) => f * power).find((s) => s >= rough);
  return Array.from({ length: Math.ceil(max / step - 1e-9) + 1 }, (_, i) => Number((i * step).toFixed(6)));
}

// The upper end of a variable's axis: its 99.9th percentile, so a few typos don't squeeze everything else
export function axisMax(values) {
  const known = Array.from(values).filter((v) => !Number.isNaN(v)).sort((a, b) => a - b);
  return known.length ? quantile(known, 0.999) : 1;
}
