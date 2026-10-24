import { track } from '@vercel/analytics/react';
import { findBundesland, isKreisKey } from '../config/regions';
import { API_BASE_URL } from '../config/site';

// Not named analytics.js: ad blockers block "/lib/analytics.js" (EasyPrivacy), and in the dev server, where every file
// is a request of its own, that leaves the whole app blank.

// Custom events of Vercel Web Analytics (which features are used: exports, technologies, filters) need the Pro plan.
// They are sent only with VITE_ANALYTICS_EVENTS=true in the Vercel project, so on Hobby they don't count against the
// page views. Pro allows 2 properties per event.
export const EVENTS_ENABLED = import.meta.env.VITE_ANALYTICS_EVENTS === 'true';

// Our own counts (backend app.routers.usage, DEPLOY.md "Nutzungszahlen"): the same events and every view's settings, to
// the API, in small batches – no cookie, no id, nothing of the visitor. Only with VITE_USAGE=true (the API must have
// its database), and never for a browser that asks not to be tracked (Do Not Track, Global Privacy Control).
const USAGE_URL = import.meta.env.VITE_USAGE === 'true' ? `${API_BASE_URL}/usage` : null;
export const USAGE_ENABLED = Boolean(USAGE_URL);
const declined = () => navigator.globalPrivacyControl === true || navigator.doNotTrack === '1';
// (Only in a browser: the prerendering in Node loads config modules, not this, but nothing here may break it)
export const COUNTING = Boolean(USAGE_URL) && typeof document !== 'undefined' && !declined();

const FLUSH_MS = 5000; // a batch every few seconds at most, and when the page is left
const BATCH = 25; // the API's limit per request
const MAX_PROPS = 10;
// What the API accepts (app.routers.usage): short keys, short plain values – anything else is left out here
const KEY = /^[a-z][a-z_]{0,23}$/;
const VALUE = /^[\p{L}\p{N}_ .,:/+\-–’()%]{1,60}$/u;

const queue = [];
let timer = null;

function clean(props = {}) {
  const out = {};
  for (const [key, raw] of Object.entries(props)) {
    if (raw == null || typeof raw === 'object' || typeof raw === 'boolean') continue;
    const value = String(raw).slice(0, 60);
    if (KEY.test(key) && VALUE.test(value) && Object.keys(out).length < MAX_PROPS) out[key] = value;
  }
  return out;
}

function flush() {
  clearTimeout(timer);
  timer = null;
  while (queue.length) {
    const body = JSON.stringify({ events: queue.splice(0, BATCH) });
    // text/plain: a request the browser sends without asking the API first; a beacon goes out even as the page closes
    const sent = navigator.sendBeacon?.(USAGE_URL, new Blob([body], { type: 'text/plain;charset=UTF-8' }));
    if (!sent) fetch(USAGE_URL, { method: 'POST', body, keepalive: true, headers: { 'Content-Type': 'text/plain;charset=UTF-8' } }).catch(() => {});
  }
}

if (COUNTING) {
  document.addEventListener('visibilitychange', () => document.visibilityState === 'hidden' && flush());
  window.addEventListener('pagehide', flush);
}

/** Counts an event with our own counts only (a view's settings: more than Vercel's two properties). */
export function countEvent(name, properties) {
  if (!COUNTING) return;
  queue.push({ name, props: clean(properties) });
  if (queue.length >= BATCH) flush();
  else if (!timer) timer = setTimeout(flush, FLUSH_MS);
}

export function trackEvent(name, properties) {
  if (EVENTS_ENABLED) track(name, properties);
  countEvent(name, properties);
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
