import { useCallback, useEffect, useState } from 'react';
import { trackEvent } from '../../lib/usage';
import { remember, remembered } from './memory';

// The tour on the first visit of a map: four steps, skippable, once (remembered in the browser, no cookie). The
// elements it marks carry data-tour="…" (MapView, MapSidebar, Dashboard); on a phone the sidebar is a drawer, its
// button stands in for it.
const SEEN = 'tourSeen';
const START_AFTER_MS = 900; // the map drawn first

export const MAP_TOUR = [
  {
    targets: ['[data-tour="sidebar"]', '[data-tour="sidebar-open"]'],
    title: 'Was die Karte zeigt',
    text: 'Technologie, Kennzahl und Anlagenart wählen Sie hier. Zurücksetzen bringt alles auf den Anfang.',
  },
  {
    targets: ['[data-tour="map"]'],
    title: 'Hineinzoomen',
    text: 'Ein Klick auf ein Bundesland zeigt seine Kreise, ein Klick auf einen Kreis seine Gemeinden. Rechts die Rangliste dazu.',
  },
  {
    targets: ['[data-tour="zeitraum"]', '[data-tour="sidebar-open"]'],
    title: 'Zurück in der Zeit',
    text: 'Bestand am Ende eines Jahres oder Monats, Zubau und Stilllegungen darin, was in Planung ist – seit 2000.',
  },
  {
    targets: ['[data-tour="share"]'],
    title: 'Teilen und herunterladen',
    text: 'Der Link enthält die ganze Ansicht: Gebiet, Technologie, Zeitraum. „Teilen“ kopiert ihn. Jede Karte und Grafik gibt es auch als CSV, PNG oder PDF.',
  },
];

/**
 * The map's tour: opens by itself once the map is ready on the first visit, and again on request (start). close(finished)
 * remembers it, finished or skipped.
 */
export function useMapTour(ready) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!ready || remembered(SEEN)) return undefined;
    const timer = setTimeout(() => {
      trackEvent('Tour', { aktion: 'gestartet', weg: 'erster Besuch' });
      setOpen(true);
    }, START_AFTER_MS);
    return () => clearTimeout(timer);
  }, [ready]);
  const start = useCallback(() => {
    trackEvent('Tour', { aktion: 'gestartet', weg: 'Link' });
    setOpen(true);
  }, []);
  const close = useCallback((finished) => {
    remember(SEEN);
    trackEvent('Tour', { aktion: finished ? 'beendet' : 'übersprungen' });
    setOpen(false);
  }, []);
  return { open, start, close, seen: !open && remembered(SEEN) };
}
