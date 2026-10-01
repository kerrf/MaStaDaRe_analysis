import { useMemo, useState } from 'react';
import { RefreshCw, TriangleAlert } from 'lucide-react';
import StackedChart from '../../components/charts/StackedChart';
import SegmentedControl from '../../components/ui/SegmentedControl';
import { API_BASE_URL } from '../../config/site';
import { useStats } from '../../lib/data';
import AnalysisPanel from './AnalysisPanel';

const MONTHS = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];

const VIEWS = [
  { id: 'jahr', label: 'Jährlich' },
  { id: 'monat', label: 'Monatlich' },
];
// Two versions of the monthly chart: Zubau per month as bars, Bestand at the end of each month as a curve
const STYLES = [
  { id: 'balken', label: 'Balken' },
  { id: 'kurve', label: 'Kurve' },
];
const LAST_12 = 'letzte-12';
const ALL = 'alle';

const periodKey = (year, month) => (month ? `${year}-${month}` : String(year));
const monthIndex = (year, month) => year * 12 + month - 1;

// The rows of mrt.zubau_zeitverlauf by period ("2025" for the year, "2025-7" for July) and series (seriesOf: the series of
// the row's technology), and the latest month.
function indexRows(rows, seriesOf) {
  const byPeriod = new Map();
  let latest = -Infinity;
  for (const row of rows) {
    const key = periodKey(row.year, row.month);
    if (!byPeriod.has(key)) byPeriod.set(key, {});
    byPeriod.get(key)[seriesOf.get(row.technology) ?? row.technology] = row;
    if (row.month) latest = Math.max(latest, monthIndex(row.year, row.month));
  }
  if (latest === -Infinity) return null;
  return { byPeriod, latest: { year: Math.floor(latest / 12), month: (latest % 12) + 1 } };
}

function buildPeriods({ byPeriod, latest }, { view, range, style }, series, since) {
  const valueKey = view === 'monat' && style === 'kurve' ? 'installed' : 'added';
  const period = (year, month, label, tick) => ({
    key: periodKey(year, month),
    label,
    tick,
    partial: year === latest.year && (!month || month === latest.month),
    values: Object.fromEntries(series.map((s) => [s.id, byPeriod.get(periodKey(year, month))?.[s.id]?.[valueKey] ?? null])),
  });

  if (view === 'jahr') {
    return Array.from({ length: latest.year - since + 1 }, (_, i) => {
      const year = since + i;
      return period(year, null, year === latest.year ? `${year} (bis ${MONTHS[latest.month - 1]})` : String(year), String(year));
    });
  }

  const last = monthIndex(latest.year, latest.month);
  const [first, end] =
    range === LAST_12
      ? [last - 11, last]
      : range === ALL
        ? [monthIndex(since, 1), last]
        : [monthIndex(Number(range), 1), monthIndex(Number(range), 12)];
  return Array.from({ length: end - first + 1 }, (_, i) => {
    const [year, month] = [Math.floor((first + i) / 12), ((first + i) % 12) + 1];
    const name = `${MONTHS[month - 1]} ${year}`;
    const isLatest = first + i === last;
    const label = style === 'kurve' ? (isLatest ? `${name} (aktueller Stand)` : `Ende ${name}`) : isLatest ? `${name} (laufend)` : name;
    const short = MONTHS[month - 1].slice(0, 3);
    const tick = range === LAST_12 ? `${short} ${String(year).slice(2)}` : range === ALL ? (month === 1 ? String(year) : null) : short;
    return period(year, month, label, tick);
  });
}

