import { useMemo, useState } from 'react';
import StackedChart from '../../components/charts/StackedChart';
import ChartPlaceholder from '../../components/ui/ChartPlaceholder';
import { ChartFoot } from '../../components/ui/ChartExport';
import SegmentedControl from '../../components/ui/SegmentedControl';
import Setting, { SettingsRow } from '../../components/ui/Setting';
import { API_BASE_URL } from '../../config/site';
import { useJson } from '../../lib/data';
import { fileName } from '../../lib/files';
import { formatNumber } from '../../lib/format';
import AnalysisPanel from './AnalysisPanel';
import SeriesLegend from './SeriesLegend';
import TimeControls from './TimeControls';
import YearComparison from './YearComparison';
import { buildComparison, buildPeriods, comparedSpan, indexRows, timeSlug, useHiddenSeries, useTimeView } from './timeView';

const count = (value) => formatNumber(value);
// The values of a row of mrt.registrierungen: registered in the period, all registered up to its end
const FIELDS = { zubau: 'units', bestand: 'total' };

// Registrierungen im MaStR: units registered per year or month, Germany-wide (mrt.registrierungen,
// aggregate_registrierungen.sql). Either one technology at a time, by a switch in the head – where they differ by orders
// of magnitude (Speicher, Gas) – or, with `stacked`, the technologies stacked like the Ausbau, a click on the legend
// hiding one (Erzeuger: Solar alone at first). The same time controls as the Ausbau im Zeitverlauf: aggregiert (all
// registered so far), Jährlich, Monatlich or Jahresvergleich, the span.
// region, scopeName: the scope ("DE", a Land or Kreis key) and its name
export default function RegistrationsAnalysis({ analysis, region = 'DE', scopeName = 'Deutschland', anchor }) {
  // units: what is registered ("Einheiten"; the Netzanschlüsse: their points); note: where its date comes from
  const { path, series, stacked, units = 'Einheiten', note } = analysis.registrations;
  // Only its technologies: a URL of its own per set of series, so a new series never meets an older cached answer
  const data = useJson(`${API_BASE_URL}${path}?region=${region}&${series.map((s) => `technology=${s.id}`).join('&')}`);
  // One at a time: always the first technology to start with (Batteriespeicher, Gaserzeuger), whatever the map shows –
  // Pumpspeicher, with a handful of registrations a year, would look like an empty chart
  const [selectedId, setSelectedId] = useState(series[0].id);
  const selected = series.find((s) => s.id === selectedId) ?? series[0];
  // Stacked: the series shown (those with `hidden` off at first)
  const [hidden, toggle] = useHiddenSeries(series);
  const shown = useMemo(() => (stacked ? series.filter((s) => !hidden.has(s.id)) : [selected]), [stacked, series, hidden, selected]);
  const time = useTimeView();
  const { view, range, years: span, measure, isCurve } = time;
  const bestand = measure === 'bestand';
  const shownKey = shown.map((s) => s.id).join(',');

  // The rows of the technologies shown by period; the first year of any technology (so the span doesn't move with the
  // legend); over the years the total registered and the year with the most, of those shown
  const facts = useMemo(() => {
    if (!data.data) return null;
    const ids = shownKey.split(',').filter(Boolean);
    const rows = data.data.filter((row) => ids.includes(row.technology));
    const allYears = data.data.filter((row) => row.month == null && series.some((s) => s.id === row.technology)).map((row) => row.year);
    const yearly = new Map();
    for (const row of rows) {
      if (row.month != null) continue;
      const year = yearly.get(row.year) ?? { year: row.year, units: 0, total: 0 };
      year.units += row.units;
      year.total += row.total;
      yearly.set(row.year, year);
    }
    const years = [...yearly.values()].sort((a, b) => a.year - b.year);
    if (!allYears.length) return { table: null };
    return {
      table: indexRows(rows.length ? rows : data.data.filter((row) => row.technology === series[0].id), new Map(ids.map((id) => [id, id]))),
      since: Math.min(...allYears),
      total: years.at(-1)?.total ?? 0,
      peak: years.reduce((best, row) => (row.units > best.units ? row : best), { year: null, units: 0 }),
    };
  }, [data.data, shownKey, series]);
  const chartSeries = useMemo(
    () =>
      stacked
        ? shown
        : [{ id: selected.id, label: bestand ? 'Registriert insgesamt' : 'Registrierungen', color: selected.color }],
    [stacked, shown, selected, bestand],
  );
  // What the summary and the chart's label name: the one technology, or those shown
  const what = shown.map((s) => s.label).join(', ');
  const periods = useMemo(
    () => (facts?.table ? buildPeriods(facts.table, { view, range, years: span, measure }, chartSeries, facts.since, FIELDS) : []),
    [facts, view, range, span, measure, chartSeries],
  );
  const latestYear = facts?.table?.latest.year ?? facts?.since;
  // The Jahresvergleich: the registrations per month of the years compared
  const isComparison = view === 'vergleich';
  const [compareFrom, compareTo] = facts?.table ? comparedSpan(time.compared, facts.since, latestYear) : [0, 0];
  const comparison = useMemo(
    () => (facts?.table && isComparison ? buildComparison(facts.table, [compareFrom, compareTo], chartSeries, FIELDS.zubau) : null),
    [facts, isComparison, compareFrom, compareTo, chartSeries],
  );

  const per = view === 'jahr' ? 'Jahr' : 'Monat';
  const lead = bestand
    ? `${scopeName} · im Marktstammdatenregister registrierte ${units} insgesamt, am ${view === 'jahr' ? 'Jahresende' : 'Monatsende'}`
    : isComparison
      ? `${scopeName} · neu im Marktstammdatenregister registrierte ${units} je Monat, ${compareFrom}–${compareTo} im Vergleich`
      : `${scopeName} · neu im Marktstammdatenregister registrierte ${units} je ${per}`;
  // The CSV: what the chart shows, a row per year or month and a column per technology shown – in the Jahresvergleich a
  // row per month and a column per year (the technologies shown added up)
  const prefix = bestand ? `Registrierte ${units} insgesamt` : `Registrierte ${units}`;
  const csv =
    periods.length && shown.length
      ? {
          name: 'registrierungen',
          filename: fileName(
            'mastr_registrierungen',
            shown.map((s) => s.id).join('-'),
            region,
            measure === 'bestand' ? 'insgesamt' : null,
            timeSlug(time, facts.since, latestYear),
          ),
          rows: () =>
            comparison
              ? comparison.months.map((m) => ({
                  Monat: m.title,
                  ...Object.fromEntries(comparison.years.map((year) => [`${prefix} ${what} ${year}`, m.values[year]])),
                }))
              : periods.map((p) => {
                  const [year, month] = p.key.split('-').map(Number);
                  return {
                    Jahr: year,
                    ...(month ? { Monat: month } : {}),
                    ...Object.fromEntries(shown.map((s, i) => [`${prefix} ${s.label}`, p.values[chartSeries[i].id]])),
                  };
                }),
        }
      : null;

  return (
    <AnalysisPanel
      id={anchor}
      icon={analysis.icon}
      title={analysis.title}
      lead={lead}
      className="registrations"
      settings={
        <SettingsRow>
          {!stacked && (
            <Setting label="Technologie">
              <SegmentedControl
                label="Technologie"
                value={selected.id}
                onChange={setSelectedId}
                options={series.map((s) => ({ id: s.id, label: s.label }))}
              />
            </Setting>
          )}
          {facts?.table && <TimeControls time={time} since={facts.since} latestYear={latestYear} />}
        </SettingsRow>
      }
    >
      {data.status === 'error' ? (
        <ChartPlaceholder variant="bars" title="Keine Daten" note="Die Registrierungen konnten nicht geladen werden." />
      ) : !facts ? (
        <ChartPlaceholder variant="bars" title="Wird geladen …" />
      ) : (
        <>
          {facts.total > 0 && (
            <p className="registrations__summary">
              <strong>{formatNumber(facts.total)}</strong> {stacked ? `${units} (${what})` : units === 'Einheiten' ? `${what}-Einheiten` : `${units} (${what})`} seit {facts.since}{' '}
              registriert · die meisten {facts.peak.year}: <strong>{formatNumber(facts.peak.units)}</strong>
            </p>
          )}
          {comparison ? (
            <YearComparison
              comparison={comparison}
              kind="count"
              axisLabel="Registrierungen"
              label={`${analysis.title}: ${what}, ${lead}`}
            />
          ) : (
            <StackedChart
              periods={periods}
              series={chartSeries}
              kind={isCurve ? 'area' : 'bars'}
              unit="Anzahl"
              formatValue={count}
              label={`${analysis.title}: ${what}, ${lead}`}
            />
          )}
        </>
      )}
      {stacked && <SeriesLegend series={series} hidden={hidden} onToggle={toggle} />}
      <ChartFoot csv={csv}>
        <p className="timeline__note">
          {note ??
            'Nach Registrierungsdatum, jede Einheit einmal – ob in Betrieb, geplant oder stillgelegt; aus dem Register gelöschte ' +
              'Einheiten fehlen.'}{' '}
          Das Register startete am 31.01.2019, bestehende Anlagen mussten bis 31.01.2021 nachgemeldet werden: daher die vielen
          Registrierungen bis 2021.{isCurve ? '' : ' Hell: laufendes Jahr bzw. laufender Monat.'}
        </p>
      </ChartFoot>
    </AnalysisPanel>
  );
}
