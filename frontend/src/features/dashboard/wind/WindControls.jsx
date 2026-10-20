import { Check } from 'lucide-react';
import Setting from '../../../components/ui/Setting';
import { STATUSES } from './turbines';

// Which turbines (In Betrieb, In Planung, Stillgelegt, any of them) for every wind chart: a box of the row of filters
// (SelectionBar), next to the Lage, ticked like it.
export default function WindControls({ statuses, onStatuses }) {
  const toggle = (id) => {
    const next = statuses.includes(id) ? statuses.filter((s) => s !== id) : [...statuses, id];
    if (next.length) onStatuses(STATUSES.map((s) => s.id).filter((s) => next.includes(s)));
  };
  return (
    <Setting label="Anlagen" tone="topic">
      <div className="tech-subtypes__options">
        {STATUSES.map((s) => {
          const on = statuses.includes(s.id);
          const locked = on && statuses.length === 1;
          return (
            <label
              key={s.id}
              className={`tech-subtypes__option${on ? ' is-checked' : ''}${locked ? ' is-locked' : ''}`}
              title={locked ? 'Mindestens eine Auswahl bleibt aktiv' : undefined}
            >
              <input type="checkbox" className="tech-subtypes__input visually-hidden" checked={on} disabled={locked} onChange={() => toggle(s.id)} />
              <span className="tech-subtypes__box" aria-hidden="true">
                <Check size={12} strokeWidth={3} />
              </span>
              {s.label}
            </label>
          );
        })}
      </div>
    </Setting>
  );
}
