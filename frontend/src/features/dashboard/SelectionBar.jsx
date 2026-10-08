import { footnoteId, hasData } from '../../config/dashboards';
import TechFilters from './TechFilters';

// The choice of technology on the pages without the map's control panel (Anlagen, Regionen im Vergleich), as a tray
// like the map's settings band: the chips under their name, the active one's filters in a row below, hanging off it
// (Solar: Anlagenart, Leistung; Wind: Lage; Gas: its kinds), the footnote last. technologies: those the page has
// something for – also a single one, so every dashboard's page looks the same; active: the one the page shows (default:
// the URL's).
export default function SelectionBar({ technologies, state, active: technology = state.technology }) {
  const { subtypes, leistung } = state;
  const own = technology === state.technology;
  const filtered = own && Boolean(technology.subtypes || technology.leistung);
  return (
    <section className="selection-bar" aria-label="Technologie wählen">
      <div className="selection-bar__group">
        <span id="selection-technologie" className="selection-bar__label">
          Technologie
        </span>
        <div className="selection-bar__chips" role="group" aria-labelledby="selection-technologie">
          {technologies.map((tech) => {
            const Icon = tech.icon;
            const chosen = tech.id === technology.id;
            return (
              <button
                key={tech.id}
                type="button"
                className={`tech-chip${chosen ? ' is-active' : ''}`}
                aria-pressed={chosen}
                onClick={() => state.setTechnology(tech.id)}
              >
                <Icon size={15} aria-hidden="true" />
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
          inline
        />
      )}
      {filtered && technology.leistung?.note && (
        <p id={footnoteId(technology.leistung)} className="selection-bar__note">
          <sup className="footnote-ref">1</sup> {technology.leistung.note}
        </p>
      )}
    </section>
  );
}
