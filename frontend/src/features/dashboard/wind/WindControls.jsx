import { Check } from 'lucide-react';
import SegmentedControl from '../../../components/ui/SegmentedControl';
import Setting, { SettingsRow } from '../../../components/ui/Setting';
import { formatNumber } from '../../../lib/format';
import { COLOR_MODES, STATUSES } from './turbines';

// Which turbines (In Betrieb, In Planung, Stillgelegt, any of them) and what their colour says, for every wind chart: a
// row of the page's band of settings (SelectionBar), below the technology – which turbines in its colour, ticked like
// the Lage; the colour in green, how the charts show them. How many turbines that makes on the row's right.
export default function WindControls({ statuses, onStatuses, colorMode, onColorMode, count }) {
  const toggle = (id) => {
    const next = statuses.includes(id) ? statuses.filter((s) => s !== id) : [...statuses, id];
    if (next.length) onStatuses(STATUSES.map((s) => s.id).filter((s) => next.includes(s)));
  };
  return (
    <SettingsRow
      label="Windenergieanlagen der Auswertungen"
      aside={
        count != null && (
          <span>
            <strong className="tabular">{formatNumber(count)}</strong> Einzelanlagen
          </span>
        )
      }
    >
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
      <Setting label="Farbe nach">
        <SegmentedControl label="Farbe nach" options={COLOR_MODES} value={colorMode} onChange={onColorMode} />
      </Setting>
    </SettingsRow>
  );
}
