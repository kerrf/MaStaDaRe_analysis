import { useEffect, useId, useRef, useState } from 'react';
import { CalendarRange, Check, ChevronDown, PanelLeftClose, RotateCcw } from 'lucide-react';
import ListSelect from '../../components/ui/ListSelect';
import { hasData } from '../../config/dashboards';
import { useFootnote } from './footnoteContext';
import { FIRST_YEAR, MONTHS, WERTE, periodNote } from './mapTime';
import TechFilters from './TechFilters';
import { selectionOf } from './useDashboardState';
import './sidebar.css';

// A setting with many choices as a menu that opens below its name: closed, the current choice below the name (its
// icon and label, on a line of its own: long names fit); open, every choice as a row, the current one ticked. A choice keeps it open, to try the next.
function MenuSection({ title, label, options, value, onChange, defaultOpen = false }) {
  const [open, setOpen] = useState(defaultOpen);
  const id = useId();
  const current = options.find((o) => o.id === value);
  const CurrentIcon = current?.icon;
  return (
    <section className={`sidebar-section sidebar-menu${open ? ' is-open' : ''}`}>
      <button type="button" className="sidebar-menu__head" aria-expanded={open} aria-controls={id} onClick={() => setOpen((v) => !v)}>
        <span className="sidebar-menu__text">
          <span className="sidebar-section__title">{title}</span>
          <span className="sidebar-menu__current">
            {CurrentIcon && <CurrentIcon size={14} aria-hidden="true" />}
            <span className="sidebar-menu__current-label">{current?.label}</span>
          </span>
        </span>
        <ChevronDown size={16} className="sidebar-menu__chevron" aria-hidden="true" />
      </button>
      {/* Always there, closed by its height (sidebar.css: rows 0fr → 1fr), so it opens smoothly; inert while closed */}
      <div id={id} className="sidebar-menu__body" inert={!open}>
        <div className="sidebar-menu__list" role="radiogroup" aria-label={label}>
          {options.map((o) => {
            const Icon = o.icon;
            const chosen = o.id === value;
            return (
              <button
                key={o.id}
                type="button"
                role="radio"
                aria-checked={chosen}
                disabled={o.disabled}
                className={`sidebar-option${chosen ? ' is-active' : ''}`}
                onClick={() => onChange(o.id)}
              >
                {Icon && <Icon size={16} className="sidebar-option__icon" aria-hidden="true" />}
                <span className="sidebar-option__text">
                  <span className="sidebar-option__label">{o.label}</span>
                  {o.title && <span className="sidebar-option__hint">{o.title}</span>}
                </span>
                {chosen && <Check size={16} className="sidebar-option__check" aria-hidden="true" />}
              </button>
            );
          })}
        </div>
      </div>
    </section>
  );
}

