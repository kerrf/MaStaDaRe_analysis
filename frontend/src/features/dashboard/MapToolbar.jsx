import SegmentedControl from '../../components/ui/SegmentedControl';
import { GRANULARITIES, hasData, isAvailable } from '../../config/dashboards';
import { SMOOTHINGS } from '../../lib/heatmap';
import TechFilters from './TechFilters';

// One setting of the toolbar: its name above it
function Group({ label, htmlFor, children, wide = false }) {
  return (
    <div className={`map-toolbar__group${wide ? ' is-wide' : ''}`}>
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

/**
 * The settings of the map in a band between its title and the map, like the toolbar of a map app: technology, Kennzahl,
 * resolution (for the continuous map its smoothing) in a row, the active technology's filters (Solar: Anlagenart,
 * Leistung) below them.
 */
export default function MapToolbar({
  config,
  technology,
  onTechnology,
  subtypes,
  onSubtypes,
  leistung,
  onLeistung,
  metrics,
  metric,
  onMetric,
  granularity,
  onGranularity,
  smoothing,
  onSmoothing,
}) {
  const filtered = Boolean(technology.subtypes || technology.leistung);
  return (
    <div className="map-toolbar" role="group" aria-label="Ansicht anpassen">
      <div className="map-toolbar__row">
        <Group label="Technologie" wide>
          <div className="map-toolbar__chips">
            {config.technologies.map((tech) => {
              const Icon = tech.icon;
              const active = tech.id === technology.id;
              return (
                <button
                  key={tech.id}
                  type="button"
                  className={`tech-chip${active ? ' is-active' : ''}`}
                  aria-pressed={active}
                  aria-controls={active && filtered ? `filter-${tech.id}` : undefined}
                  onClick={() => onTechnology(tech.id)}
                >
                  <Icon size={15} aria-hidden="true" />
                  <span className="tech-chip__label">{tech.label}</span>
                  {!hasData(tech) && <span className="tech-chip__soon">bald</span>}
                </button>
              );
            })}
          </div>
        </Group>

        {metrics.length > 1 && (
          <Group label="Kennzahl">
            <SegmentedControl
              label="Kennzahl"
              value={metric.id}
              onChange={onMetric}
              options={metrics.map((m) => ({ id: m.id, label: m.label, title: `${m.legend} (${m.unit})` }))}
            />
          </Group>
        )}

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

        {config.segments && (
          <Group label={`${config.segments.label} · folgt`}>
            <SegmentedControl
              label={config.segments.label}
              value="alle"
              onChange={() => {}}
              options={config.segments.options.map((o) => ({ ...o, disabled: o.id !== 'alle' }))}
            />
          </Group>
        )}
      </div>

      {filtered && (
        <TechFilters technology={technology} subtypes={subtypes} onSubtypes={onSubtypes} leistung={leistung} onLeistung={onLeistung} inline />
      )}
    </div>
  );
}
