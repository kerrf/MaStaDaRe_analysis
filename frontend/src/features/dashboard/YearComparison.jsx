import GroupedBarChart from '../../components/charts/GroupedBarChart';
import { formatAmount, formatNumber } from '../../lib/format';
import { MONTHS } from './timeView';

// A year's colour: the dashboard's accent, from light (the earliest year) to full (the latest), so the newest reads first
const shadeOf = (index, count) =>
  count === 1 ? 'var(--accent)' : `color-mix(in srgb, var(--accent) ${Math.round(35 + (65 * index) / (count - 1))}%, var(--surface-card))`;

/**
 * The Jahresvergleich of a time chart: Jan … Dez along the bottom, a column per year in each month (timeView.js
 * buildComparison), the running month light. comparison: { years, months, latest (null: dates ahead), start }; unit and
 * kind: how the axis counts ('power': MW, MWh, GW from 1,000; 'count': Tsd., Mio.); axisLabel: its name; label: of the
 * chart, for screen readers
 */
export default function YearComparison({ comparison, unit, kind, axisLabel, label }) {
  const { years, months, latest, start } = comparison;
  // The latest data's year "bis Oktober"; for dates ahead the first year "ab Oktober"
  const labelOf = (year) =>
    year === latest?.year
      ? `${year} (bis ${MONTHS[latest.month - 1]})`
      : year === start?.year
        ? `${year} (ab ${MONTHS[start.month - 1]})`
        : String(year);
  const series = years.map((year, i) => ({
    id: String(year),
    label: labelOf(year),
    color: shadeOf(i, years.length),
    axis: 'left',
  }));
  const format = (value) => (value == null ? '–' : kind === 'count' ? formatNumber(value) : formatAmount(value, unit));
  const categories = months.map((month) => ({
    key: month.key,
    label: month.label,
    title: month.title,
    values: Object.fromEntries(years.map((year) => [String(year), month.values[year]])),
    faded: Object.fromEntries(years.map((year) => [String(year), month.partial[year]])),
    details: years.map((year) => ({ id: String(year), text: format(month.values[year]) })),
  }));

  return (
    <div className="year-comparison">
      <div className="year-comparison__legend">
        {series.map((s) => (
          <span key={s.id}>
            <span className="year-comparison__key" style={{ background: s.color }} /> {s.label}
          </span>
        ))}
      </div>
      <GroupedBarChart
        categories={categories}
        series={series}
        axes={{ left: { label: axisLabel, kind, unit, ink: 'var(--ink-muted)' } }}
        label={label}
      />
    </div>
  );
}
