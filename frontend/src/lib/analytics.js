import { track } from '@vercel/analytics/react';
import { findBundesland, isKreisKey } from '../config/regions';

// Custom events of Vercel Web Analytics (which features are used: exports, technologies, filters) need the Pro plan.
// They are sent only with VITE_ANALYTICS_EVENTS=true in the Vercel project, so on Hobby they don't count against the
// page views. Pro allows 2 properties per event.
export const EVENTS_ENABLED = import.meta.env.VITE_ANALYTICS_EVENTS === 'true';

export function trackEvent(name, properties) {
  if (EVENTS_ENABLED) track(name, properties);
}

// The route of a page for Web Analytics and Speed Insights: its path with the Land and Kreis of a dashboard as
// placeholders, so "/erzeuger/[land]/[kreis]" adds up the visits of every Kreis (panel "Routes"); the path itself is in
// "Pages".
export function routeOf(pathname) {
  const segments = pathname
    .split('/')
    .filter(Boolean)
    .map((segment) => (findBundesland(segment) ? '[land]' : isKreisKey(segment) ? '[kreis]' : segment));
  return `/${segments.join('/')}`;
}
