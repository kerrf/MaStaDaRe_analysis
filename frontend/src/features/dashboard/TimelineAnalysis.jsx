import { useMemo, useState } from 'react';
import { RefreshCw, TriangleAlert } from 'lucide-react';
import StackedChart from '../../components/charts/StackedChart';
import { ChartFoot } from '../../components/ui/CsvLink';
import SegmentedControl from '../../components/ui/SegmentedControl';
import { API_BASE_URL } from '../../config/site';
import { useStats } from '../../lib/data';
import { fileName, round } from '../../lib/files';
import AnalysisPanel from './AnalysisPanel';
import TimeControls from './TimeControls';
import { buildPeriods, indexRows, timeSlug, useTimeView } from './timeView';

// The values of a row of mrt.zubau_zeitverlauf: what came in the period, what was there at its end
const FIELDS = { zubau: 'added', bestand: 'installed' };

// "Ausbau im Zeitverlauf": Germany-wide, per year or month, with the series stacked (etl/queries/aggregate_zubau.sql).
// leistung: the solar Leistung chosen (null: the default, Netto); leistungOption and onLeistung: the choice of it (the
// solar technology's leistung config), switchable right here. anchor: its id; fileBase: of its CSV ("mastr_erzeuger").
export default function TimelineAnalysis({ analysis, leistung, leistungOption, onLeistung, anchor, fileBase }) {
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

  // Not aggregiert: the Zubau, what went into operation in each year or month. Aggregiert: the Bestand, what was in
  // operation at its end, added up over the years (minus what was finally decommissioned), as bars or a curve.
  const time = useTimeView();
  const { view, measure, isCurve } = time;
  const [hidden, setHidden] = useState(() => new Set());

  const visible = useMemo(() => series.filter((s) => !hidden.has(s.id)), [series, hidden]);
  const { range, years: span } = time;
  const periods = useMemo(
    () => (table ? buildPeriods(table, { view, range, years: span, measure }, visible, since, FIELDS) : []),
    [table, view, range, span, measure, visible, since],
  );
  const latestYear = table?.latest.year ?? since;

  const bestand = measure === 'bestand';
  const solar = hasNetto ? ` · Solar ${netto ? 'Netto (AC)' : 'Brutto (DC)'}` : '';
  const subtitle = bestand
    ? `Deutschland · installierte ${quantity} am ${view === 'jahr' ? 'Jahresende' : 'Monatsende'}${solar}`
    : `Deutschland · neu in Betrieb genommene ${quantity} je ${view === 'jahr' ? 'Jahr' : 'Monat'}${solar}`;

  // The CSV: what the chart shows, a row per year or month and a column per series shown
  const measureLabel = bestand ? 'Bestand' : 'Zubau';
  const columnOf = (s) => `${measureLabel} ${s.label}${s.netto ? (netto ? ' netto' : ' brutto') : ''} (${unit})`;
  const csv = {
    name: 'zeitverlauf',
    filename: fileName(
      fileBase,
      analysis.id.replace('timeline', 'zeitverlauf'),
      measure,
      timeSlug(time, since, latestYear),
      hasNetto && (netto ? 'netto' : 'brutto'),
    ),
    rows: () =>
      periods.map((period) => {
        const [year, month] = period.key.split('-').map(Number);
        return {
          Jahr: year,
          ...(month ? { Monat: month } : {}),
          ...Object.fromEntries(visible.map((s) => [columnOf(s), round(period.values[s.id])])),
        };
      }),
  };

  const toggle = (id) =>
    setHidden((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <AnalysisPanel id={anchor} icon={analysis.icon} title={title} lead={subtitle} className="timeline-card">
      {/* Every control always in its place: only the span (years or months) changes with the Zeitraster */}
      <div className="timeline__controls">
        <TimeControls id={analysis.id} time={time} since={since} latestYear={latestYear} />
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

      <ChartFoot csv={table && visible.length ? csv : null}>
        <p className="timeline__note">
          Nach Inbetriebnahmedatum, Quelle: Marktstammdatenregister.{' '}
          {isCurve ? '' : 'Hell: laufendes Jahr bzw. laufender Monat. '}
          Die letzten zwei bis drei Monate steigen noch, weil viele Anlagen erst Wochen nach der Inbetriebnahme
          registriert werden.{timeline.note && ` ${timeline.note}`}
        </p>
      </ChartFoot>
    </AnalysisPanel>
  );
}
