import { footnoteId, hasData } from '../../config/dashboards';
import TechFilters from './TechFilters';
import { selectionOf } from './useDashboardState';

/**
 * What a page shows, above all it shows of it: the technology, and the active one's filters in a row below that hangs
 * off it (Solar: Anlagenart, Leistung; Gas: its kinds), the footnote last. One look on every page that has a choice of
 * technology (Karte, Regionen im Detail, Anlagen, Regionen im Vergleich): the technology and its filters in the topic's
 * colour, apart from the green of how a chart or the map shows it (Kennzahl, Bezug, Zeitraster), which stays in its card.
 * technologies: those the page has something for – also a single one, so every page looks the same; active: the one the
 * page shows (default: the URL's). Its selection comes from the URL, its own parameters. filters: whether the page
 * narrows the technology down by them (Regionen im Detail of the batteries doesn't). label: the row's name (the
 * Netzanschlüsse: "Anschlüsse"). inCard: as the top bands of a card (the map's), without a frame of its own.
 */
export default function SelectionBar({
  technologies,
  state,
  active: technology = state.technology,
  filters = true,
  label = 'Technologie',
  inCard = false,
}) {
  const { subtypes, leistung } = selectionOf(technology, state.searchParams);
  const filtered = filters && Boolean(technology.subtypes || technology.leistung);
  const note = technology.leistung?.note;
  return (
    <section className={`selection-bar${inCard ? ' selection-bar--in-card' : ''}`} aria-label="Technologie und Filter">
      <div className="selection-bar__row">
        <span id="selection-technologie" className="selection-bar__label">
          {label}
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
                aria-controls={chosen && filtered ? `filter-${tech.id}` : undefined}
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
          onSubtypes={(ids) => state.setSubtypesOf(technology, ids)}
          leistung={leistung}
          onLeistung={(id) => state.setLeistungOf(technology, id)}
        />
      )}
      {filtered && note && (
        <p id={footnoteId(technology.leistung)} className="selection-bar__note">
          <sup className="footnote-ref">1</sup> {note}
        </p>
      )}
    </section>
  );
}
