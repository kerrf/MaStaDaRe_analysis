import { PanelLeftClose, RotateCcw } from 'lucide-react';
import ListSelect from '../../components/ui/ListSelect';
import { hasData } from '../../config/dashboards';
import { useFootnote } from './footnoteContext';
import { FIRST_YEAR, MONTHS, WERTE } from './mapTime';
import TechFilters from './TechFilters';
import { selectionOf } from './useDashboardState';
import './sidebar.css';

// A section of the sidebar: its name as a heading above its options
function Section({ title, hint, children }) {
  return (
    <section className="sidebar-section">
      <h3 className="sidebar-section__title">
        {title}
        {hint && <span className="sidebar-section__hint">{hint}</span>}
      </h3>
      {children}
    </section>
  );
}

// Options as pills that wrap: the chosen one filled in the topic's colour
function Pills({ label, options, value, onChange }) {
  return (
    <div className="sidebar-pills" role="radiogroup" aria-label={label}>
      {options.map((o) => {
        const Icon = o.icon;
        const chosen = o.id === value;
        return (
          <button
            key={o.id}
            type="button"
            role="radio"
            aria-checked={chosen}
            title={o.title}
            disabled={o.disabled}
            className={`sidebar-pill${chosen ? ' is-active' : ''}`}
            onClick={() => onChange(o.id)}
          >
            {Icon && <Icon size={15} aria-hidden="true" />}
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

// The period: Jahr or Monat, the year on a slider and in a list, the month in a list
function Period({ time }) {
  const { period, latest, onPeriod } = time;
  const monthIn = (jahr, monat) => (jahr === latest.jahr ? Math.min(monat, latest.monat) : monat);
  const setYear = (jahr) => onPeriod({ jahr, monat: period.monat && monthIn(jahr, period.monat) });
  const years = [];
  for (let y = latest.jahr; y >= FIRST_YEAR; y -= 1) years.push({ value: String(y), label: String(y) });
  return (
    <>
      <Pills
        label="Zeitraster"
        value={period.raster}
        onChange={(raster) => onPeriod(raster === 'monat' ? { jahr: period.jahr, monat: monthIn(period.jahr, 12) } : { jahr: period.jahr, monat: null })}
        options={[
          { id: 'jahr', label: 'Jahr' },
          { id: 'monat', label: 'Monat' },
        ]}
      />
      <div className="sidebar-range">
        <input
          type="range"
          min={FIRST_YEAR}
          max={latest.jahr}
          value={period.jahr}
          aria-label="Jahr"
          onChange={(e) => setYear(Number(e.target.value))}
          style={{ '--fill': `${((period.jahr - FIRST_YEAR) / (latest.jahr - FIRST_YEAR)) * 100}%` }}
        />
        <div className="sidebar-range__ends">
          <span>{FIRST_YEAR}</span>
          <span>{latest.jahr}</span>
        </div>
      </div>
      <div className="sidebar-selects">
        <label className="sidebar-field">
          <span>Jahr</span>
          <ListSelect label="Jahr" className="sidebar-select" value={String(period.jahr)} onChange={(v) => setYear(Number(v))} options={years} />
        </label>
        <label className="sidebar-field">
          <span>Monat</span>
          <ListSelect
            label="Monat"
            className="sidebar-select"
            value={period.monat ? String(period.monat) : ''}
            disabled={period.raster !== 'monat'}
            title={period.raster !== 'monat' ? 'Erst „Monat“ wählen' : undefined}
            onChange={(v) => onPeriod({ jahr: period.jahr, monat: v ? Number(v) : null })}
            options={[
              { value: '', label: 'ganzes Jahr' },
              ...MONTHS.map((label, i) => ({ value: String(i + 1), label, disabled: period.jahr === latest.jahr && i + 1 > latest.monat })),
            ]}
          />
        </label>
      </div>
    </>
  );
}

/**
 * MOCK-UP (branch mockup/sidebar): what the map page shows, in a column on its left – the technology and its filters,
 * the Kennzahl and the Zeitraum, each a section with its name above its options, like the settings panel of
 * SolarPower Europe's charts. How the map shows it (Messgröße, Bezug, Auflösung) stays in the map's card. Narrow
 * screens: a drawer, opened by the button "Einstellungen" above the map. technologies, state: the dashboard's; time:
 * the map in time (MapToolbar's prop) or null; onReset: everything back to the start; onClose: the drawer.
 */
export default function MapSidebar({ technologies, state, time, onReset, onClose }) {
  const { technology } = state;
  const { subtypes, leistung } = selectionOf(technology, state.searchParams);
  const filtered = Boolean(technology.subtypes || technology.leistung);
  useFootnote('leistung', filtered ? technology.leistung?.note : null);
  const changed = state.searchParams.toString() !== '';

  return (
    <aside className="map-sidebar" aria-label="Einstellungen der Karte">
      <header className="map-sidebar__head">
        <h2 className="map-sidebar__title">Einstellungen</h2>
        <button type="button" className="map-sidebar__reset" onClick={onReset} disabled={!changed}>
          <RotateCcw size={14} aria-hidden="true" />
          Zurücksetzen
        </button>
        <button type="button" className="icon-btn map-sidebar__close" onClick={onClose} aria-label="Einstellungen schließen">
          <PanelLeftClose size={16} />
        </button>
      </header>

      <Section title="Technologie">
        <Pills
          label="Technologie"
          value={technology.id}
          onChange={(id) => state.setTechnology(id)}
          options={technologies.map((t) => ({ id: t.id, label: t.label, icon: t.icon, disabled: !hasData(t) }))}
        />
      </Section>

      {filtered && (
        <div className="map-sidebar__filters">
          <TechFilters
            technology={technology}
            subtypes={subtypes}
            onSubtypes={(ids) => state.setSubtypesOf(technology, ids)}
            leistung={leistung}
            onLeistung={(id) => state.setLeistungOf(technology, id)}
          />
        </div>
      )}

      {time && (
        <>
          <Section title="Kennzahl">
            <Pills label="Kennzahl" value={time.wert} onChange={time.onWert} options={WERTE} />
          </Section>
          <Section title="Zeitraum" hint={time.wert === 'geplant' ? 'entfällt bei „In Planung“' : null}>
            {time.wert === 'geplant' ? <p className="map-sidebar__muted">Alle Anlagen, die heute in Planung sind.</p> : <Period time={time} />}
          </Section>
        </>
      )}

      <p className="map-sidebar__mockup">Mock-up · Branch mockup/sidebar</p>
    </aside>
  );
}
