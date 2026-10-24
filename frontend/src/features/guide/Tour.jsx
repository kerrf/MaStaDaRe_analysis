import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import './guide.css';

const GAP = 12; // between the marked element and the card
const PAD = 6; // the light around the marked element
const CARD_WIDTH = 320;

// The first of the step's elements that is on the page and visible (the sidebar, or on a phone – where it is a drawer
// beside the screen – its button)
function targetOf(step) {
  for (const selector of step.targets) {
    const element = document.querySelector(selector);
    const box = element?.getBoundingClientRect();
    if (box && box.width > 0 && box.height > 0 && box.right > 0 && box.left < window.innerWidth) return element;
  }
  return null;
}

// Where the card goes: beside the element where there is room (right, left), else below or above it – inside the window
function placeCard(rect, card) {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const width = Math.min(CARD_WIDTH, vw - 2 * GAP);
  const height = card?.offsetHeight ?? 180;
  const clampX = (x) => Math.min(Math.max(GAP, x), vw - width - GAP);
  const clampY = (y) => Math.min(Math.max(GAP, y), vh - height - GAP);
  if (rect.right + GAP + width <= vw - GAP && rect.width < vw * 0.6) return { left: rect.right + GAP, top: clampY(rect.top), width };
  if (rect.left - GAP - width >= GAP && rect.width < vw * 0.6) return { left: rect.left - GAP - width, top: clampY(rect.top), width };
  if (rect.bottom + GAP + height <= vh - GAP) return { left: clampX(rect.left), top: rect.bottom + GAP, width };
  if (rect.top - GAP - height >= GAP) return { left: clampX(rect.left), top: rect.top - GAP - height, width };
  return { left: clampX(rect.left + rect.width / 2 - width / 2), top: clampY(vh - height - GAP), width };
}

/**
 * A short tour: one step after the other, each marks an element of the page (the rest a little darker) and says in a
 * card beside it what it does. The page stays usable underneath – a step may ask the person to try it. steps: [{ targets:
 * [selector, …] (the first visible one is marked; a step without one is left out), title, text }]; onClose(finished):
 * the last step done (true) or skipped (false). topic: the dashboard's colours (the tour lies outside it, in the body).
 */
export default function Tour({ steps, onClose, topic, label = 'Kurze Einführung' }) {
  const [shown] = useState(() => steps.filter((step) => targetOf(step)));
  const [index, setIndex] = useState(0);
  const [rect, setRect] = useState(null);
  const cardRef = useRef(null);
  const step = shown[index];
  const last = index === shown.length - 1;

  // Bring the step's element into view, then follow it while the page scrolls or changes
  useLayoutEffect(() => {
    if (!step) return undefined;
    const element = targetOf(step);
    if (!element) return undefined;
    const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    element.scrollIntoView({ block: 'center', behavior: still ? 'auto' : 'smooth' });
    let frame;
    let previous = '';
    const follow = () => {
      const box = targetOf(step)?.getBoundingClientRect();
      const now = box ? `${box.top},${box.left},${box.width},${box.height}` : '';
      if (now !== previous) {
        previous = now;
        setRect(box ? { top: box.top, left: box.left, width: box.width, height: box.height, right: box.right, bottom: box.bottom } : null);
      }
      frame = requestAnimationFrame(follow);
    };
    follow();
    return () => cancelAnimationFrame(frame);
  }, [step]);

  useEffect(() => {
    cardRef.current?.focus({ preventScroll: true });
  }, [index]);

  useEffect(() => {
    const onKey = (event) => {
      if (event.key === 'Escape') onClose(false);
      if (event.key === 'ArrowRight') setIndex((i) => Math.min(shown.length - 1, i + 1));
      if (event.key === 'ArrowLeft') setIndex((i) => Math.max(0, i - 1));
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose, shown.length]);

  // Nothing to show (the page changed under the tour): it ends as if skipped
  useEffect(() => {
    if (!shown.length) onClose(false);
  }, [shown.length, onClose]);
  if (!step) return null;

  const position = rect ? placeCard(rect, cardRef.current) : null;
  return createPortal(
    <div className="tour" aria-live="polite" data-topic={topic}>
      {rect && (
        <div
          className="tour__spot"
          style={{ top: rect.top - PAD, left: rect.left - PAD, width: rect.width + 2 * PAD, height: rect.height + 2 * PAD }}
          aria-hidden="true"
        />
      )}
      <div
        ref={cardRef}
        className="tour__card"
        role="dialog"
        aria-label={label}
        tabIndex={-1}
        style={position ?? { visibility: 'hidden' }}
      >
        <div className="tour__head">
          <span className="tour__count tabular">
            {index + 1} von {shown.length}
          </span>
          <button type="button" className="tour__close" onClick={() => onClose(false)} aria-label="Einführung schließen">
            <X size={15} />
          </button>
        </div>
        <h2 className="tour__title">{step.title}</h2>
        <p className="tour__text">{step.text}</p>
        <div className="tour__foot">
          <span className="tour__dots" aria-hidden="true">
            {shown.map((s, i) => (
              <i key={s.title} className={i === index ? 'is-current' : undefined} />
            ))}
          </span>
          {!last && (
            <button type="button" className="tour__skip" onClick={() => onClose(false)}>
              Überspringen
            </button>
          )}
          {index > 0 && (
            <button type="button" className="btn btn--secondary btn--sm" onClick={() => setIndex(index - 1)}>
              Zurück
            </button>
          )}
          <button type="button" className="btn btn--primary btn--sm" onClick={() => (last ? onClose(true) : setIndex(index + 1))}>
            {last ? 'Los geht’s' : 'Weiter'}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
