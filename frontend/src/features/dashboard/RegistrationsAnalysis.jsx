import { useMemo, useState } from 'react';
import StackedChart from '../../components/charts/StackedChart';
import ChartPlaceholder from '../../components/ui/ChartPlaceholder';
import SegmentedControl from '../../components/ui/SegmentedControl';
import { API_BASE_URL } from '../../config/site';
import { useJson } from '../../lib/data';
import { formatNumber } from '../../lib/format';
import AnalysisPanel from './AnalysisPanel';

const count = (value) => formatNumber(value);

// Registrierungen im MaStR: units registered per year, Germany-wide, one technology at a time – not stacked, the
// technologies differ by orders of magnitude (mrt.registrierungen, aggregate_registrierungen.sql).
export default function RegistrationsAnalysis({ analysis, initial, anchor }) {
  const { path, series } = analysis.registrations;
  const data = useJson(`${API_BASE_URL}${path}`);
  // initial: the technology to start with (the dashboard's active one), if the switch has it
  const [selectedId, setSelectedId] = useState(() => (series.some((s) => s.id === initial) ? initial : series[0].id));
  const selected = series.find((s) => s.id === selectedId) ?? series[0];

  const view = useMemo(() => {
    if (!data.data) return null;
    const rows = data.data.filter((row) => row.technology === selected.id);
    if (!rows.length) return { periods: [] };
    const lastYear = Math.max(...rows.map((row) => row.year));
    const peak = rows.reduce((best, row) => (row.units > best.units ? row : best));
    return {
      periods: rows.map((row) => ({
        key: String(row.year),
        label: row.year === lastYear ? `${row.year} (laufendes Jahr)` : String(row.year),
        tick: String(row.year),
        partial: row.year === lastYear,
        values: { [selected.id]: row.units },
      })),
      total: rows.reduce((sum, row) => sum + row.units, 0),
      first: rows[0].year,
      peak,
    };
  }, [data.data, selected.id]);

  return (
    <AnalysisPanel
      id={anchor}
      icon={analysis.icon}
      title={analysis.title}
      lead="Deutschland · neu im Marktstammdatenregister registrierte Einheiten je Jahr"
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
        <ChartPlaceholder variant="bars" title="Keine Daten" note="Die Registrierungen konnten nicht geladen werden." />
      ) : !view ? (
        <ChartPlaceholder variant="bars" title="Wird geladen …" />
      ) : (
        <>
          {view.total > 0 && (
            <p className="registrations__summary">
              <strong>{formatNumber(view.total)}</strong> {selected.label}-Einheiten seit {view.first} registriert · die meisten{' '}
              {view.peak.year}: <strong>{formatNumber(view.peak.units)}</strong>
            </p>
          )}
          <StackedChart
            periods={view.periods}
            series={[{ id: selected.id, label: 'Registrierungen', color: selected.color }]}
            kind="bars"
            unit="Anzahl"
            formatValue={count}
            label={`${analysis.title}: ${selected.label}, neu registrierte Einheiten je Jahr`}
          />
        </>
      )}
      <p className="timeline__note">
        Nach Registrierungsdatum, jede Einheit einmal – ob in Betrieb, geplant oder stillgelegt; aus dem Register gelöschte
        Einheiten fehlen. Das Register startete am 31.01.2019, bestehende Anlagen mussten bis 31.01.2021 nachgemeldet werden:
        daher die vielen Registrierungen bis 2021. Hell: laufendes Jahr.
      </p>
    </AnalysisPanel>
  );
}
