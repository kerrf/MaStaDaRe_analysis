import ListSelect from '../../components/ui/ListSelect';
import SegmentedControl from '../../components/ui/SegmentedControl';
import Setting, { SettingsRow } from '../../components/ui/Setting';
import { BASES, GRANULARITIES, QUANTITIES, isAvailable } from '../../config/dashboards';
import { SMOOTHINGS } from '../../lib/heatmap';
import { FIRST_YEAR, MONTHS, WERTE } from './mapTime';

// What an option of the Kennzahl means, as its tooltip: the metric's name and unit (on the continuous map: its density)
const titleOf = (metric) => (metric.basis === 'dichte' ? `${metric.heat.legend} (${metric.heat.unit})` : `${metric.legend} (${metric.unit})`);

// The period of the map in time, on the row's right: a year or a month of it, from 2000 up to the Datenstand
function PeriodSetting({ time }) {
  const { period, latest, onPeriod } = time;
  const years = [];
  for (let y = latest.jahr; y >= FIRST_YEAR; y -= 1) years.push({ value: String(y), label: String(y) });
  const months = MONTHS.map((label, i) => ({ value: String(i + 1), label, disabled: period.jahr === latest.jahr && i + 1 > latest.monat }));
  // A month of the newest year after the Datenstand's goes back to the Datenstand's month
  const monthIn = (jahr, monat) => (jahr === latest.jahr ? Math.min(monat, latest.monat) : monat);
  const planned = time.wert === 'geplant';
  return (
    <Setting label="Zeitraum" className="setting--end">
      {planned ? (
        <span className="map-toolbar__no-period">alle geplanten, ohne Zeitraum</span>
      ) : (
        <>
          <SegmentedControl
            label="Zeitraster"
            value={period.raster}
            onChange={(raster) =>
              onPeriod(raster === 'monat' ? { jahr: period.jahr, monat: monthIn(period.jahr, 12) } : { jahr: period.jahr, monat: null })
            }
            options={[
              { id: 'jahr', label: 'Jahr' },
              { id: 'monat', label: 'Monat' },
            ]}
          />
          <ListSelect
            label="Jahr"
            className="map-toolbar__year"
            value={String(period.jahr)}
            onChange={(value) => onPeriod({ jahr: Number(value), monat: period.monat && monthIn(Number(value), period.monat) })}
            options={years}
          />
          {period.raster === 'monat' && (
            <ListSelect
              label="Monat"
              className="map-toolbar__month"
              value={String(period.monat)}
              onChange={(value) => onPeriod({ jahr: period.jahr, monat: Number(value) })}
              options={months}
            />
          )}
        </>
      )}
    </Setting>
  );
}

/**
 * How the map shows the technology chosen above it: the second row of the card's band (SelectionBar) – with time
 * (`time`, the technologies of the map in time) first the Kennzahl (Bestand, Zubau, Stilllegungen, In Planung), then
 * the Messgröße and its Bezug (Leistung or Kapazität; absolut, je km² or je Einwohner), the resolution (for the
 * continuous map its smoothing), and on the right the period. Chosen options in green, like every setting of a card.
 * time: { wert, onWert, period, onPeriod, latest } or null.
 */
export default function MapToolbar({
  technology,
  metrics,
  metric,
  onMetric,
  granularity,
  onGranularity,
  smoothing,
  onSmoothing,
  time,
}) {
  // The Kennzahl's two rows, the same for every technology – also where a row has a single choice (Erzeuger: only
  // Leistung; plants: only absolut). A new quantity keeps the basis where it has one.
  const quantities = QUANTITIES.filter((q) => metrics.some((m) => m.quantity === q.id));
  const bases = BASES.filter((b) => metrics.some((m) => m.quantity === metric.quantity && m.basis === b.id));
  const metricOf = (quantity, basis) =>
    metrics.find((m) => m.quantity === quantity && m.basis === basis) ?? metrics.find((m) => m.quantity === quantity);
  return (
    <SettingsRow label="Darstellung der Karte">
      {time && (
        <Setting label="Kennzahl">
          <SegmentedControl
            label="Kennzahl"
            value={time.wert}
            onChange={time.onWert}
            options={WERTE.map(({ id, label, title }) => ({ id, label, title }))}
          />
        </Setting>
      )}

      <Setting label="Messgröße">
        <SegmentedControl
          label="Messgröße"
          value={metric.quantity}
          onChange={(quantity) => onMetric(metricOf(quantity, metric.basis).id)}
          options={quantities.map((q) => ({ id: q.id, label: q.label, title: titleOf(metricOf(q.id, metric.basis)) }))}
        />
      </Setting>

      <Setting label="Bezug">
        <SegmentedControl
          label="Bezug"
          value={metric.basis}
          onChange={(basis) => onMetric(metricOf(metric.quantity, basis).id)}
          options={bases.map((b) => ({ id: b.id, label: b.label, title: titleOf(metricOf(metric.quantity, b.id)) }))}
        />
      </Setting>

      {!technology.plantsPath && (
        <Setting label="Räumliche Auflösung">
          <ListSelect
            label="Räumliche Auflösung"
            className="map-toolbar__select"
            value={granularity.id}
            onChange={onGranularity}
            options={GRANULARITIES.map((g) => {
              // The map in time has the Länder, Kreise and Gemeinden only
              const timeless = time?.active && !g.apiLevel?.match(/^(bundesland|landkreis|gemeinde)$/);
              return {
                value: g.id,
                label: !isAvailable(g, technology) ? `${g.label} – nicht verfügbar` : timeless ? `${g.label} – nur heutiger Bestand` : g.label,
                disabled: !isAvailable(g, technology) || timeless,
              };
            })}
          />
        </Setting>
      )}

      {granularity.kind === 'heatmap' && onSmoothing && (
        <Setting label="Glättung">
          <SegmentedControl
            label="Glättung"
            value={smoothing}
            onChange={onSmoothing}
            options={Object.entries(SMOOTHINGS).map(([id, s]) => ({ id, label: s.label, title: `Zusätzlich geglättet über ${s.px} Bildpunkte` }))}
          />
        </Setting>
      )}

      {time && <PeriodSetting time={time} />}
    </SettingsRow>
  );
}
