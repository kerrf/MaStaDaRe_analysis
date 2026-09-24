import { useEffect } from 'react';
import { SITE } from '../config/site';

export default function useDocumentTitle(title) {
  useEffect(() => {
    document.title = title ? `${title} · ${SITE.name}` : `${SITE.name} – Die Energiewende in Daten`;
  }, [title]);
}
