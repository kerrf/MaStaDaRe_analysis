import { TrendingDown, TrendingUp } from 'lucide-react';
import { signed } from './model';

/**
 * A change as a chip – up green, down red, within 1 % grey – and what it is measured against beside it. value: the
 * change (0.1 = +10 %); null: only the text.
 */
export function Delta({ value, label, flat = 0.01 }) {
  const tone = value > flat ? 'up' : value < -flat ? 'down' : 'flat';
  const Icon = tone === 'up' ? TrendingUp : tone === 'down' ? TrendingDown : null;
  return (
    <div className="delta-row">
      {value != null && (
        <span className={`delta delta--${tone}`}>
          {Icon && <Icon size={13} strokeWidth={2.4} aria-hidden="true" />}
          <span className="tabular">{signed(value)}</span>
        </span>
      )}
      {label && <span className="delta-row__label">{label}</span>}
    </div>
  );
}
