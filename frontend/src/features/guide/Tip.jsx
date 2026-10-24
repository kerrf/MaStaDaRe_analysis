import { useEffect, useState } from 'react';
import { Lightbulb, X } from 'lucide-react';
import { trackEvent } from '../../lib/usage';
import { remember, remembered, rememberThisVisit, thisVisit } from './memory';
import './guide.css';

// Tips are sparing: each one once (remembered in the browser), at most one a visit, never during the tour, and only
// after the moment that makes it useful has lasted a while
const SHOWN_THIS_VISIT = 'tipShown';
const DELAY_MS = 6000;

/**
 * Whether the tip `id` shows now: when `when` has held for a few seconds, the tip wasn't shown before and no other tip
 * this visit. Returns [open, close].
 */
export function useTip(id, when, delay = DELAY_MS) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!when || open || remembered(`tip.${id}`) || thisVisit(SHOWN_THIS_VISIT)) return undefined;
    const timer = setTimeout(() => {
      if (remembered(`tip.${id}`) || thisVisit(SHOWN_THIS_VISIT)) return;
      remember(`tip.${id}`);
      rememberThisVisit(SHOWN_THIS_VISIT);
      trackEvent('Tipp', { tipp: id, aktion: 'gezeigt' });
      setOpen(true);
    }, delay);
    return () => clearTimeout(timer);
  }, [id, when, open, delay]);
  // The moment passed (the person did it themselves): the tip goes
  useEffect(() => {
    if (open && !when) setOpen(false);
  }, [open, when]);
  return [open, () => setOpen(false)];
}

/** A tip: what to try, optionally a button that does it, a cross. floating: beside a button rather than in the flow. */
export default function Tip({ id, children, action, onAction, onClose, floating = false }) {
  const close = (acted) => {
    trackEvent('Tipp', { tipp: id, aktion: acted ? 'ausprobiert' : 'geschlossen' });
    onClose();
  };
  return (
    <div className={`tip${floating ? ' tip--float' : ''}`} role="status">
      <Lightbulb size={15} className="tip__icon" aria-hidden="true" />
      <div className="tip__body">
        <strong>Tipp:</strong> {children}
        {action && (
          <>
            <br />
            <button
              type="button"
              className="tip__action"
              onClick={() => {
                onAction();
                close(true);
              }}
            >
              {action}
            </button>
          </>
        )}
      </div>
      <button type="button" className="tip__close" onClick={() => close(false)} aria-label="Tipp schließen">
        <X size={14} />
      </button>
    </div>
  );
}
