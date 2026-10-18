import { OFFSHORE, findBundeslandByAgs, isKreisKey, regionName } from '../../../config/regions';
import { TARGETS, neededPerYear, yearsLeft } from '../../../config/targets';
import { formatCapacity, formatNumber, formatPower } from '../../../lib/format';

// What the page counts of a technology unless its `overview.measure` says otherwise (the batteries: their capacity)
export const POWER = { field: 'total_power', format: 'power', label: 'Installierte Leistung' };

const MAIN_GOAL = 2030; // the target year the page measures against, where a technology has one
const MINOR = 0.01; // a Zubau below 1 % of the Bestand a year is hardly any: no change against the year before
const LEADERS = 3; // in Germany: the Länder with the most
export const CHART_YEARS = 15; // the Zubau per year: the latest year and the fourteen before

// Power in MW (from 1,000 in GW), capacity in MWh (GWh) – below 1 in kW or kWh, so a small Kreis doesn't read "0 MW"
export const formatOf = (format) => (value) => {
  if (value > 0 && value < 1) return { value: formatNumber(value * 1000, value < 0.01 ? 1 : 0), unit: format === 'capacity' ? 'kWh' : 'kW' };
  return format === 'capacity' ? formatCapacity(value) : formatPower(value);
};
export const joined = ({ value, unit }) => `${value} ${unit}`.trim();
const sum = (rows, field) => rows.reduce((total, row) => total + (row[field] ?? 0), 0);

// The rows of the stats a scope is compared with (its peers), and the whole it lies in: the Länder of Germany – the sea
// counts for Germany's total but is no Land –, or the Kreise of the Land (today's boundaries, kreisKeys: units may still
// carry the key of a Kreis merged since)
function peersOf(rows, scope, kreisKeys) {
  if (scope.kind === 'kreis') {
    const peers = rows.filter(
      (r) => isKreisKey(r.landkreis) && r.landkreis.startsWith(scope.region.ags) && (!kreisKeys || kreisKeys.has(r.landkreis)),
    );
    return { peers, whole: peers, keyOf: (r) => r.landkreis };
  }
  return { peers: rows.filter((r) => findBundeslandByAgs(r.bundesland)), whole: rows, keyOf: (r) => r.bundesland };
}

// The scope's values of a stats response: its row (Land or Kreis), or Germany's sums of all rows
function scopeValues(rows, scope, fields, kreisKeys) {
  const { peers, whole, keyOf } = peersOf(rows, scope, kreisKeys);
  const row = scope.kind === 'de' ? null : peers.find((r) => keyOf(r) === scope.key);
  return Object.fromEntries(fields.map((f) => [f, row ? (row[f] ?? 0) : scope.kind === 'de' ? sum(whole, f) : 0]));
}

// The yearly rows of a series response by technology and year
export function byTechnology(rows) {
  const out = new Map();
  for (const row of rows ?? []) {
    if (row.month != null) continue;
    if (!out.has(row.technology)) out.set(row.technology, new Map());
    out.get(row.technology).set(row.year, row);
  }
  return out;
}

/**
 * The parts of a technology in the scope, each with its Bestand (units, measure) and its Zubau per year, from the
 * page's source (`overview.source`):
 * - solar: /solar/arten – per Art and year units and power, Netto (the page's power) and Brutto (for the targets);
 * - series: /zubau/zeitverlauf (yearly) – per series and year the power added and installed, the units added; the units
 *   in operation from the stats per Lage (wind) or the technology's stats (a single part);
 * - battery: /battery/zubau – per size class and year units, capacity, power.
 * Returns { latest, parts: [{ id, label, hint, color, units, value, brutto, years: Map(year → { added, addedUnits,
 * brutto }) }] }, or null while a source is missing.
 */
