import ListSelect from '../../components/ui/ListSelect';
import SegmentedControl from '../../components/ui/SegmentedControl';
import Setting, { SettingsRow } from '../../components/ui/Setting';
import { BASES, GRANULARITIES, QUANTITIES, isAvailable } from '../../config/dashboards';
import { SMOOTHINGS } from '../../lib/heatmap';

// What an option of the Kennzahl means, as its tooltip: the metric's name and unit (on the continuous map: its density)
const titleOf = (metric) => (metric.basis === 'dichte' ? `${metric.heat.legend} (${metric.heat.unit})` : `${metric.legend} (${metric.unit})`);

/**
 * How the map shows what the sidebar chose (MapSidebar): the card's band above the map – the Messgröße and its Bezug
 * (Leistung or Kapazität; absolut, je km² or je Einwohner), the resolution (for the continuous map its smoothing), each
 * in its box. Chosen options in green, like every setting of a card. time: the map in time (its `active`: the
 * resolutions without it are marked) or null.
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

    </SettingsRow>
  );
}
