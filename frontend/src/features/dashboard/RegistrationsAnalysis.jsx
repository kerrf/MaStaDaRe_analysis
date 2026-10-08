import { useMemo, useState } from 'react';
import StackedChart from '../../components/charts/StackedChart';
import ChartPlaceholder from '../../components/ui/ChartPlaceholder';
import { ChartFoot } from '../../components/ui/CsvLink';
import SegmentedControl from '../../components/ui/SegmentedControl';
import { API_BASE_URL } from '../../config/site';
import { useJson } from '../../lib/data';
import { fileName } from '../../lib/files';
import { formatNumber } from '../../lib/format';
import AnalysisPanel from './AnalysisPanel';
import TimeControls from './TimeControls';
import { buildPeriods, indexRows, timeSlug, useTimeView } from './timeView';

const count = (value) => formatNumber(value);
// The values of a row of mrt.registrierungen: registered in the period, all registered up to its end
const FIELDS = { zubau: 'units', bestand: 'total' };

// Registrierungen im MaStR: units registered per year or month, Germany-wide, one technology at a time – not stacked,
// the technologies differ by orders of magnitude (mrt.registrierungen, aggregate_registrierungen.sql). The same time
// controls as the Ausbau im Zeitverlauf: aggregiert (all registered so far), Jährlich or Monatlich, the span.
export default function RegistrationsAnalysis({ analysis, initial, anchor }) {
  const { path, series } = analysis.registrations;
  const data = useJson(`${API_BASE_URL}${path}`);
  // initial: the technology to start with (the dashboard's active one), if the switch has it
  const [selectedId, setSelectedId] = useState(() => (series.some((s) => s.id === initial) ? initial : series[0].id));
  const selected = series.find((s) => s.id === selectedId) ?? series[0];
  const time = useTimeView();
  const { view, range, years: span, measure, isCurve } = time;
  const bestand = measure === 'bestand';

  // The technology's rows by period, its first year, and over its years the total and the year with the most
  const facts = useMemo(() => {
    if (!data.data) return null;
    const rows = data.data.filter((row) => row.technology === selected.id);
    const yearly = rows.filter((row) => row.month == null);
    if (!yearly.length) return { table: null };
    return {
      table: indexRows(rows, new Map([[selected.id, selected.id]])),
      since: yearly[0].year,
      total: yearly.at(-1).total,
      peak: yearly.reduce((best, row) => (row.units > best.units ? row : best)),
    };
  }, [data.data, selected.id]);
  const chartSeries = useMemo(() => [{ id: selected.id, label: bestand ? 'Registriert insgesamt' : 'Registrierungen', color: selected.color }], [selected, bestand]);
  const periods = useMemo(
    () => (facts?.table ? buildPeriods(facts.table, { view, range, years: span, measure }, chartSeries, facts.since, FIELDS) : []),
    [facts, view, range, span, measure, chartSeries],
  );
  const latestYear = facts?.table?.latest.year ?? facts?.since;

  const per = view === 'jahr' ? 'Jahr' : 'Monat';
  const lead = bestand
    ? `Deutschland · im Marktstammdatenregister registrierte Einheiten insgesamt, am ${view === 'jahr' ? 'Jahresende' : 'Monatsende'}`
    : `Deutschland · neu im Marktstammdatenregister registrierte Einheiten je ${per}`;
  // The CSV: what the chart shows, a row per year or month
  const column = `${bestand ? 'Registrierte Einheiten insgesamt' : 'Registrierte Einheiten'} ${selected.label}`;
  const csv = periods.length
    ? {
        name: 'registrierungen',
        filename: fileName('mastr_registrierungen', selected.id, measure === 'bestand' ? 'insgesamt' : null, timeSlug(time, facts.since, latestYear)),
        rows: () =>
          periods.map((p) => {
            const [year, month] = p.key.split('-').map(Number);
            return { Jahr: year, ...(month ? { Monat: month } : {}), [column]: p.values[selected.id] };
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
      tools={
        <SegmentedControl
          label="Technologie"
          value={selected.id}
          onChange={setSelectedId}
          options={series.map((s) => ({ id: s.id, label: s.label }))}
        />
      }
    >
      {facts?.table && (
        <div className="timeline__controls">
          <TimeControls id={analysis.id} time={time} since={facts.since} latestYear={latestYear} />
        </div>
      )}
      {data.status === 'error' ? (
        <ChartPlaceholder variant="bars" title="Keine Daten" note="Die Registrierungen konnten nicht geladen werden." />
      ) : !facts ? (
        <ChartPlaceholder variant="bars" title="Wird geladen …" />
      ) : (
        <>
          {facts.total > 0 && (
            <p className="registrations__summary">
              <strong>{formatNumber(facts.total)}</strong> {selected.label}-Einheiten seit {facts.since} registriert · die meisten{' '}
              {facts.peak.year}: <strong>{formatNumber(facts.peak.units)}</strong>
            </p>
          )}
          <StackedChart
            periods={periods}
            series={chartSeries}
            kind={isCurve ? 'area' : 'bars'}
            unit="Anzahl"
            formatValue={count}
            label={`${analysis.title}: ${selected.label}, ${lead}`}
          />
        </>
      )}
      <ChartFoot csv={csv}>
        <p className="timeline__note">
          Nach Registrierungsdatum, jede Einheit einmal – ob in Betrieb, geplant oder stillgelegt; aus dem Register gelöschte
          Einheiten fehlen. Das Register startete am 31.01.2019, bestehende Anlagen mussten bis 31.01.2021 nachgemeldet
          werden: daher die vielen Registrierungen bis 2021.{isCurve ? '' : ' Hell: laufendes Jahr bzw. laufender Monat.'}
        </p>
      </ChartFoot>
    </AnalysisPanel>
  );
}
