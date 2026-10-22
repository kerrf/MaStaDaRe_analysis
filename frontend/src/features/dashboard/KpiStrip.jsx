import StatTile from '../../components/ui/StatTile';
import { API_BASE_URL } from '../../config/site';
import { useJson } from '../../lib/data';
import { formatCapacity, formatNumber, formatPower, scaleAmount } from '../../lib/format';

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

  return { ...base, status: 'empty' };
}

// The units registered in the last 12 months of a region ('DE', a Land's or a Kreis' key), of the series (the months up
// to the newest of the view, the Datenstand's): null while loading
function useRegistered12m(region, series) {
  const query = series.map((id) => `technology=${encodeURIComponent(id)}`).join('&');
  const data = useJson(series.length ? `${API_BASE_URL}/zubau/registrierungen?region=${region}&${query}` : null);
  if (data.status !== 'ready') return { status: data.status, value: null };
  const months = data.data.filter((row) => row.month != null);
  const latest = Math.max(...months.map((row) => row.year * 12 + row.month - 1));
  const value = months.filter((row) => row.year * 12 + row.month - 1 > latest - 12).reduce((acc, row) => acc + row.units, 0);
  return { status: 'ready', value };
}

// Registrierungen (12 Monate): in the area, and below it the area's parent (Deutschland for a Land, the Land for a Kreis)
function RegistrationsTile({ kpi, region, parent, parentName, series }) {
  const own = useRegistered12m(region, series);
  const above = useRegistered12m(parent ?? region, parent ? series : []);
  const base = { label: kpi.label, icon: kpi.icon };
  if (!series.length) return <StatTile {...base} status="empty" sub="Keine Registrierungsdaten" />;
  if (own.status === 'loading' || (parent && above.status === 'loading')) return <StatTile {...base} status="loading" />;
  if (own.status !== 'ready') return <StatTile {...base} status="empty" sub="Daten derzeit nicht verfügbar" />;
  const sub = parent && above.status === 'ready' ? `${parentName}: ${formatNumber(above.value)}` : `${parentName} gesamt`;
  return <StatTile {...base} value={formatNumber(own.value)} sub={sub} />;
}

/**
 * The KPIs of the area: Deutschland, a Land among the Länder, a Kreis among the Kreise of its Land. registrations: the
 * technology's series of the Registrierungen (config `registrations`, the chosen parts) for the kind 'registrations'.
 */
export default function KpiStrip({ kpis, rows, status, level = 'bundesland', selected = null, parentName = 'Deutschland', registrations = [] }) {
  const scope = { rows, status, level, selected, parentName };
  const region = selected?.key ?? 'DE';
  // A Land compares with Deutschland, a Kreis with its Land
  const parent = selected ? (level === 'landkreis' ? selected.key.slice(0, 2) : 'DE') : null;
  return (
    <section className="kpi-strip" aria-label="Kennzahlen">
      {kpis.map((kpi) =>
        kpi.kind === 'registrations' ? (
          <RegistrationsTile key={kpi.id} kpi={kpi} region={region} parent={parent} parentName={parentName} series={registrations} />
        ) : (
          <StatTile key={kpi.id} {...computeKpi(kpi, scope)} />
        ),
      )}
    </section>
  );
}