export function partsOf({ technology, scope, arten, series, battery, lageStats, stats, kreisKeys }) {
  const { source, parts } = technology.overview;
  const yearsOf = (rows, of) => new Map(rows.map((r) => [r.year, of(r)]));
  if (source === 'solar') {
    if (!arten?.length) return null;
    const latest = Math.max(...arten.map((r) => r.year));
    return {
      latest,
      parts: parts.map((part) => {
        const rows = arten.filter((r) => r.art === part.id);
        const last = rows.find((r) => r.year === latest);
        return {
          ...part,
          units: last?.installed_units ?? 0,
          value: last?.installed_net ?? 0,
          brutto: last?.installed ?? 0,
          years: yearsOf(rows, (r) => ({ added: r.added_net, addedUnits: r.added_units, brutto: r.added })),
        };
      }),
    };
  }
  if (source === 'battery') {
    if (!battery?.length) return null;
    const latest = Math.max(...battery.map((r) => r.year));
    return {
      latest,
      parts: parts.map((part) => {
        const rows = battery.filter((r) => r.size_class === part.id);
        const last = rows.find((r) => r.year === latest);
        return {
          ...part,
          units: last?.installed_units ?? 0,
          value: last?.installed_capacity ?? 0,
          years: yearsOf(rows, (r) => ({ added: r.added_capacity, addedUnits: r.added_units })),
        };
      }),
    };
  }
  if (!series || !stats || parts.some((p) => p.lage && !lageStats[p.lage])) return null;
  const known = parts.flatMap((part) => [...(series.get(part.id)?.keys() ?? [])]);
  if (!known.length) return null;
  const latest = Math.max(...known);
  return {
    latest,
    parts: parts.map((part) => {
      // The units in operation: of the Lage, or of the whole technology where it is the only part
      const now = scopeValues(part.lage ? lageStats[part.lage] : stats, scope, ['total_units', 'total_power'], kreisKeys);
      return {
        ...part,
        units: now.total_units,
        value: now.total_power,
        brutto: series.get(part.id)?.get(latest)?.installed ?? 0,
        years: yearsOf([...(series.get(part.id)?.values() ?? [])], (r) => ({ added: r.added, addedUnits: r.added_units, brutto: r.added })),
      };
    }),
  };
}

/**
 * Everything the page shows of a technology in the scope besides its parts: the Bestand of the stats (the same numbers
 * as the map's KPIs) with its share of the whole and its rank, the Zubau of the running year and per year, in Germany
 * the targets (in Bruttoleistung) and the Länder in front, what is planned. Null when the scope has none of it.
 * stats: the technology's stats on the level the scope is compared on; parts: partsOf(); geplant: the planned units'
 * series by technology; datenstand: ISO date.
 */
