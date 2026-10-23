import { createContext, useContext, useEffect } from 'react';

// The remarks of a dashboard page, all in one place at its bottom (footnotes.jsx): whatever shows something that needs
// a remark registers it here (useFootnote) and marks the spot with its number (FootnoteRef), which links down to it.
export const FootnoteContext = createContext(null);

export const footnoteAnchor = (id) => `fussnote-${id}`;

// The number of a remark on the page (1, 2, …), null while it isn't there
export function useFootnoteNumber(id) {
  const index = useContext(FootnoteContext)?.notes.findIndex((n) => n.id === id) ?? -1;
  return index >= 0 ? index + 1 : null;
}

/**
 * Registers a remark for the page's footnotes while the component shows it (text falsy: none). link: { to, label } – a
 * page of the site the remark points to, after its text. Returns its number.
 */
export function useFootnote(id, text, link = null) {
  const add = useContext(FootnoteContext)?.add;
  const to = link?.to;
  const label = link?.label;
  useEffect(() => (add && text ? add(id, text, to ? { to, label } : null) : undefined), [add, id, text, to, label]);
  return useFootnoteNumber(id);
}
