import { useMemo, useState } from 'react';
import StackedChart from '../../components/charts/StackedChart';
import ChartPlaceholder from '../../components/ui/ChartPlaceholder';
import { ChartFoot } from '../../components/ui/CsvLink';
import SegmentedControl from '../../components/ui/SegmentedControl';
import { API_BASE_URL } from '../../config/site';
import { useJson } from '../../lib/data';
import { fileName, round } from '../../lib/files';
import { formatNumber } from '../../lib/format';
import AnalysisPanel from './AnalysisPanel';

// The delay classes of mrt.registrierungsverzug, stacked in this order (the first at the bottom): early, then later
const CLASSES = [
  { id: 'vorab', label: 'vor Inbetriebnahme', color: 'var(--delay-early)' },
  { id: 'bis_1_monat', label: 'bis 1 Monat (Frist)', color: 'var(--delay-in-time)' },
  { id: 'bis_3_monate', label: '1–3 Monate', color: 'var(--delay-months)' },
  { id: 'bis_12_monate', label: '3–12 Monate', color: 'var(--delay-year)' },
  { id: 'spaeter', label: 'über 1 Jahr', color: 'var(--delay-late)' },
];

const percent = (value) => `${formatNumber(value, 1)} %`;
const inTime = (row) => (row.vorab + row.bis_1_monat) / row.units;

// Zeit bis zur Registrierung: how long after going into operation units were registered, per year of commissioning, as
// shares of the units – one technology at a time, Germany-wide (mrt.registrierungsverzug)
export default function RegistrationDelayAnalysis({ analysis, initial, anchor }) {
  const { path, series } = analysis.delay;
  const data = useJson(`${API_BASE_URL}${path}`);
  // initial: the technology to start with (the dashboard's active one), if the switch has it
  const [selectedId, setSelectedId] = useState(() => (series.some((s) => s.id === initial) ? initial : series[0].id));
  const selected = series.find((s) => s.id === selectedId) ?? series[0];

  const view = useMemo(() => {
    if (!data.data) return null;
    const rows = data.data.filter((row) => row.technology === selected.id && row.units > 0);
    if (!rows.length) return { periods: [] };
    const currentYear = new Date().getFullYear();
    const periods = rows.map((row) => ({
      key: String(row.year),
      label: `In Betrieb ${row.year}${row.year === currentYear ? ' (laufendes Jahr)' : ''} · ${formatNumber(row.units)} Einheiten, Median ${formatNumber(row.median_days)} Tage`,
      tick: String(row.year),
      partial: row.year === currentYear,
      values: Object.fromEntries(CLASSES.map((c) => [c.id, (100 * row[c.id]) / row.units])),
    }));
    // The latest year that is over: its late registrations are mostly in
    const complete = rows.filter((row) => row.year < currentYear);
    const last = complete.at(-1) ?? rows.at(-1);
    const total = rows.reduce((sum, row) => sum + row.units, 0);
    const late = rows.reduce((sum, row) => sum + row.spaeter, 0);
    return { rows, periods, last, total, late };
  }, [data.data, selected.id]);
  // The CSV: per year of commissioning the units, their median and the shares of the classes, as the chart shows them
  const csv = view?.periods.length
    ? {
        name: 'registrierungsverzug',
        filename: fileName('mastr_registrierungsverzug', selected.id),
        rows: () =>
          view.rows.map((row) => ({
            'Jahr der Inbetriebnahme': row.year,
            Einheiten: row.units,
            'Median (Tage)': row.median_days,
            // "bis 1 Monat (Frist)" -> "Anteil bis 1 Monat – Frist (%)"
            ...Object.fromEntries(
              CLASSES.map((c) => [`Anteil ${c.label.replace(/ \((.+)\)$/, ' – $1')} (%)`, round((100 * row[c.id]) / row.units, 2)]),
            ),
          })),
      }
    : null;

  return (
    <AnalysisPanel
      id={anchor}
      icon={analysis.icon}
      title={analysis.title}
      lead="Deutschland · Zeit von der Inbetriebnahme bis zur Registrierung im MaStR, Anteile der Einheiten je Inbetriebnahmejahr"
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
      {data.status === 'error' ? (
        <ChartPlaceholder variant="bars" title="Keine Daten" note="Die Registrierungsdauer konnte nicht geladen werden." />
      ) : !view ? (
        <ChartPlaceholder variant="bars" title="Wird geladen …" />
      ) : !view.periods.length ? (
        <ChartPlaceholder variant="bars" title="Keine Einheiten" note={`Seit 2019 ging keine Einheit ${selected.label} in Betrieb.`} />
      ) : (
        <>
          <p className="registrations__summary">
            In Betrieb {view.last.year}: <strong>{percent(100 * inTime(view.last))}</strong> fristgerecht registriert, im Median{' '}
            <strong>{formatNumber(view.last.median_days)} Tage</strong> nach der Inbetriebnahme · seit 2019{' '}
            <strong>{formatNumber(view.late)}</strong> von {formatNumber(view.total)} Einheiten mehr als ein Jahr später
          </p>
          <StackedChart
            periods={view.periods}
            series={CLASSES}
            kind="bars"
            unit="%"
            formatValue={percent}
            valueLabels={false}
            label={`${analysis.title}: ${selected.label}, Anteile je Inbetriebnahmejahr`}
          />
          <div className="timeline-legend" aria-hidden="true">
            {CLASSES.map((c) => (
              <span key={c.id} className="timeline-legend__item is-static">
                <span className="timeline-legend__dot" style={{ background: c.color }} />
                {c.label}
              </span>
            ))}
          </div>
        </>
      )}
      <ChartFoot csv={csv}>
        <p className="timeline__note">
          Seit dem Start des Registers am 31.01.2019 muss eine Einheit spätestens einen Monat nach ihrer Inbetriebnahme
          registriert sein (§ 5 MaStRV); fristgerecht ist auch, wer schon vorher registriert. Einheiten, die vor dem Start in
          Betrieb gingen, hatten bis 31.01.2021 Zeit und fehlen hier. Für die letzten Jahre kommen noch Nachzügler hinzu:
          Ihr Anteil verspäteter Registrierungen steigt noch. Hell: laufendes Jahr.
        </p>
      </ChartFoot>
    </AnalysisPanel>
  );
}
