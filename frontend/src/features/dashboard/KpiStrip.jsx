import StatTile from '../../components/ui/StatTile';
import { findBundeslandByAgs, isKreisKey, regionName } from '../../config/regions';
import { formatCapacity, formatNumber, formatPercent, formatPower, scaleAmount } from '../../lib/format';

// The units the KPIs compare, keyed like the stats rows. Bundesland rows may also contain "offshore" (wind): it counts for
// the total but isn't a Land.
const LEVELS = {
  bundesland: { isPeer: (key) => Boolean(findBundeslandByAgs(key)), peers: 'Bundesländern' },
  landkreis: { isPeer: isKreisKey, peers: 'Landkreisen' },
};

const sum = (rows, field) => rows.reduce((acc, row) => acc + (row[field] ?? 0), 0);

function formatValue(kpi, value) {
  if (kpi.format === 'power') return formatPower(value);
  if (kpi.format === 'capacity') return formatCapacity(value);
  if (kpi.format === 'amount') return scaleAmount(value, kpi.unit); // in kpi.unit, from 1,000 on the next larger one
  return { value: formatNumber(value), unit: kpi.unit };
}

// rows: stats of every unit of `level` within `parentName` – the Bundesländer of Deutschland, or the Landkreise of the Land
// a selected Landkreis lies in. selected: the unit in scope ({ key, name }), or null for Deutschland.
function computeKpi(kpi, { rows, status, level, selected, parentName }) {
  const base = { label: kpi.label, icon: kpi.icon };
  if (kpi.kind === 'placeholder') return { ...base, status: 'empty', sub: 'Zeitreihe folgt' };
  if (status === 'loading') return { ...base, status: 'loading' };
  if (status !== 'ready' || !rows?.length) {
    return { ...base, status: 'empty', sub: status === 'error' ? 'Daten derzeit nicht verfügbar' : 'Daten in Vorbereitung' };
  }

  const total = sum(rows, kpi.field);
  const selectedRow = selected ? rows.find((row) => row[level] === selected.key) : null;
  if (selected && !selectedRow) return { ...base, status: 'empty', sub: `Keine Daten für ${selected.name}` };

  if (kpi.kind === 'sum') {
    const formatted = formatValue(kpi, selected ? selectedRow[kpi.field] : total);
    const parent = formatValue(kpi, total);
    return {
      ...base,
      value: formatted.value,
      unit: formatted.unit,
      sub: selected ? `${parentName}: ${parent.value} ${parent.unit ?? ''}`.trim() : `${parentName} gesamt`,
    };
  }

  const { isPeer, peers } = LEVELS[level];
  const ranked = rows.filter((row) => isPeer(row[level])).sort((a, b) => (b[kpi.field] ?? 0) - (a[kpi.field] ?? 0));

  if (selected) {
    const rank = ranked.findIndex((row) => row[level] === selected.key) + 1;
    return {
      ...base,
      label: `Anteil an ${parentName}`,
      value: formatPercent(selectedRow[kpi.field] / total),
      sub: `Rang ${rank} von ${ranked.length} ${peers}`,
    };
  }
  const top = ranked[0];
  return { ...base, value: regionName(top.bundesland), textValue: true, sub: `${formatPercent(top[kpi.field] / total)} des Bundeswerts` };
}

export default function KpiStrip({ kpis, rows, status, level = 'bundesland', selected = null, parentName = 'Deutschland' }) {
  const scope = { rows, status, level, selected, parentName };
  return (
    <section className="kpi-strip" aria-label="Kennzahlen">
      {kpis.map((kpi) => (
        <StatTile key={kpi.id} {...computeKpi(kpi, scope)} />
      ))}
    </section>
  );
}
