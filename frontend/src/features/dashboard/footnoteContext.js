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

/** Registers a remark for the page's footnotes while the component shows it (text falsy: none). Returns its number. */
export function useFootnote(id, text) {
  const add = useContext(FootnoteContext)?.add;
  useEffect(() => (add && text ? add(id, text) : undefined), [add, id, text]);
  return useFootnoteNumber(id);
}