// Two equal halves, one chosen (Jahr or Monat)
function Segments({ label, options, value, onChange }) {
  return (
    <div className="sidebar-segments" role="radiogroup" aria-label={label}>
      {options.map((o) => (
        <button
          key={o.id}
          type="button"
          role="radio"
          aria-checked={o.id === value}
          className={`sidebar-segments__option${o.id === value ? ' is-active' : ''}`}
          onClick={() => onChange(o.id)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

// The period: Jahr or Monat, then the year and the month in lists
function Period({ time }) {
  const { period, latest, onPeriod } = time;
  const monthIn = (jahr, monat) => (jahr === latest.jahr ? Math.min(monat, latest.monat) : monat);
  const years = [];
  for (let y = latest.jahr; y >= FIRST_YEAR; y -= 1) years.push({ value: String(y), label: String(y) });
  const byMonth = period.raster === 'monat';
  return (
    <>
      <Segments
        label="Zeitraster"
        value={period.raster}
        onChange={(raster) => onPeriod(raster === 'monat' ? { jahr: period.jahr, monat: monthIn(period.jahr, 12) } : { jahr: period.jahr, monat: null })}
        options={[
          { id: 'jahr', label: 'Jahr' },
          { id: 'monat', label: 'Monat' },
        ]}
      />
      <div className={`sidebar-selects${byMonth ? ' has-month' : ''}`}>
        <ListSelect
          label="Jahr"
          className="sidebar-select"
          value={String(period.jahr)}
          onChange={(v) => onPeriod({ jahr: Number(v), monat: period.monat && monthIn(Number(v), period.monat) })}
          options={years}
        />
        {byMonth && (
          <ListSelect
            label="Monat"
            className="sidebar-select"
            value={String(period.monat)}
            onChange={(v) => onPeriod({ jahr: period.jahr, monat: Number(v) })}
            options={MONTHS.map((label, i) => ({ value: String(i + 1), label, disabled: period.jahr === latest.jahr && i + 1 > latest.monat }))}
          />
        )}
      </div>
    </>
  );
}

// Sticky beside the map only while it fits the window: never a column that scrolls on its own
function useFitsWindow(ref) {
  const [fits, setFits] = useState(true);
  useEffect(() => {
    const element = ref.current;
    if (!element) return undefined;
    const check = () => {
      // The column's place below the navigation bar (sticky top in sidebar.css), not its current top: no flip-flop
      const top = (parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--nav-h')) || 64) + 12;
      setFits(element.offsetHeight + top + 16 <= window.innerHeight);
    };
    check();
    const observer = new ResizeObserver(check);
    observer.observe(element);
    window.addEventListener('resize', check);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', check);
    };
  }, [ref]);
  return fits;
}

/**
 * What the map page shows, in a column on its left – the technology and the Kennzahl
 * as menus (closed: the current choice beside their name), the technology's filters, the Zeitraum with what it means in
 * words. How the map shows it (Messgröße, Bezug, Auflösung) stays in the map's card. Narrow screens: a drawer, opened by
 * "Einstellungen" above the map. technologies, state: the dashboard's; time: the map in time (MapToolbar's prop) or
 * null; onReset: everything back to the start; onClose: the drawer.
 */
export default function MapSidebar({ technologies, state, time, onReset, onClose }) {
  const { technology } = state;
  const { subtypes, leistung } = selectionOf(technology, state.searchParams);
  const filtered = Boolean(technology.subtypes || technology.leistung);
  useFootnote('leistung', filtered ? technology.leistung?.note : null);
  const changed = state.searchParams.toString() !== '';
  const ref = useRef(null);
  const fits = useFitsWindow(ref);
  // The technology's filters: after the Kennzahl, where there is one, else after the technology
  const filters = filtered && (
    <div className="map-sidebar__filters">
      <TechFilters
        technology={technology}
        subtypes={subtypes}
        onSubtypes={(ids) => state.setSubtypesOf(technology, ids)}
        leistung={leistung}
        onLeistung={(id) => state.setLeistungOf(technology, id)}
      />
    </div>
  );

  return (
    <aside ref={ref} className={`map-sidebar${fits ? ' is-sticky' : ''}`} aria-label="Einstellungen der Karte">
      <header className="map-sidebar__head">
        <h2 className="map-sidebar__title">Einstellungen</h2>
        <button type="button" className="map-sidebar__reset" onClick={onReset} disabled={!changed} title="Alle Einstellungen der Karte zurücksetzen">
          <RotateCcw size={13} aria-hidden="true" />
          Zurücksetzen
        </button>
        <button type="button" className="icon-btn map-sidebar__close" onClick={onClose} aria-label="Einstellungen schließen">
          <PanelLeftClose size={16} />
        </button>
      </header>

      <MenuSection
        title="Technologie"
        label="Technologie"
        value={technology.id}
        onChange={(id) => state.setTechnology(id)}
        options={technologies.map((t) => ({ id: t.id, label: t.label, icon: t.icon, disabled: !hasData(t) }))}
      />

      {!time && filters}

      {time && (
        <>
          <MenuSection title="Kennzahl" label="Kennzahl" value={time.wert} onChange={time.onWert} options={WERTE} />
          {filters}

          <section className="sidebar-section">
            <h3 className="sidebar-section__title">Zeitraum</h3>
            {time.wert !== 'geplant' && <Period time={time} />}
            <p className="sidebar-note">
              <CalendarRange size={14} aria-hidden="true" />
              {periodNote(time.wert, time.period, time.latest)}
            </p>
          </section>
        </>
      )}
    </aside>
  );
}