// "Zubau im Zeitverlauf": Germany-wide, per year or month, with the series stacked (etl/queries/aggregate_zubau.sql).
// leistung: the solar Leistung chosen (null: the default, Netto); leistungOption and onLeistung: the choice of it (the
// solar technology's leistung config), switchable right here. anchor: its id.
export default function TimelineAnalysis({ analysis, leistung, leistungOption, onLeistung, anchor }) {
  const { title, timeline } = analysis;
  const { series, since, unit, quantity } = timeline;
  const netto = leistung?.id !== 'brutto';
  const hasNetto = series.some((s) => s.netto);

  // The technology of the API each series shows: solar as Nettonennleistung (solar_netto) or Bruttoleistung
  const sources = series.map((s) => (netto && s.netto) || s.id);
  const url = `${API_BASE_URL}${timeline.path}?${sources.map((id) => `technology=${id}`).join('&')}`;
  const stats = useStats(url);
  const sourceKey = sources.join(',');
  const table = useMemo(() => {
    if (!stats.data) return null;
    const seriesOf = new Map(sourceKey.split(',').map((source, i) => [source, series[i].id]));
    return indexRows(stats.data, seriesOf);
  }, [stats.data, sourceKey, series]);

  const [view, setView] = useState('jahr');
  const [range, setRange] = useState(LAST_12);
  const [style, setStyle] = useState('balken');
  const [hidden, setHidden] = useState(() => new Set());

  const visible = useMemo(() => series.filter((s) => !hidden.has(s.id)), [series, hidden]);
  const periods = useMemo(
    () => (table ? buildPeriods(table, { view, range, style }, visible, since) : []),
    [table, view, range, style, visible, since],
  );
  const years = table ? Array.from({ length: table.latest.year - since + 1 }, (_, i) => String(table.latest.year - i)) : [];

  const isCurve = view === 'monat' && style === 'kurve';
  const solar = hasNetto ? ` · Solar ${netto ? 'Netto (AC)' : 'Brutto (DC)'}` : '';
  const subtitle = isCurve
    ? `Deutschland · installierte ${quantity} am Monatsende${solar}`
    : `Deutschland · neu in Betrieb genommene ${quantity} je ${view === 'jahr' ? 'Jahr' : 'Monat'}${solar}`;

  const toggle = (id) =>
    setHidden((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <AnalysisPanel id={anchor} icon={analysis.icon} title={title} lead={subtitle} className="timeline-card">
      {/* The view comes first, so switching it never moves it */}
      <div className="timeline__controls">
        <SegmentedControl label="Zeitraster" options={VIEWS} value={view} onChange={setView} />
        {view === 'monat' && (
          <>
            <label className="visually-hidden" htmlFor={`${analysis.id}-range`}>
              Zeitraum
            </label>
            <select id={`${analysis.id}-range`} className="timeline__select" value={range} onChange={(e) => setRange(e.target.value)}>
              <option value={LAST_12}>Letzte 12 Monate</option>
              <option value={ALL}>Alle Monate seit {since}</option>
              {years.map((year) => (
                <option key={year} value={year}>
                  {year}
                </option>
              ))}
            </select>
            <SegmentedControl label="Darstellung" options={STYLES} value={style} onChange={setStyle} />
          </>
        )}
        {hasNetto && leistungOption && onLeistung && (
          <div className="timeline__leistung">
            <span className="timeline__leistung-label">Solar</span>
            <SegmentedControl
              label="Leistung der Solaranlagen"
              options={leistungOption.options}
              value={netto ? 'netto' : 'brutto'}
              onChange={onLeistung}
            />
          </div>
        )}
      </div>

      {stats.status === 'error' ? (
        <div className="timeline__state" role="alert">
          <TriangleAlert size={18} aria-hidden="true" />
          Die Zeitreihe konnte nicht geladen werden.
          <button type="button" className="btn btn--secondary btn--sm" onClick={stats.retry}>
            <RefreshCw size={14} aria-hidden="true" /> Erneut versuchen
          </button>
        </div>
      ) : !table ? (
        <div className="timeline__state" role="status">
          <div className="spinner" />
          Lade Zeitreihe …
        </div>
      ) : (
        <StackedChart
          periods={periods}
          series={visible}
          kind={isCurve ? 'area' : 'bars'}
          unit={unit}
          label={`${title}: ${subtitle}`}
        />
      )}

      {/* Click a series to hide or show it */}
      <div className="timeline-legend" role="group" aria-label="Datenreihen ein- und ausblenden">
        {series.map((s) => {
          const off = hidden.has(s.id);
          return (
            <button
              key={s.id}
              type="button"
              className={`timeline-legend__item${off ? ' is-off' : ''}`}
              aria-pressed={!off}
              title={off ? `${s.label} einblenden` : `${s.label} ausblenden`}
              onClick={() => toggle(s.id)}
            >
              <span className="timeline-legend__dot" style={{ background: off ? undefined : s.color }} />
              {s.label}
            </button>
          );
        })}
      </div>

      <p className="timeline__note">
        Nach Inbetriebnahmedatum, Quelle: Marktstammdatenregister.{' '}
        {isCurve ? '' : 'Hell: laufendes Jahr bzw. laufender Monat. '}
        Die letzten zwei bis drei Monate steigen noch, weil viele Anlagen erst Wochen nach der Inbetriebnahme
        registriert werden.{timeline.note && ` ${timeline.note}`}
      </p>
    </AnalysisPanel>
  );
}
