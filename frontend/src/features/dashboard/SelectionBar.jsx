import { footnoteId, hasData } from '../../config/dashboards';
import TechFilters from './TechFilters';

// The choice of technology on the pages without the map's control panel: its chips in a row, the active one's filters
// below (Solar: Anlagenart, Leistung; Wind: Lage). technologies: those the page has something for.
export default function SelectionBar({ technologies, state }) {
  const { technology, subtypes, leistung } = state;
  const filtered = Boolean(technology.subtypes || technology.leistung);
  return (
    <section className="card selection-bar" aria-label="Technologie wählen">
      <div className="selection-bar__row">
        <span className="selection-bar__label">Technologie</span>
        <div className="selection-bar__chips">
          {technologies.map((tech) => {
            const Icon = tech.icon;
            const active = tech.id === technology.id;
            return (
              <button
                key={tech.id}
                type="button"
                className={`tech-chip${active ? ' is-active' : ''}`}
                aria-pressed={active}
                onClick={() => state.setTechnology(tech.id)}
              >
                <Icon size={16} aria-hidden="true" />
                <span className="tech-chip__label">{tech.label}</span>
                {!hasData(tech) && <span className="tech-chip__soon">bald</span>}
              </button>
            );
          })}
        </div>
      </div>
      {filtered && (
        <TechFilters
          technology={technology}
          subtypes={subtypes}
          onSubtypes={state.setSubtypes}
          leistung={leistung}
          onLeistung={state.setLeistung}
        />
      )}
      {technology.leistung?.note && (
        <p id={footnoteId(technology.leistung)} className="selection-bar__note">
          <sup className="footnote-ref">1</sup> {technology.leistung.note}
        </p>
      )}
    </section>
  );
}
