import SegmentedControl from '../../../components/ui/SegmentedControl';
import { formatNumber } from '../../../lib/format';
import { COLOR_MODES, STATUSES } from './turbines';

// Which turbines (In Betrieb, In Planung, Stillgelegt, any of them) and what their colour says: for every wind chart
export default function WindControls({ statuses, onStatuses, colorMode, onColorMode, count }) {
  const toggle = (id) => {
    const next = statuses.includes(id) ? statuses.filter((s) => s !== id) : [...statuses, id];
    if (next.length) onStatuses(STATUSES.map((s) => s.id).filter((s) => next.includes(s)));
  };
  return (
    <div className="wind-controls" role="group" aria-label="Windenergieanlagen der Auswertungen">
      <div className="wind-controls__group">
        <span className="wind-controls__label">Anlagen</span>
        <div className="wind-controls__chips">
          {STATUSES.map((s) => {
            const on = statuses.includes(s.id);
            return (
              <button key={s.id} type="button" className={`wind-chip${on ? ' is-on' : ''}`} aria-pressed={on} onClick={() => toggle(s.id)}>
                {s.label}
              </button>
            );
          })}
        </div>
      </div>
      <div className="wind-controls__group">
        <span className="wind-controls__label">Farbe nach</span>
        <SegmentedControl label="Farbe nach" options={COLOR_MODES} value={colorMode} onChange={onColorMode} />
      </div>
      {count != null && <span className="wind-controls__count tabular">{formatNumber(count)} Einzelanlagen</span>}
    </div>
  );
}
