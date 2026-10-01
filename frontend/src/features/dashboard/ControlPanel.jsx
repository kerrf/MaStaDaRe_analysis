import { BookOpen, Check, Scale } from 'lucide-react';
import { Link } from 'react-router-dom';
import SegmentedControl from '../../components/ui/SegmentedControl';
import { GRANULARITIES, footnoteId, hasData, isAvailable } from '../../config/dashboards';

function Section({ title, children, aside }) {
  return (
    <div className="controls__section">
      <div className="controls__section-head">
        <h3 className="controls__title">{title}</h3>
        {aside}
      </div>
      {children}
    </div>
  );
}

// One filter of the active technology: its name on the left, its options on the right
function FilterRow({ id, label, footnote, children }) {
  return (
    <div className="tech-filters__row">
      <span id={id} className="tech-filters__label">
        {label}
        {footnote && (
          <sup className="footnote-ref" aria-hidden="true">
            {footnote}
          </sup>
        )}
      </span>
      {children}
    </div>
  );
}

// Multiple choice (Solar: Anlagenart, Gas: Technologie, Speicherart). At least one option stays selected. Options with a
// colour show it in their box: the colour of their sites on the map.
function SubtypePicker({ labelledBy, subtypes, selected, onChange }) {
  const toggle = (optionId) =>
    onChange(subtypes.options.map((o) => o.id).filter((x) => (x === optionId ? !selected.includes(x) : selected.includes(x))));

  return (
    <div className="tech-subtypes__options" role="group" aria-labelledby={labelledBy}>
      {subtypes.options.map((option) => {
        const checked = selected.includes(option.id);
        const locked = checked && selected.length === 1;
        return (
          <label
            key={option.id}
            className={`tech-subtypes__option${checked ? ' is-checked' : ''}${locked ? ' is-locked' : ''}`}
            style={option.color ? { '--option-color': option.color } : undefined}
            title={locked ? 'Mindestens eine Auswahl bleibt aktiv' : undefined}
          >
            <input
              type="checkbox"
              className="tech-subtypes__input visually-hidden"
              checked={checked}
              disabled={locked}
              onChange={() => toggle(option.id)}
            />
            <span className="tech-subtypes__box" aria-hidden="true">
              <Check size={12} strokeWidth={3} />
            </span>
            {option.label}
          </label>
        );
      })}
    </div>
  );
}

// A small either/or (Solar: Netto (AC) or Brutto (DC)); its footnote is below the map
function OptionSwitch({ labelledBy, describedBy, option, value, onChange }) {
  return (
    <div className="tech-switch__options" role="radiogroup" aria-labelledby={labelledBy} aria-describedby={describedBy}>
      {option.options.map((o) => (
        <button
          key={o.id}
          type="button"
          role="radio"
          aria-checked={o.id === value.id}
          className={`tech-switch__option${o.id === value.id ? ' is-active' : ''}`}
          onClick={() => onChange(o.id)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

// The active technology's own filters, a layer below the choice of technology that hangs off it: they narrow down the
// technology (Solar: Anlagenart, Leistung), they are not another technology.
function TechFilters({ technology, subtypes, onSubtypes, leistung, onLeistung }) {
  const Icon = technology.icon;
  const id = `filter-${technology.id}`;
  return (
    <div id={id} className="tech-filters" role="group" aria-labelledby={`${id}-title`}>
      <div id={`${id}-title`} className="tech-filters__title">
        <Icon size={14} aria-hidden="true" />
        Filter für {technology.label}
      </div>
      {technology.subtypes && (
        <FilterRow id={`${id}-arten`} label={technology.subtypes.label}>
          <SubtypePicker labelledBy={`${id}-arten`} subtypes={technology.subtypes} selected={subtypes} onChange={onSubtypes} />
        </FilterRow>
      )}
      {technology.leistung && (
        <FilterRow id={`${id}-leistung`} label={technology.leistung.label} footnote={technology.leistung.note && '1'}>
          <OptionSwitch
            labelledBy={`${id}-leistung`}
            describedBy={technology.leistung.note ? footnoteId(technology.leistung) : undefined}
            option={technology.leistung}
            value={leistung}
            onChange={onLeistung}
          />
        </FilterRow>
      )}
    </div>
  );
}

export default function ControlPanel({
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
}) {
  const filtered = Boolean(technology.subtypes || technology.leistung);
  return (
    <aside className="card controls" aria-label="Ansicht anpassen">
      <header className="card__header">
        <h2 className="card__title">Ansicht</h2>
      </header>

      <div className="controls__body">
        <Section title="Technologie">
          <div className="tech-grid">
            {config.technologies.map((tech) => {
              const Icon = tech.icon;
              const active = tech.id === technology.id;
              return (
                <button
                  key={tech.id}
                  type="button"
                  className={`tech-chip${active ? ' is-active' : ''}${active && filtered ? ' has-filters' : ''}`}
                  aria-pressed={active}
                  aria-controls={active && filtered ? `filter-${tech.id}` : undefined}
                  onClick={() => onTechnology(tech.id)}
                >
                  <Icon size={16} aria-hidden="true" />
                  <span className="tech-chip__label">{tech.label}</span>
                  {!hasData(tech) && <span className="tech-chip__soon">bald</span>}
                </button>
              );
            })}
          </div>
          {filtered && (
            <TechFilters technology={technology} subtypes={subtypes} onSubtypes={onSubtypes} leistung={leistung} onLeistung={onLeistung} />
          )}
        </Section>

        {metrics.length > 1 && (
          <Section title="Kennzahl">
            <SegmentedControl
              label="Kennzahl"
              value={metric.id}
              onChange={onMetric}
              options={metrics.map((m) => ({ id: m.id, label: m.label, title: `${m.legend} (${m.unit})` }))}
            />
          </Section>
        )}

        {!technology.plantsPath && (
          <Section title="Räumliche Auflösung">
            <div className="option-list" role="radiogroup" aria-label="Räumliche Auflösung">
              {GRANULARITIES.map((g) => {
                const disabled = !isAvailable(g, technology);
                const active = g.id === granularity.id;
                return (
                  <button
                    key={g.id}
                    type="button"
                    role="radio"
                    aria-checked={active}
                    disabled={disabled}
                    className={`option-list__item${active ? ' is-active' : ''}`}
                    onClick={() => onGranularity(g.id)}
                  >
                    <span className="option-list__dot" aria-hidden="true" />
                    <span>{g.label}</span>
                    {(disabled || g.note) && <span className="option-list__note">{g.note ?? 'nicht verfügbar'}</span>}
                  </button>
                );
              })}
            </div>
          </Section>
        )}

        {config.segments && (
          <Section title={config.segments.label} aside={<span className="controls__note">folgt</span>}>
            <SegmentedControl
              label={config.segments.label}
              value="alle"
              onChange={() => {}}
              options={config.segments.options.map((o) => ({ ...o, disabled: o.id !== 'alle' }))}
            />
          </Section>
        )}
      </div>

      <footer className="controls__footer">
        <Link to="/info#methodik" className="controls__link">
          <BookOpen size={15} aria-hidden="true" /> Methodik &amp; Legende
        </Link>
        <Link to="/info#quellen" className="controls__link">
          <Scale size={15} aria-hidden="true" /> Datenquellen &amp; Lizenz
        </Link>
      </footer>
    </aside>
  );
}
