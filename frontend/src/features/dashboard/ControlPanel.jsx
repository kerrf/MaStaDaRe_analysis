import { Fragment } from 'react';
import { BookOpen, Check, Scale } from 'lucide-react';
import { Link } from 'react-router-dom';
import SegmentedControl from '../../components/ui/SegmentedControl';
import { GRANULARITIES } from '../../config/dashboards';

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

// Multiple choice below the active technology chip. At least one option stays selected.
function SubtypePicker({ id, subtypes, selected, onChange }) {
  const toggle = (optionId) =>
    onChange(subtypes.options.map((o) => o.id).filter((x) => (x === optionId ? !selected.includes(x) : selected.includes(x))));

  return (
    <div id={id} className="tech-subtypes" role="group" aria-labelledby={`${id}-label`}>
      <div id={`${id}-label`} className="tech-subtypes__label">
        {subtypes.label}
      </div>
      <div className="tech-subtypes__options">
        {subtypes.options.map((option) => {
          const checked = selected.includes(option.id);
          const locked = checked && selected.length === 1;
          return (
            <label
              key={option.id}
              className={`tech-subtypes__option${checked ? ' is-checked' : ''}${locked ? ' is-locked' : ''}`}
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
    </div>
  );
}

export default function ControlPanel({
  config,
  technology,
  onTechnology,
  subtypes,
  onSubtypes,
  metric,
  onMetric,
  granularity,
  onGranularity,
}) {
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
              const expanded = active && Boolean(tech.subtypes);
              const pickerId = `subtypes-${tech.id}`;
              return (
                <Fragment key={tech.id}>
                  <button
                    type="button"
                    className={`tech-chip${active ? ' is-active' : ''}${expanded ? ' is-expanded' : ''}`}
                    aria-pressed={active}
                    aria-expanded={tech.subtypes ? expanded : undefined}
                    aria-controls={expanded ? pickerId : undefined}
                    onClick={() => onTechnology(tech.id)}
                  >
                    <Icon size={16} aria-hidden="true" />
                    <span className="tech-chip__label">{tech.label}</span>
                    {!tech.statsPath && <span className="tech-chip__soon">bald</span>}
                  </button>
                  {expanded && <SubtypePicker id={pickerId} subtypes={tech.subtypes} selected={subtypes} onChange={onSubtypes} />}
                </Fragment>
              );
            })}
          </div>
        </Section>

        <Section title="Kennzahl">
          <SegmentedControl
            label="Kennzahl"
            value={metric.id}
            onChange={onMetric}
            options={config.metrics.map((m) => ({ id: m.id, label: m.label, title: `${m.legend} (${m.unit})` }))}
          />
        </Section>

        <Section title="Räumliche Auflösung">
          <div className="option-list" role="radiogroup" aria-label="Räumliche Auflösung">
            {GRANULARITIES.map((g) => {
              const disabled = g.available === false || (g.kind === 'heatmap' && !technology.heatmapPath);
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
                  {disabled && <span className="option-list__note">{g.note ?? 'nicht verfügbar'}</span>}
                </button>
              );
            })}
          </div>
        </Section>

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
