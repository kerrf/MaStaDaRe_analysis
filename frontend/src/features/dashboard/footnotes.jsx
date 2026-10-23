import { useCallback, useContext, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { FootnoteContext, footnoteAnchor, useFootnoteNumber } from './footnoteContext';

export function FootnotesProvider({ children }) {
  const [notes, setNotes] = useState([]);
  const add = useCallback((id, text, link = null) => {
    setNotes((current) =>
      current.some((n) => n.id === id && n.text === text && n.link?.to === link?.to)
        ? current
        : [...current.filter((n) => n.id !== id), { id, text, link }],
    );
    return () => setNotes((current) => current.filter((n) => n.id !== id));
  }, []);
  const value = useMemo(() => ({ notes, add }), [notes, add]);
  return <FootnoteContext.Provider value={value}>{children}</FootnoteContext.Provider>;
}

/** The number of a remark where it applies, linking to it at the page's bottom. */
export function FootnoteRef({ id }) {
  const number = useFootnoteNumber(id);
  if (!number) return null;
  return (
    <sup className="footnote-ref">
      <a href={`#${footnoteAnchor(id)}`} aria-label={`Anmerkung ${number}`}>
        {number}
      </a>
    </sup>
  );
}

/** The page's remarks, numbered, at its bottom: the same place on every page. */
export function Footnotes() {
  const context = useContext(FootnoteContext);
  if (!context?.notes.length) return null;
  return (
    <aside className="page-footnotes" aria-label="Anmerkungen">
      <h2 className="page-footnotes__title">Anmerkungen</h2>
      <ol className="page-footnotes__list">
        {context.notes.map((note, i) => (
          <li key={note.id} id={footnoteAnchor(note.id)}>
            <span className="page-footnotes__number tabular">{i + 1}</span>
            <p>
              {note.text}
              {note.link && (
                <>
                  {' '}
                  <Link to={note.link.to}>{note.link.label}</Link>
                </>
              )}
            </p>
          </li>
        ))}
      </ol>
    </aside>
  );
}
