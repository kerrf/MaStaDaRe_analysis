import StatTile from '../../components/ui/StatTile';
import { formatNumber, formatPercent, formatPower } from '../../lib/format';

const sum = (rows, field) => rows.reduce((acc, row) => acc + (row[field] ?? 0), 0);

function formatValue(kpi, value) {
  if (kpi.format === 'power') return formatPower(value);
  return { value: formatNumber(value), unit: kpi.unit };
}

// rows: Bundesland-level stats. region: selected Bundesland or null (= Deutschland).
function computeKpi(kpi, rows, status, region) {
  const base = { label: kpi.label, icon: kpi.icon };
  if (kpi.kind === 'placeholder') return { ...base, status: 'empty', sub: 'Zeitreihe folgt' };
  if (status === 'loading') return { ...base, status: 'loading' };
  if (status !== 'ready' || !rows?.length) {
    return { ...base, status: 'empty', sub: status === 'error' ? 'Daten derzeit nicht verfügbar' : 'Daten in Vorbereitung' };
  }

  const total = sum(rows, kpi.field);
  const regionRow = region ? rows.find((row) => row.Bundesland === region.name) : null;
  if (region && !regionRow) return { ...base, status: 'empty', sub: `Keine Daten für ${region.name}` };

  if (kpi.kind === 'sum') {
    const value = region ? regionRow[kpi.field] : total;
    const formatted = formatValue(kpi, value);
    const national = formatValue(kpi, total);
    return {
      ...base,
      value: formatted.value,
      unit: formatted.unit,
      sub: region ? `Deutschland: ${national.value} ${national.unit ?? ''}`.trim() : 'Deutschland gesamt',
    };
  }

  const ranked = rows
    .filter((row) => row.Bundesland && row.Bundesland !== 'Unbekannt')
    .sort((a, b) => (b[kpi.field] ?? 0) - (a[kpi.field] ?? 0));

  if (region) {
    const rank = ranked.findIndex((row) => row.Bundesland === region.name) + 1;
    return {
      ...base,
      label: kpi.scopedLabel ?? kpi.label,
      value: formatPercent(regionRow[kpi.field] / total),
      sub: `Rang ${rank} von ${ranked.length} Bundesländern`,
    };
  }
  const top = ranked[0];
  return { ...base, value: top.Bundesland, textValue: true, sub: `${formatPercent(top[kpi.field] / total)} des Bundeswerts` };
}

export default function KpiStrip({ kpis, rows, status, region }) {
  return (
    <section className="kpi-strip" aria-label="Kennzahlen">
      {kpis.map((kpi) => (
        <StatTile key={kpi.id} {...computeKpi(kpi, rows, status, region)} />
      ))}
    </section>
  );
}
