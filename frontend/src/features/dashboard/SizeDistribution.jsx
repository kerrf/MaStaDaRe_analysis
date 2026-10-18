import { useMemo, useState } from 'react';
import GroupedBarChart from '../../components/charts/GroupedBarChart';
import ChartPlaceholder from '../../components/ui/ChartPlaceholder';
import { ChartFoot } from '../../components/ui/ChartExport';
import SegmentedControl from '../../components/ui/SegmentedControl';
import Setting from '../../components/ui/Setting';
import { API_BASE_URL } from '../../config/site';
import { useStats } from '../../lib/data';
import { fileName, round, selectionSlug } from '../../lib/files';
import { formatAmount, formatCount } from '../../lib/format';

// What the left axis measures: the power, (batteries) the capacity, or (gas storages) the working gas
const MEASURES = {
  power: { field: 'total_power', label: 'Leistung', unit: 'MW' },
  capacity: { field: 'total_capacity', label: 'Kapazität', unit: 'MWh' },
  arbeitsgas: { field: 'total_capacity', label: 'Arbeitsgas', unit: 'GWh' },
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
// mrt.battery_size_distribution, the gas sites by their power or working gas), as columns. measure: 'power', 'capacity'
// or 'arbeitsgas' to start with; measures: those to switch between (batteries and gas storages: their capacity or
// working gas, and their power – the classes stay by the capacity); unitsLabel: what the units are called; note: a
// footnote below the chart; fileBase: of its CSV ("mastr_solar")
export default function SizeDistribution({ path, region, query, measure: initial = 'power', measures, unitsLabel = 'Anlagen', note, fileBase }) {
  const [measureId, setMeasureId] = useState(initial);
  // A click on a series in the legend hides or shows it; one always stays
  const [hidden, setHidden] = useState(null);
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
  const visible = series.filter((s) => s.id !== hidden);

  if (stats.status === 'error') {
    return <ChartPlaceholder variant="bars" title="Keine Daten" note="Die Verteilung konnte nicht geladen werden." />;
  }
  if (!categories) return <ChartPlaceholder variant="bars" title="Wird geladen …" />;
  if (!categories.length) return <ChartPlaceholder variant="bars" title={`Keine ${unitsLabel}`} note="In diesem Gebiet ist keine in Betrieb." />;

  return (
    <div className="sizes-chart">
      {measures?.length > 1 && (
        <div className="sizes-chart__bar">
          <Setting label="Messgröße">
            <SegmentedControl
              label="Messgröße"
              options={measures.map((id) => ({ id, label: MEASURES[id].label, title: `${MEASURES[id].label} in ${MEASURES[id].unit}` }))}
              value={measureId}
              onChange={setMeasureId}
            />
          </Setting>
        </div>
      )}
      <GroupedBarChart
        categories={categories}
        series={visible}
        axes={axesOf(measure, unitsLabel)}
        label={`${visible.map((s) => s.label).join(' und ')} je Größenklasse`}
      />
      <div className="timeline-legend" role="group" aria-label="Datenreihen ein- und ausblenden">
        {series.map((s) => {
          const off = hidden === s.id;
          return (
            <button
              key={s.id}
              type="button"
              className={`timeline-legend__item${off ? ' is-off' : ''}`}
              aria-pressed={!off}
              title={off ? `${s.label} einblenden` : `${s.label} ausblenden`}
              onClick={() => setHidden(off ? null : s.id)}
            >
              <span className="timeline-legend__dot" style={{ background: off ? undefined : s.color }} />
              {s.label}
            </button>
          );
        })}
      </div>
      <ChartFoot
        csv={{
          name: 'groessenklassen',
          filename: fileName(fileBase, 'groessenklassen', region, selectionSlug(query)),
          rows: () =>
            stats.data.map((row) => ({
              Größenklasse: row.label,
              [`${measure.label} (${measure.unit})`]: round(row[measure.field]),
              [unitsLabel]: row.total_units,
            })),
        }}
      >
        {note && <p className="sizes-chart__note">{note}</p>}
      </ChartFoot>
    </div>
  );
}
