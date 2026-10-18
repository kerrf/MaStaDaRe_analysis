import { useId } from 'react';

/**
 * One setting, wherever it is – the area, the technology and its filters, how a card shows its data: its name and its
 * options in one box, the name in the box's first field. So every setting of the site reads as the same kind of thing,
 * at the same height, and no name floats beside its control. label: the name; note: a footnote mark after it; tone:
 * 'topic' – the chosen option in the topic's colour (what a page shows), else in green (how a card shows it); size:
 * 'large' for the area (ScopeBar).
 */
export default function Setting({ label, note, tone, size, className = '', children }) {
  const id = useId();
  const classes = ['setting', tone && `setting--${tone}`, size && `setting--${size}`, className].filter(Boolean).join(' ');
  return (
    <div className={classes} role="group" aria-labelledby={id}>
      <span id={id} className="setting__label">
        {label}
        {note}
      </span>
      <div className="setting__control">{children}</div>
    </div>
  );
}

/**
 * A row of settings in a band (.settings-band): the boxes from the left, wrapping where the row is full; aside: on the
 * row's right – what the settings amount to, or a way back to the start.
 */
export function SettingsRow({ label, aside, children }) {
  return (
    <div className="settings-row" role={label ? 'group' : undefined} aria-label={label}>
      {children}
      {aside && <div className="settings-row__aside">{aside}</div>}
    </div>
  );
}
