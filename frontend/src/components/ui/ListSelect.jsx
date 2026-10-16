import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, Search } from 'lucide-react';

// The list's room: at most this high, and at least this much below the button before it opens upwards
const MAX_HEIGHT = 320;
const MIN_BELOW = 220;
const GAP = 4;
const EDGE = 8; // never closer to the window's edge
// From this many options on, a search field above the list (Landkreise, Gemeinden)
const SEARCH_FROM = 12;

// For the search: lower case, without accents and with ss for ß ("muenchen" and "munchen" find München)
const fold = (text) =>
  String(text)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/ß/g, 'ss');
// …and the same with ae, oe, ue for ä, ö, ü: both sides alike, so "muenchen" finds München
const simple = (text) => fold(text).replace(/ae/g, 'a').replace(/oe/g, 'o').replace(/ue/g, 'u');

/**
 * A dropdown of its own instead of the browser's <select>, whose list came out cut off and didn't scroll: the list opens
 * in a layer above the page (a portal on the body, above the fullscreen map too), below the button or above it where
 * there is more room, always inside the window, and follows the button when the page scrolls. Long lists get a search
 * field. Keyboard: arrows, Home/End, Enter to choose, Escape or Tab to close; typing jumps to an option (or searches).
 * value, onChange(value): the chosen option's value; options: [{ value, label, disabled? }] – an option with value ''
 * stands for "nothing chosen" (its label shown in the button, muted); label: its name for screen readers; className: of
 * the button (it looks like the controls around it); disabled, title: of the button.
 */
