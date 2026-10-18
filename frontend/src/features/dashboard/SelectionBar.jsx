import { X } from 'lucide-react';
import Setting, { SettingsRow } from '../../components/ui/Setting';
import { hasData } from '../../config/dashboards';
import { useFootnote } from './footnoteContext';
import TechFilters from './TechFilters';
import { selectionOf } from './useDashboardState';

/**
 * What a page shows, above all it shows of it: a band of settings like every other (Setting), its first row the
 * technology and the active one's filters right after it (Solar: Anlagenart, Leistung; Gas: its kinds), in the topic's
 * colour – apart from the green of how a chart or the map shows it (Kennzahl, Bezug, Zeitraster). Narrowed by a filter,
 * the row says so on its right, with the way back to all. One look on every page that has a choice of technology
 * (Karte, Regionen im Detail, Anlagen, Regionen im Vergleich).
 * technologies: those the page has something for – also a single one, so every page looks the same; active: the one the
 * page shows (default: the URL's). Its selection comes from the URL, its own parameters. filters: whether the page
 * narrows the technology down by them (Regionen im Detail of the batteries doesn't). label: the box's name (the
 * Netzanschlüsse: "Anschlüsse"). inCard: as the top band of a card (the map's), without a frame of its own. children:
 * further rows of the band (the map's toolbar; wind: which turbines, coloured by what).
 */
export default function SelectionBar({
  technologies,
  state,
  active: technology = state.technology,
  filters = true,
  label = 'Technologie',
  inCard = false,
  children,
}) {
  const { subtypes, leistung, note } = selectionOf(technology, state.searchParams);
  const filtered = filters && Boolean(technology.subtypes || technology.leistung);
  const narrowed = filtered && Boolean(note);
  // What the Leistung means: a remark at the page's bottom (footnotes), marked at its switch
  useFootnote('leistung', filtered ? technology.leistung?.note : null);
  const aside = narrowed && (
    <>
      <span>
        Gefiltert: <strong>{note.replace(/^ · /, '')}</strong>
      </span>
      <button type="button" className="settings-reset" onClick={() => state.setSubtypesOf(technology, technology.subtypes.options.map((o) => o.id))}>
        <X size={14} aria-hidden="true" />
        Filter aufheben
      </button>
    </>
  );
  return (
    <section className={`selection-bar settings-band${inCard ? ' selection-bar--in-card' : ''}`} aria-label="Technologie und Filter">
      <SettingsRow aside={aside}>
        <Setting label={label} tone="topic">
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
        </Setting>
        {filtered && (
          <TechFilters
            technology={technology}
            subtypes={subtypes}
            onSubtypes={(ids) => state.setSubtypesOf(technology, ids)}
            leistung={leistung}
            onLeistung={(id) => state.setLeistungOf(technology, id)}
          />
        )}
      </SettingsRow>
      {children}
    </section>
  );
}
