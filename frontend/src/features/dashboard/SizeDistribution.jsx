import { useMemo } from 'react';
import GroupedBarChart from '../../components/charts/GroupedBarChart';
import ChartPlaceholder from '../../components/ui/ChartPlaceholder';
import { API_BASE_URL } from '../../config/site';
import { useStats } from '../../lib/data';
import { formatAmount, formatCount } from '../../lib/format';

// Share of the power and of the units per size class: how a class's share of the power compares to its share of the
// units shows at a glance (one scale for both)
const SERIES = [
  { id: 'power', label: 'Leistung', color: 'var(--accent)' },
  { id: 'units', label: 'Anlagen', color: '#98a2b3' },
];

// Units and power per size class of the active technology in the scope (mrt.size_distribution), as columns
export default function SizeDistribution({ path, region, query }) {
  const stats = useStats(`${API_BASE_URL}${path}?region=${region}${query ? `&${query}` : ''}`);

  const categories = useMemo(() => {
    if (stats.status !== 'ready') return null;
    const rows = stats.data;
    const units = rows.reduce((sum, row) => sum + row.total_units, 0);
    const power = rows.reduce((sum, row) => sum + row.total_power, 0);
    if (!units) return [];
    return rows.map((row) => ({
      key: row.size_class,
      label: row.label,
      values: { power: row.total_power / power, units: row.total_units / units },
      details: [
        { id: 'power', text: formatAmount(row.total_power, 'MW') },
        { id: 'units', text: `${formatCount(row.total_units)} Anlagen` },
      ],
    }));
  }, [stats.status, stats.data]);

  if (stats.status === 'error') {
    return <ChartPlaceholder variant="bars" title="Keine Daten" note="Die Verteilung konnte nicht geladen werden." />;
  }
  if (!categories) return <ChartPlaceholder variant="bars" title="Wird geladen …" />;
  if (!categories.length) return <ChartPlaceholder variant="bars" title="Keine Anlagen" note="In diesem Gebiet ist keine Anlage in Betrieb." />;

  return (
    <div className="sizes-chart">
      <div className="sizes-chart__bar">
        <div className="sizes-chart__legend">
          {SERIES.map((s) => (
            <span key={s.id}>
              <span className="sizes__key" style={{ background: s.color }} /> {s.label}
            </span>
          ))}
        </div>
      </div>
      <GroupedBarChart
        categories={categories}
        series={SERIES}
        label="Anteile an Leistung und Anlagen je Leistungsklasse"
      />
    </div>
  );
}
