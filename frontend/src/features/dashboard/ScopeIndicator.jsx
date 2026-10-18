import { useEffect, useState } from 'react';
import ScopeOutline from './ScopeOutline';

/**
 * Which area the page shows, while its choice (the Gebiet in the header, `anchor`) is out of view: a small card at the
 * bottom left with the area's outline and name, and "ändern" back up to the Gebiet, which lights up for a moment and
 * takes the keyboard. Every page of a dashboard shows the same area, so scrolling never hides how far it reaches.
 */
export default function ScopeIndicator({ state, anchor }) {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    if (!anchor) return undefined;
    const observer = new IntersectionObserver(([entry]) => setVisible(!entry.isIntersecting));
    observer.observe(anchor);
    return () => observer.disconnect();
  }, [anchor]);

  const { region, kreisAgs, kreisName, gemeindeAgs, scopeName } = state;
  const level = gemeindeAgs ? `Gemeinde in ${kreisName}` : kreisAgs ? `Kreis in ${region.name}` : region ? 'Bundesland' : 'alle Bundesländer';
  const change = () => {
    const bar = anchor?.querySelector('.scope-bar');
    if (!bar) return;
    bar.scrollIntoView({ behavior: 'smooth', block: 'center' });
    bar.classList.remove('is-called');
    // A new frame, so the light comes again on a second click
    requestAnimationFrame(() => bar.classList.add('is-called'));
    setTimeout(() => bar.querySelector('.scope-bar__select:not(:disabled)')?.focus({ preventScroll: true }), 450);
  };
  return (
    <aside className={`scope-indicator${visible ? ' is-visible' : ''}`} aria-label="Gebiet" aria-hidden={!visible}>
      <ScopeOutline region={region} kreis={kreisAgs} size={34} />
      <span className="scope-indicator__text">
        <span className="scope-indicator__label">Gebiet</span>
        <strong>{scopeName}</strong>
        <span>{level}</span>
      </span>
      <button type="button" className="scope-indicator__change" tabIndex={visible ? 0 : -1} onClick={change}>
        ändern
      </button>
    </aside>
  );
}
