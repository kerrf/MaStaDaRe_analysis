import { Check } from 'lucide-react';
import Setting from '../../components/ui/Setting';
import { footnoteAnchor, useFootnote } from './footnoteContext';
import { FootnoteRef } from './footnotes';

// Multiple choice (Solar: Anlagenart, Gas: Technologie, Speicherart). At least one option stays selected. Options with a
// colour show it in their box: the colour of their sites on the map.
function SubtypePicker({ subtypes, selected, onChange }) {
  const toggle = (optionId) =>
    onChange(subtypes.options.map((o) => o.id).filter((x) => (x === optionId ? !selected.includes(x) : selected.includes(x))));

  return (
    <div className="tech-subtypes__options">
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
            <span title={option.hint}>{option.label}</span>
            {option.note && <FootnoteRef id={`subtypes-${subtypes.param}`} />}
          </label>
        );
      })}
    </div>
  );
}

// A small either/or (Solar: Netto (AC) or Brutto (DC)); its footnote is at the page's bottom
function OptionSwitch({ label, describedBy, option, value, onChange }) {
  return (
    <div className="tech-switch__options" role="radiogroup" aria-label={label} aria-describedby={describedBy}>
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

// The active technology's own filters, each a box of its own in the row below the choice of technology (SelectionBar): they
// narrow down the technology (Solar: Anlagenart, Leistung), they are not another technology. In the topic's colour like
// the chosen technology.
export default function TechFilters({ technology, subtypes, onSubtypes, leistung, onLeistung }) {
  // The subtypes' remark (solar: what the Balkonkraftwerke are), marked at its option, with its link
  const note = technology.subtypes?.note;
  useFootnote(`subtypes-${technology.subtypes?.param}`, note?.text, note?.link);
  return (
    <>
      {technology.subtypes && (
        <Setting label={technology.subtypes.label} tone="topic">
          <SubtypePicker subtypes={technology.subtypes} selected={subtypes} onChange={onSubtypes} />
        </Setting>
      )}
      {technology.leistung && (
        <Setting label={technology.leistung.label} note={technology.leistung.note && <FootnoteRef id="leistung" />} tone="topic">
          <OptionSwitch
            label={technology.leistung.label}
            describedBy={technology.leistung.note ? footnoteAnchor('leistung') : undefined}
            option={technology.leistung}
            value={leistung}
            onChange={onLeistung}
          />
        </Setting>
      )}
    </>
  );
}
