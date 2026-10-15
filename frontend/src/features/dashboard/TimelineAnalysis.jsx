import { useMemo, useState } from 'react';
import { RefreshCw, TriangleAlert } from 'lucide-react';
import StackedChart from '../../components/charts/StackedChart';
import { ChartFoot } from '../../components/ui/CsvLink';
import SegmentedControl from '../../components/ui/SegmentedControl';
import { API_BASE_URL } from '../../config/site';
import { useStats } from '../../lib/data';
import { fileName, round } from '../../lib/files';
import AnalysisPanel from './AnalysisPanel';
import SeriesLegend from './SeriesLegend';
import TimeControls from './TimeControls';
import YearComparison from './YearComparison';
import {
  buildComparison,
  buildPeriods,
  comparedSpan,
  indexRows,
  thisMonth,
  timeSlug,
  useHiddenSeries,
  useTimeView,
} from './timeView';

// The values of a row of mrt.zubau_zeitverlauf: what came in the period, what was there at its end
const FIELDS = { zubau: 'added', bestand: 'installed' };

// "Ausbau im Zeitverlauf": in the scope, per year or month, with the series stacked
// (etl/queries/aggregate_zubau_zeitverlauf_regions.sql), or the months of a few years side by side (Jahresvergleich).
// With `measures` (batteries: Kapazität, Leistung) a switch in the head chooses what it shows, each with its own series,
// unit and quantity. With `planned` the same for units in planning by their planned date (Geplante Anlagen): dates
// ahead, so the chart starts from today – this year "ab Oktober", "Nächste 12 Monate" – and nothing is running.
// leistung: the solar Leistung chosen (null: the default, Netto); leistungOption and onLeistung: the choice of it (the
// solar technology's leistung config), switchable right here. region, scopeName: the scope ("DE", a Land or Kreis key)
// and its name; anchor: its id; fileBase: of its CSV ("mastr_erzeuger").
export default function TimelineAnalysis({
  analysis,
  leistung,
  leistungOption,
  onLeistung,
  region = 'DE',
  scopeName = 'Deutschland',
  anchor,
  fileBase,
}) {
  const { title, timeline } = analysis;
  const { measures, planned } = timeline;
  // Dates ahead: the current month instead of the latest data's; they start this year (the view keeps no date before
  // the current month)
  const [now] = useState(() => (planned ? thisMonth() : null));
  const since = now ? now.year : timeline.since;
  const [measureId, setMeasureId] = useState(measures?.[0].id);
  const chosen = measures?.find((m) => m.id === measureId) ?? timeline;
  const { series, unit, quantity } = chosen;
  const netto = leistung?.id !== 'brutto';
  const hasNetto = series.some((s) => s.netto);

  // The technology of the API each series shows: solar as Nettonennleistung (solar_netto) or Bruttoleistung, the
  // batteries' power as …speicher_leistung (source)
  const sources = series.map((s) => (netto && s.netto) || s.source || s.id);
  const url = `${API_BASE_URL}${timeline.path}?region=${region}&${sources.map((id) => `technology=${id}`).join('&')}`;
  const stats = useStats(url);
  const sourceKey = sources.join(',');
  const table = useMemo(() => {
    if (!stats.data) return null;
    const seriesOf = new Map(sourceKey.split(',').map((source, i) => [source, series[i].id]));
    return indexRows(stats.data, seriesOf);
  }, [stats.data, sourceKey, series]);

  // Not aggregiert: the Zubau, what went into operation in each year or month. Aggregiert: the Bestand, what was in
  // operation at its end, added up over the years (minus what was finally decommissioned), as bars or a curve. Planned:
  // what is planned to come, and all planned up to the period's end; this year and the next five at first.
  const time = useTimeView({ years: now && [now.year, now.year + 5] });
  const { view, measure, isCurve } = time;
  // Series with `hidden` (Wasserkraft) start switched off
  const [hidden, toggle] = useHiddenSeries(series);

  const visible = useMemo(() => series.filter((s) => !hidden.has(s.id)), [series, hidden]);
  const { range, years: span } = time;
  const periods = useMemo(
    () => (table ? buildPeriods(table, { view, range, years: span, measure }, visible, since, FIELDS, now) : []),
    [table, view, range, span, measure, visible, since, now],
  );
  const latestYear = table?.latest.year ?? since;
  // The Jahresvergleich: the Zubau of the series shown, added up, per month and year compared
  const isComparison = view === 'vergleich';
  const [compareFrom, compareTo] = comparedSpan(time.compared, since, latestYear, now);
  const comparison = useMemo(
    () => (table && isComparison ? buildComparison(table, [compareFrom, compareTo], visible, FIELDS.zubau, now) : null),
    [table, isComparison, compareFrom, compareTo, visible, now],
  );

  const bestand = measure === 'bestand';
  const solar = hasNetto ? ` · Solar ${netto ? 'Netto (AC)' : 'Brutto (DC)'}` : '';
  const per = view === 'jahr' ? 'Jahr' : 'Monat';
  const end = view === 'jahr' ? 'Jahresende' : 'Monatsende';
  const subtitle = planned
    ? bestand
      ? `${scopeName} · geplante ${quantity} bis zum ${end}, aufsummiert${solar}`
      : isComparison
        ? `${scopeName} · geplante ${quantity} je Monat, ${compareFrom}–${compareTo} im Vergleich${solar}`
        : `${scopeName} · geplante ${quantity} je ${per}, nach geplanter Inbetriebnahme${solar}`
    : bestand
      ? `${scopeName} · installierte ${quantity} am ${end}${solar}`
      : isComparison
        ? `${scopeName} · neu in Betrieb genommene ${quantity} je Monat, ${compareFrom}–${compareTo} im Vergleich${solar}`
        : `${scopeName} · neu in Betrieb genommene ${quantity} je ${per}${solar}`;

  // The CSV: what the chart shows, a row per year or month and a column per series shown – in the Jahresvergleich a
  // row per month and a column per year (the series shown added up)
  const measureLabel = planned ? (bestand ? 'Geplant aufsummiert' : 'Geplant') : bestand ? 'Bestand' : 'Zubau';
  const columnOf = (s) => `${measureLabel} ${s.label}${s.netto ? (netto ? ' netto' : ' brutto') : ''} (${unit})`;
  const csv = {
    name: 'zeitverlauf',
    filename: fileName(
      fileBase,
      analysis.id.replace('timeline', 'zeitverlauf'),
      region,
      measures && chosen.id,
      measure,
      timeSlug(time, since, latestYear, now),
      hasNetto && (netto ? 'netto' : 'brutto'),
    ),
    rows: () =>
      comparison
        ? comparison.months.map((m) => ({
            Monat: m.title,
            ...Object.fromEntries(
              comparison.years.map((year) => [`${measureLabel} ${year} (${unit})`, round(m.values[year])]),
            ),
          }))
        : periods.map((period) => {
            const [year, month] = period.key.split('-').map(Number);
            return {
              Jahr: year,
              ...(month ? { Monat: month } : {}),
              ...Object.fromEntries(visible.map((s) => [columnOf(s), round(period.values[s.id])])),
            };
          }),
  };

  return (
    <AnalysisPanel
      id={anchor}
      icon={analysis.icon}
      title={title}
      lead={subtitle}
      className="timeline-card"
      tools={
        measures && (
          <SegmentedControl
            label="Messgröße"
            options={measures.map((m) => ({ id: m.id, label: m.label, title: `${m.quantity} in ${m.unit}` }))}
            value={chosen.id}
            onChange={setMeasureId}
          />
        )
      }
    >
      {/* Every control always in its place: only the span (years or months) changes with the Zeitraster */}
      <div className="timeline__controls">
        <TimeControls time={time} since={since} latestYear={latestYear} now={now} />
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
      ) : comparison ? (
        <YearComparison
          comparison={comparison}
          unit={unit}
          kind="power"
          axisLabel={quantity}
          label={`${title}: ${subtitle}`}
        />
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
      <SeriesLegend series={series} hidden={hidden} onToggle={toggle} />

      <ChartFoot csv={table && visible.length ? csv : null}>
        {planned ? (
          <p className="timeline__note">{timeline.note}</p>
        ) : (
          <p className="timeline__note">
            Nach Inbetriebnahmedatum, Quelle: Marktstammdatenregister.{' '}
            {isCurve ? '' : 'Hell: laufendes Jahr bzw. laufender Monat. '}
            Die letzten zwei bis drei Monate steigen noch, weil viele Anlagen erst Wochen nach der Inbetriebnahme
            registriert werden.{timeline.note && ` ${timeline.note}`}
          </p>
        )}
      </ChartFoot>
    </AnalysisPanel>
  );
}