export default function ListSelect({ value, options, onChange, label, className = '', disabled = false, title }) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [place, setPlace] = useState(null);
  const [query, setQuery] = useState('');
  const button = useRef(null);
  const menu = useRef(null);
  const list = useRef(null);
  const typed = useRef({ text: '', at: 0 });
  const id = useId();

  const chosen = options.findIndex((o) => o.value === value);
  const current = options[Math.max(chosen, 0)];
  const searchable = options.length >= SEARCH_FROM;
  const shown = useMemo(() => {
    if (!query.trim()) return options;
    const q = simple(query.trim());
    return options.filter((o) => o.value !== '' && simple(o.label).includes(q));
  }, [options, query]);

  const show = () => {
    if (disabled) return;
    setQuery('');
    setActive(Math.max(chosen, 0));
    setOpen(true);
  };
  const close = (focus = true) => {
    setOpen(false);
    setPlace(null);
    if (focus) button.current?.focus();
  };
  const choose = (option) => {
    if (!option || option.disabled) return;
    if (option.value !== value) onChange(option.value);
    close();
  };

  // Where the list goes: below the button or above it, at least as wide as the button and inside the window
  const measure = () => {
    const r = button.current?.getBoundingClientRect();
    if (!r) return;
    if (r.bottom < 0 || r.top > window.innerHeight) {
      close(false);
      return;
    }
    const below = window.innerHeight - r.bottom - GAP - EDGE;
    const above = r.top - GAP - EDGE;
    const up = below < MIN_BELOW && above > below;
    const width = menu.current?.offsetWidth ?? r.width;
    const maxLeft = window.innerWidth - EDGE - width;
    setPlace({
      left: Math.max(EDGE, Math.min(r.left, maxLeft)),
      minWidth: r.width,
      maxWidth: window.innerWidth - 2 * EDGE,
      maxHeight: Math.min(MAX_HEIGHT, up ? above : below),
      ...(up ? { bottom: window.innerHeight - r.top + GAP } : { top: r.bottom + GAP }),
    });
  };

  useLayoutEffect(() => {
    if (open) measure();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Once placed: the width is known, so the list keeps inside the window; the keyboard goes to the search or the list,
  // the chosen option in the list's middle (scrolled within the list, not the page)
  const placed = Boolean(place);
  useLayoutEffect(() => {
    if (!placed) return;
    measure();
    (searchable ? menu.current?.querySelector('input') : list.current)?.focus({ preventScroll: true });
    const option = list.current?.querySelector('[aria-selected="true"]');
    if (option) list.current.scrollTop = option.offsetTop - (list.current.clientHeight - option.offsetHeight) / 2;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [placed]);

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

  // A click elsewhere closes it; scrolling the page or resizing moves it along with its button
  useEffect(() => {
    if (!open) return undefined;
    let frame = 0;
    const follow = (e) => {
      if (menu.current?.contains(e.target)) return;
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(measure);
    };
    const onPointer = (e) => {
      if (!menu.current?.contains(e.target) && !button.current?.contains(e.target)) close(false);
    };
    document.addEventListener('pointerdown', onPointer);
    window.addEventListener('scroll', follow, true);
    window.addEventListener('resize', follow);
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener('pointerdown', onPointer);
      window.removeEventListener('scroll', follow, true);
      window.removeEventListener('resize', follow);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const onButtonKey = (e) => {
    if (['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(e.key)) {
      e.preventDefault();
      show();
    }
  };
  const next = (from, step) => {
    for (let i = from + step; i >= 0 && i < shown.length; i += step) if (!shown[i].disabled) return i;
    return from;
  };
  const onMenuKey = (e) => {
    const last = shown.length - 1;
    if (e.key === 'ArrowDown') setActive((a) => next(Math.min(a, last), 1));
    else if (e.key === 'ArrowUp') setActive((a) => next(Math.min(a, last), -1));
    else if (e.key === 'Home') setActive(next(-1, 1));
    else if (e.key === 'End') setActive(next(shown.length, -1));
    else if (e.key === 'Enter' || (e.key === ' ' && !searchable)) choose(shown[active]);
    else if (e.key === 'Escape') close();
    else if (e.key === 'Tab') close();
    else if (!searchable && e.key.length === 1) {
      // Type-ahead like the browser's list: the first option that starts with what was typed within a second
      const now = Date.now();
      typed.current = { text: (now - typed.current.at < 1000 ? typed.current.text : '') + fold(e.key), at: now };
      const hit = shown.findIndex((o) => !o.disabled && fold(o.label).startsWith(typed.current.text));
      if (hit >= 0) setActive(hit);
    } else return;
    e.preventDefault();
  };

  const listbox = `${id}-list`;
  return (
    <>
      <button
        ref={button}
        type="button"
        className={`list-select ${className}${current?.value === '' ? ' is-placeholder' : ''}`}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listbox : undefined}
        aria-label={`${label}: ${current?.label ?? ''}`}
        disabled={disabled}
        title={title}
        onClick={() => (open ? close() : show())}
        onKeyDown={onButtonKey}
      >
        <span className="list-select__value">{current?.label}</span>
        <ChevronDown size={15} aria-hidden="true" className="list-select__chevron" />
      </button>
      {open &&
        createPortal(
          <div ref={menu} className="list-select__menu" style={place ?? { visibility: 'hidden' }} onKeyDown={onMenuKey}>
            {searchable && (
              <div className="list-select__search">
                <Search size={14} aria-hidden="true" />
                <input
                  type="text"
                  value={query}
                  placeholder="Suchen …"
                  aria-label={`${label} suchen`}
                  aria-controls={listbox}
                  aria-activedescendant={shown[active] ? `${id}-${active}` : undefined}
                  onChange={(e) => {
                    setQuery(e.target.value);
                    setActive(0);
                  }}
                />
              </div>
            )}
            <ul
              ref={list}
              id={listbox}
              className="list-select__list"
              role="listbox"
              aria-label={label}
              aria-activedescendant={!searchable && shown[active] ? `${id}-${active}` : undefined}
              tabIndex={-1}
            >
              {shown.map((option, index) => (
                <li
                  key={option.value}
                  id={`${id}-${index}`}
                  role="option"
                  aria-selected={option.value === value}
                  aria-disabled={option.disabled || undefined}
                  title={option.label}
                  className={`list-select__option${index === active ? ' is-active' : ''}${option.value === '' ? ' is-placeholder' : ''}`}
                  onPointerEnter={() => !option.disabled && setActive(index)}
                  onClick={() => choose(option)}
                >
                  {option.label}
                </li>
              ))}
              {shown.length === 0 && <li className="list-select__empty">Keine Treffer</li>}
            </ul>
          </div>,
          document.body,
        )}
    </>
  );
}
