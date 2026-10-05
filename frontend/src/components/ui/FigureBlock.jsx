import { Info } from 'lucide-react';
import { formatPercent } from '../../lib/format';

/**
 * A block of key figures: a head (icon, title, a chip with the gist, an info that explains the block) and rows of
 * FigureRow – each a name, a value and, where it has one, a bar of its share of a named whole.
 *
 * chip: { label, tone: 'good' | 'fair' | 'poor' | 'neutral' }; info: the explanation, shown on hover and read out
 */
export function FigureBlock({ icon: Icon, title, chip, info, color, children }) {
  return (
    <section className="figure-block" style={color ? { '--figure-color': color } : undefined}>
      <header className="figure-block__head">
        {Icon && <Icon size={18} aria-hidden="true" className="figure-block__icon" />}
        <h3 className="figure-block__title">{title}</h3>
        {chip && <span className={`figure-chip figure-chip--${chip.tone ?? 'neutral'}`}>{chip.label}</span>}
        {info && (
          <span className="figure-block__info" title={info}>
            <Info size={16} aria-hidden="true" />
            <span className="visually-hidden">{info}</span>
          </span>
        )}
      </header>
      <dl className="figure-block__rows">{children}</dl>
    </section>
  );
}

/**
 * One figure: label, value, and a bar of share (0..1, beyond 1 the bar stays full) labelled shareLabel (default: the
 * share in percent). indent: a part of the row above ("– davon …"); color: of its bar, other than the block's.
 */
export function FigureRow({ label, value, share, shareLabel, indent = false, muted = false, color }) {
  return (
    <div className={`figure-row${indent ? ' is-indented' : ''}${muted ? ' is-muted' : ''}`} style={color ? { '--figure-color': color } : undefined}>
      <dt className="figure-row__label">{label}</dt>
      <dd className="figure-row__value">{value}</dd>
      <dd className="figure-row__share">
        {share != null && (
          <>
            <span className="figure-row__pct">{shareLabel ?? formatPercent(share)}</span>
            <span className="figure-row__track" aria-hidden="true">
              <span className="figure-row__fill" style={{ width: `${Math.max(share > 0 ? 1.5 : 0, Math.min(1, share) * 100)}%` }} />
            </span>
          </>
        )}
      </dd>
    </div>
  );
}