export function pageModel({ technology, scope, stats, parts, geplant, datenstand, kreisKeys }) {
  const overview = technology.overview;
  const measure = overview.measure ?? POWER;
  const { peers, whole, keyOf } = peersOf(stats, scope, kreisKeys);
  const row = scope.kind === 'de' ? null : peers.find((r) => keyOf(r) === scope.key);
  const pick = (field) => (row ? (row[field] ?? 0) : scope.kind === 'de' ? sum(whole, field) : 0);
  const value = pick(measure.field);
  if (!(value > 0)) return null;
  const total = sum(whole, measure.field);
  const currentYear = Number(datenstand.slice(0, 4));

  const bestand = {
    value,
    units: pick('total_units'),
    also: overview.also && { value: pick(overview.also.field), format: overview.also.format, label: overview.also.label },
    share: row ? value / total : null,
    rank: row ? { rank: peers.filter((p) => (p[measure.field] ?? 0) > value).length + 1, of: peers.length } : null,
  };

  // The Zubau per year summed over the parts, the latest year running while it is the Datenstand's; the last full year
  // against the one before: whole years, so the registrations that come in weeks late don't make the latest months look
  // weak
  let zubau = null;
  if (parts) {
    const { latest } = parts;
    const running = latest === currentYear;
    const full = running ? latest - 1 : latest;
    const addedIn = (year, field = 'added') => parts.parts.reduce((t, p) => t + (p.years.get(year)?.[field] ?? 0), 0);
    const [last, before] = [addedIn(full), addedIn(full - 1)];
    const minor = Math.max(last, before) < MINOR * value;
    zubau = {
      latest,
      running,
      full,
      last,
      before,
      change: before > 0 && !minor ? (last - before) / before : null,
      minor,
      thisYear: { year: latest, value: addedIn(latest), units: addedIn(latest, 'addedUnits') },
      years: Array.from({ length: CHART_YEARS }, (_, i) => latest - CHART_YEARS + 1 + i).map((year) => ({
        year,
        running: running && year === latest,
        values: Object.fromEntries(parts.parts.map((p) => [p.id, p.years.get(year)?.added ?? 0])),
      })),
    };
  }

  // Germany: how far it is with the national targets – in Bruttoleistung, as the law counts – and whether the pace of
  // the last full year is enough for the next big one. A technology with one target counts all its parts toward it,
  // with several (wind) each part its own.
  let targets = null;
  if (scope.kind === 'de' && overview.targets && parts) {
    const full = zubau.full;
    targets = overview.targets.map((id) => {
      const target = TARGETS[id];
      const own = overview.targets.length > 1 ? parts.parts.filter((p) => p.id === id) : parts.parts;
      const installed = own.reduce((t, p) => t + (p.brutto ?? 0), 0);
      const actual = own.reduce((t, p) => t + (p.years.get(full)?.brutto ?? 0), 0);
      const ahead = Object.keys(target.goals)
        .map(Number)
        .filter((year) => year >= currentYear);
      const goalYear = ahead.includes(MAIN_GOAL) ? MAIN_GOAL : ahead[0];
      const milestoneYear = ahead.find((year) => year < goalYear);
      const needed = neededPerYear(installed, target.goals[goalYear], yearsLeft(datenstand, goalYear));
      return {
        id,
        label: target.label,
        source: target.source,
        href: target.href,
        installed,
        goal: { year: goalYear, value: target.goals[goalYear] },
        milestone: milestoneYear && { year: milestoneYear, value: target.goals[milestoneYear] },
        pace: { year: full, actual, needed, ratio: needed > 0 ? actual / needed : null },
      };
    });
  }

  // Germany: the Länder with the most (the sea too, for wind)
  const leaders =
    scope.kind === 'de'
      ? [...peers, ...stats.filter((r) => r.bundesland === OFFSHORE.ags)]
          .sort((a, b) => (b[measure.field] ?? 0) - (a[measure.field] ?? 0))
          .slice(0, LEADERS)
          .map((r) => ({
            name: r.bundesland === OFFSHORE.ags ? 'Nord- und Ostsee' : regionName(r.bundesland),
            value: r[measure.field] ?? 0,
            share: (r[measure.field] ?? 0) / total,
          }))
      : null;

  // Planned: the units "in Planung" of the register by their planned commissioning from this month on – all of them up
  // to the last year planned (the series' Bestand), how many, until when
  let planned = null;
  if (overview.planned && geplant) {
    const series = overview.planned.map((id) => geplant.get(id)).filter(Boolean);
    const rows = series.flatMap((s) => [...s.values()]);
    const plannedValue = series.reduce((t, s) => t + Math.max(0, ...[...s.values()].map((r) => r.installed ?? 0)), 0);
    const yearsAhead = rows.filter((r) => r.added > 0).map((r) => r.year);
    planned = {
      value: plannedValue,
      units: rows.reduce((t, r) => t + (r.added_units ?? 0), 0),
      from: yearsAhead.length ? Math.min(...yearsAhead) : null,
      to: yearsAhead.length ? Math.max(...yearsAhead) : null,
    };
  }

  return { measure, bestand, zubau, targets, leaders, planned };
}
