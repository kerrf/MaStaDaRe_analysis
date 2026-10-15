import SegmentedControl from '../../components/ui/SegmentedControl';
import { BASES, GRANULARITIES, QUANTITIES, isAvailable } from '../../config/dashboards';
import { SMOOTHINGS } from '../../lib/heatmap';

// One setting of the toolbar: its name above it
function Group({ label, htmlFor, children }) {
  return (
    <div className="map-toolbar__group">
      {htmlFor ? (
        <label className="map-toolbar__label" htmlFor={htmlFor}>
          {label}
        </label>
      ) : (
        <span className="map-toolbar__label">{label}</span>
      )}
      {children}
    </div>
  );
}

// What an option of the Kennzahl means, as its tooltip: the metric's name and unit (on the continuous map: its density)
const titleOf = (metric) => (metric.basis === 'dichte' ? `${metric.heat.legend} (${metric.heat.unit})` : `${metric.legend} (${metric.unit})`);

/**
 * How the map shows the technology chosen above it (SelectionBar): in a band between its title and the map, like the
 * toolbar of a map app – the Kennzahl in two steps (Leistung or Kapazität, then absolut, je km² or je Einwohner), the
 * resolution (for the continuous map its smoothing) in a row. Chosen options in green, like every setting of a card.
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
}) {
  // The Kennzahl's two rows, the same for every technology – also where a row has a single choice (Erzeuger: only
  // Leistung; plants: only absolut). A new quantity keeps the basis where it has one.
  const quantities = QUANTITIES.filter((q) => metrics.some((m) => m.quantity === q.id));
  const bases = BASES.filter((b) => metrics.some((m) => m.quantity === metric.quantity && m.basis === b.id));
  const metricOf = (quantity, basis) =>
    metrics.find((m) => m.quantity === quantity && m.basis === basis) ?? metrics.find((m) => m.quantity === quantity);
  return (
    <div className="map-toolbar" role="group" aria-label="Darstellung der Karte">
      <div className="map-toolbar__row">
        <Group label="Kennzahl">
          <SegmentedControl
            label="Kennzahl"
            value={metric.quantity}
            onChange={(quantity) => onMetric(metricOf(quantity, metric.basis).id)}
            options={quantities.map((q) => ({ id: q.id, label: q.label, title: titleOf(metricOf(q.id, metric.basis)) }))}
          />
        </Group>

        <Group label="Bezug">
          <SegmentedControl
            label="Bezug"
            value={metric.basis}
            onChange={(basis) => onMetric(metricOf(metric.quantity, basis).id)}
            options={bases.map((b) => ({ id: b.id, label: b.label, title: titleOf(metricOf(metric.quantity, b.id)) }))}
          />
        </Group>

        {!technology.plantsPath && (
          <Group label="Räumliche Auflösung" htmlFor="map-granularity">
            <select id="map-granularity" className="timeline__select map-toolbar__select" value={granularity.id} onChange={(e) => onGranularity(e.target.value)}>
              {GRANULARITIES.map((g) => (
                <option key={g.id} value={g.id} disabled={!isAvailable(g, technology)}>
                  {g.label}
                  {!isAvailable(g, technology) ? ' – nicht verfügbar' : ''}
                </option>
              ))}
            </select>
          </Group>
        )}

        {granularity.kind === 'heatmap' && onSmoothing && (
          <Group label="Glättung">
            <SegmentedControl
              label="Glättung"
              value={smoothing}
              onChange={onSmoothing}
              options={Object.entries(SMOOTHINGS).map(([id, s]) => ({ id, label: s.label, title: `Zusätzlich geglättet über ${s.px} Bildpunkte` }))}
            />
          </Group>
        )}
      </div>
    </div>
  );
}
