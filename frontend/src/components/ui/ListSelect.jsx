import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

// The list's room: at most this high, and at least this much below the button before it opens upwards
const MAX_HEIGHT = 280;
const MIN_BELOW = 200;
const GAP = 4;

/**
 * A dropdown of its own instead of the browser's <select>, for short lists like years: the list opens in a layer above
 * the page (a portal on the body), so no card or box clips it; it scrolls where it is longer than its room, opens
 * upwards where there is more room above, and closes on a click elsewhere or when the page scrolls. Keyboard: arrows,
 * Home/End, Enter or Space to choose, Escape to close.
 * value, onChange(value): the chosen option's value; options: [{ value, label }]; label: its name for screen readers;
 * className: of the button (it looks like the selects around it)
 */
export default function ListSelect({ value, options, onChange, label, className = '' }) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [place, setPlace] = useState(null);
  const button = useRef(null);
  const list = useRef(null);
  const id = useId();
  const chosen = Math.max(
    options.findIndex((o) => o.value === value),
    0,
  );

  const show = () => {
    setActive(chosen);
    setOpen(true);
  };
  const close = () => {
    setOpen(false);
    setPlace(null);
    button.current?.focus();
  };
  const choose = (index) => {
    if (options[index].value !== value) onChange(options[index].value);
    close();
  };

  // Below the button, or above where there is more room; at least as wide as the button
  useLayoutEffect(() => {
    if (!open) return;
    const r = button.current.getBoundingClientRect();
    const below = window.innerHeight - r.bottom - GAP * 2;
    const above = r.top - GAP * 2;
    const up = below < MIN_BELOW && above > below;
    setPlace({
      left: r.left,
      minWidth: r.width,
      maxHeight: Math.min(MAX_HEIGHT, up ? above : below),
      ...(up ? { bottom: window.innerHeight - r.top + GAP } : { top: r.bottom + GAP }),
    });
  }, [open]);

  // Once placed: the list takes the keyboard, the chosen option in its middle (scrolled within the list, not the page)
  useLayoutEffect(() => {
    if (!place || !list.current) return;
    list.current.focus({ preventScroll: true });
    const option = list.current.children[chosen];
    if (option) list.current.scrollTop = option.offsetTop - (list.current.clientHeight - option.offsetHeight) / 2;
    // Only when it opens: the keyboard moves the active option, not the chosen one
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [place]);

  // The option the keyboard is on stays in view
  useEffect(() => {
    const option = list.current?.children[active];
    if (!option) return;
    const { scrollTop, clientHeight } = list.current;
    if (option.offsetTop < scrollTop) list.current.scrollTop = option.offsetTop;
    else if (option.offsetTop + option.offsetHeight > scrollTop + clientHeight) {
      list.current.scrollTop = option.offsetTop + option.offsetHeight - clientHeight;
    }
  }, [active]);

  // A click elsewhere, the page scrolling (the list would stay behind) or resizing closes it, without taking the focus
  useEffect(() => {
    if (!open) return undefined;
    const dismiss = () => {
      setOpen(false);
      setPlace(null);
    };
    const onPointer = (e) => {
      if (!list.current?.contains(e.target) && !button.current?.contains(e.target)) dismiss();
    };
    const onScroll = (e) => {
      if (e.target !== list.current) dismiss();
    };
    document.addEventListener('pointerdown', onPointer);
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', dismiss);
    return () => {
      document.removeEventListener('pointerdown', onPointer);
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', dismiss);
    };
  }, [open]);

  const onButtonKey = (e) => {
    if (['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(e.key)) {
      e.preventDefault();
      show();
    }
  };
  const onListKey = (e) => {
    const last = options.length - 1;
    // From the latest state: keys held down come faster than renders
    const moves = { ArrowDown: (a) => Math.min(a + 1, last), ArrowUp: (a) => Math.max(a - 1, 0), Home: () => 0, End: () => last };
    if (e.key in moves) setActive(moves[e.key]);
    else if (e.key === 'Enter' || e.key === ' ') choose(active);
    else if (e.key === 'Escape' || e.key === 'Tab') close();
    else return;
    e.preventDefault();
  };

  return (
    <>
      <button
        ref={button}
        type="button"
        className={`list-select ${className}`}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? `${id}-list` : undefined}
        aria-label={`${label}: ${options[chosen]?.label ?? ''}`}
        onClick={() => (open ? close() : show())}
        onKeyDown={onButtonKey}
      >
        {options[chosen]?.label}
      </button>
      {open &&
        createPortal(
          <ul
            ref={list}
            id={`${id}-list`}
            className="list-select__menu"
            role="listbox"
            aria-label={label}
            aria-activedescendant={`${id}-${active}`}
            tabIndex={-1}
            style={place ?? { visibility: 'hidden' }}
            onKeyDown={onListKey}
          >
            {options.map((option, index) => (
              <li
                key={option.value}
                id={`${id}-${index}`}
                role="option"
                aria-selected={index === chosen}
                className={`list-select__option${index === active ? ' is-active' : ''}`}
                onPointerEnter={() => setActive(index)}
                onClick={() => choose(index)}
              >
                {option.label}
              </li>
            ))}
          </ul>,
          document.body,
        )}
    </>
  );
}
