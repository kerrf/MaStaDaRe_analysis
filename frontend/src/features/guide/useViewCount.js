import { useEffect } from 'react';
import { COUNTING, countEvent } from '../../lib/usage';
import { rememberThisVisit, thisVisit } from './memory';

// A view settles before it counts: a person trying three Kennzahlen in a row counts the one they stay with
const SETTLE_MS = 2500;
const VISIT = 'visitCounted';

/**
 * Counts each view of a dashboard page (lib/usage.js, "Ansicht"): the page, the area's level (and the Land and Kreis),
 * and its link's settings – which are only those that differ from the page's defaults, so each one is a setting the
 * person changed. The first view of a visit says so (besuch=neu): the report counts visits by it.
 */
export default function useViewCount(dashboard, view, state) {
  const { region, kreisAgs, searchParams } = state;
  const query = searchParams.toString();
  useEffect(() => {
    if (!COUNTING) return undefined;
    const timer = setTimeout(() => {
      const props = {
        seite: `${dashboard}/${view}`,
        gebiet: kreisAgs ? 'kreis' : region ? 'land' : 'deutschland',
        ...(region && { land: region.code }),
        ...(kreisAgs && { kreis: kreisAgs }),
        ...(!thisVisit(VISIT) && { besuch: 'neu' }),
        ...Object.fromEntries(new URLSearchParams(query)),
      };
      rememberThisVisit(VISIT);
      countEvent('Ansicht', props);
    }, SETTLE_MS);
    return () => clearTimeout(timer);
  }, [dashboard, view, region, kreisAgs, query]);
}
