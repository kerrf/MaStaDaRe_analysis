import { SITE } from './site';

// What search engines see: the address every page is known by, and the titles. The app sets them in the page
// (useDocumentTitle, AppLayout), scripts/prerender.mjs in the pre-rendered HTML: both from here, so both say the same.

// The site's address: mastr-data.de without www redirects here
export const SITE_ORIGIN = 'https://www.mastr-data.de';

// The address a page is known by (its canonical URL): without parameters, which only choose what the page shows, in
// lower case like every route, without a trailing slash
export function canonicalUrl(pathname) {
  const path = pathname.toLowerCase().replace(/\/+$/, '');
  return `${SITE_ORIGIN}${path || '/'}`;
}

// The title in the browser and in search results: the page's own (null: the start page's), then the site's name
export const documentTitle = (title) => (title ? `${title} · ${SITE.name}` : `${SITE.name} – Die Energiewende in Daten`);

// What the Landkreis/Gemeinde page of a dashboard shows, in its titles
const KOMMUNE_SUBJECTS = {
  erzeuger: { kreis: 'Photovoltaik – Solaranlagen, Leistung und Zubau', land: 'Photovoltaik nach Landkreis und Gemeinde' },
  speicher: { kreis: 'Batteriespeicher – Anlagen, Kapazität und Zubau', land: 'Batteriespeicher nach Landkreis und Gemeinde' },
};

// The title of a Landkreis/Gemeinde page: the place first, as people search for it ("Landkreis Zwickau: Photovoltaik
// …"). null without a Land: the page's ordinary title applies.
export function kommuneTitle(dashboardId, { landName, kreisName, gemeindeName }) {
  const subject = KOMMUNE_SUBJECTS[dashboardId];
  if (!subject || !landName) return null;
  if (!kreisName) return `${landName}: ${subject.land}`;
  return `${gemeindeName ? `${gemeindeName} (${kreisName})` : kreisName}: ${subject.kreis}`;
}

// The title of every other dashboard page: the dashboard, the page, the area in view ("Erzeuger · Zubau & …")
export const dashboardTitle = (dashboardTitleText, pageLabel, scopeName) => [dashboardTitleText, pageLabel, scopeName].filter(Boolean).join(' · ');
