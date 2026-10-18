import { useMemo, useState } from 'react';
import PieChart from '../../components/charts/PieChart';
import ChartPlaceholder from '../../components/ui/ChartPlaceholder';
import { ChartFoot } from '../../components/ui/ChartExport';
import SegmentedControl from '../../components/ui/SegmentedControl';
import Setting from '../../components/ui/Setting';
import { API_BASE_URL } from '../../config/site';
import { useStats } from '../../lib/data';
import { fileName, round, selectionSlug } from '../../lib/files';
import { formatAmount, formatCount } from '../../lib/format';

const sumOf = (rows, field) => rows.reduce((total, row) => total + (row[field] ?? 0), 0);

/**
 * The units of the active technology in the scope by their kinds, a ring per kind (`groups`: batteries by technology and
 * by coupling, gas producers by technology, gas storages by Speicherart), as shares of a measure the switch chooses
 * (`measures`: e.g. the capacity or the number). Data: the kinds that occur in the region ({ kind, category, label,
 * total_units, total_power, total_capacity }, e.g. /battery/kinds). Colours: each group's `colors` by category.
 */
export default function KindShares({ path, region, query, groups, measures, unitsLabel = 'Anlagen', fileBase }) {
  const stats = useStats(`${API_BASE_URL}${path}?region=${region}${query ? `&${query}` : ''}`);
  const [measureId, setMeasureId] = useState(measures[0].id);
  const measure = measures.find((m) => m.id === measureId) ?? measures[0];
  // An amount in its unit ("32,3 GWh"), a number as it is ("2,7 Mio.": its unit is in the middle of the ring)
  const valueOf = (value) => (measure.unit ? formatAmount(value, measure.unit) : formatCount(value));

  const pies = useMemo(() => {
    if (stats.status !== 'ready') return null;
    return groups.map((group) => {
      const rows = stats.data.filter((row) => row.kind === group.id);
      return {
        ...group,
        rows,
        slices: rows.map((row) => ({
          id: row.category,
          label: row.label,
          value: row[measure.field] ?? 0,
          color: group.colors[row.category] ?? 'var(--series-unbekannt)',
        })),
      };
    });
  }, [stats.status, stats.data, groups, measure]);

  if (stats.status === 'error') return <ChartPlaceholder title="Keine Daten" note="Die Anteile konnten nicht geladen werden." />;
  if (!pies) return <ChartPlaceholder title="Wird geladen …" />;
  if (!pies.some((pie) => sumOf(pie.rows, 'total_units'))) return <ChartPlaceholder title={`Keine ${unitsLabel}`} note="In diesem Gebiet ist keine in Betrieb." />;

  // The CSV: every kind with its number and amounts, whatever the switch shows
  const amounts = measures.filter((m) => m.unit);
  const csv = {
    name: 'anteile',
    filename: fileName(fileBase, groups.map((g) => g.id).join('-'), region, selectionSlug(query)),
    rows: () =>
      pies.flatMap((pie) =>
        pie.rows.map((row) => ({
          Merkmal: pie.title,
          Art: row.label,
          [unitsLabel]: row.total_units,
          ...Object.fromEntries(amounts.map((m) => [`${m.label} (${m.unit})`, round(row[m.field])])),
        })),
      ),
  };

  return (
    <div className="kind-shares">
      {measures.length > 1 && (
        <div className="kind-shares__controls">
          <Setting label="Anteile nach">
            <SegmentedControl label="Anteile nach" options={measures.map(({ id, label }) => ({ id, label }))} value={measure.id} onChange={setMeasureId} />
          </Setting>
        </div>
      )}
      <div className={`kind-shares__pies${pies.length > 1 ? ' kind-shares__pies--pair' : ''}`}>
        {pies.map((pie) => (
          <PieChart
            key={pie.id}
            title={pies.length > 1 ? pie.title : null}
            slices={pie.slices}
            formatValue={valueOf}
            total={{ value: valueOf(sumOf(pie.rows, measure.field)), label: measure.unit ? 'insgesamt' : `${unitsLabel} insgesamt` }}
            label={`${pie.title} nach ${measure.label}`}
          />
        ))}
      </div>
      <ChartFoot csv={csv} />
    </div>
  );
}
