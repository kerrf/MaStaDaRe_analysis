import { Check } from 'lucide-react';
import { footnoteId } from '../../config/dashboards';

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
export default function TechFilters({ technology, subtypes, onSubtypes, leistung, onLeistung }) {
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
