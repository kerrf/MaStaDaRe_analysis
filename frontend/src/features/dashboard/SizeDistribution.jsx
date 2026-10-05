import { useMemo } from 'react';
import GroupedBarChart from '../../components/charts/GroupedBarChart';
import ChartPlaceholder from '../../components/ui/ChartPlaceholder';
import { API_BASE_URL } from '../../config/site';
import { useStats } from '../../lib/data';
import { formatAmount, formatCount } from '../../lib/format';

// What the left axis measures: the power, or (batteries) the capacity
const MEASURES = {
  power: { field: 'total_power', label: 'Leistung', unit: 'MW' },
  capacity: { field: 'total_capacity', label: 'Kapazität', unit: 'MWh' },
};

// The power or capacity (left axis) and the number of units (right axis) per size class, each on its own scale
const seriesOf = (measure, unitsLabel) => [
  { id: 'size', label: measure.label, color: 'var(--accent)', ink: 'var(--accent-strong)', axis: 'left' },
  { id: 'units', label: unitsLabel, color: '#98a2b3', ink: 'var(--ink-muted)', axis: 'right' },
];
const axesOf = (measure, unitsLabel) => ({
  left: { label: measure.label, kind: 'power', unit: measure.unit },
  right: { label: unitsLabel, kind: 'count' },
});

// Units and power per size class of the active technology in the scope (mrt.size_distribution, the batteries'
// mrt.battery_size_distribution), as columns. measure: 'power' or 'capacity'; unitsLabel: what the units are called
export default function SizeDistribution({ path, region, query, measure: measureId = 'power', unitsLabel = 'Anlagen' }) {
  const measure = MEASURES[measureId];
  const stats = useStats(`${API_BASE_URL}${path}?region=${region}${query ? `&${query}` : ''}`);

  const categories = useMemo(() => {
    if (stats.status !== 'ready') return null;
    const rows = stats.data;
    if (!rows.some((row) => row.total_units)) return [];
    return rows.map((row) => ({
      key: row.size_class,
      label: row.label,
      values: { size: row[measure.field], units: row.total_units },
      details: [
        { id: 'size', text: formatAmount(row[measure.field], measure.unit) },
        { id: 'units', text: formatCount(row.total_units) },
      ],
    }));
  }, [stats.status, stats.data, measure]);
  const series = seriesOf(measure, unitsLabel);

  if (stats.status === 'error') {
    return <ChartPlaceholder variant="bars" title="Keine Daten" note="Die Verteilung konnte nicht geladen werden." />;
  }
  if (!categories) return <ChartPlaceholder variant="bars" title="Wird geladen …" />;
  if (!categories.length) return <ChartPlaceholder variant="bars" title={`Keine ${unitsLabel}`} note="In diesem Gebiet ist keine in Betrieb." />;

  return (
    <div className="sizes-chart">
      <div className="sizes-chart__bar">
        <div className="sizes-chart__legend">
          {series.map((s) => (
            <span key={s.id}>
              <span className="sizes__key" style={{ background: s.color }} /> {s.label}
              <span className="sizes__axis"> · {s.axis === 'left' ? 'linke' : 'rechte'} Achse</span>
            </span>
          ))}
        </div>
      </div>
      <GroupedBarChart
        categories={categories}
        series={series}
        axes={axesOf(measure, unitsLabel)}
        label={`${measure.label} und ${unitsLabel} je Größenklasse`}
      />
    </div>
  );
}
