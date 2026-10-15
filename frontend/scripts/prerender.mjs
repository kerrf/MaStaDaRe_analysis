/**
 * Pre-renders the pages search engines should find, after `vite build` (npm run build):
 *   dist/<path>.html  per page: its own title, description, canonical address (and robots tag), and its content as text
 *                     with the numbers of the API. Vercel serves it at /<path> (cleanUrls in vercel.json); the app
 *                     replaces the text as soon as it runs, search engines and link previews read it as it is.
 *   dist/spa.html     the app's shell, for every other address (the rewrite in vercel.json)
 *   dist/sitemap.xml  the pre-rendered pages to be found
 * The pages: start page, the dashboards' pages, the map of every Land, the Landkreis/Gemeinde page of every Land and
 * Kreis (Photovoltaik, Batteriespeicher), info and legal pages. Titles and texts come from the app's config, loaded
 * through Vite like in the app; the numbers from the API at build time (VITE_API_URL). Without the API the pages keep
 * their texts and go without numbers: the build doesn't fail on it.
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build, loadEnv } from 'vite';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIST = path.join(ROOT, 'dist');
const API = (loadEnv('production', ROOT, 'VITE_').VITE_API_URL || 'https://api.mastr-data.de').replace(/\/$/, '');

// ------------------------------------------------------------------------------------------------- the app's modules

// The app's config as one module for Node (prerender-modules.js): bundled by Vite, the packages stay imports
const MODULES = path.join(ROOT, 'node_modules/.prerender');
await build({
  root: ROOT,
  configFile: false,
  logLevel: 'error',
  build: {
    ssr: path.join(ROOT, 'scripts/prerender-modules.js'),
    outDir: MODULES,
    emptyOutDir: true,
    rollupOptions: { output: { entryFileNames: 'modules.mjs' } },
  },
});
const { dashboards, views, regions, seo, format, site, kommune } = await import(pathToFileURL(path.join(MODULES, 'modules.mjs')).href);

const { ERZEUGER, SPEICHER, GAS } = dashboards;
const { VIEWS, DASHBOARD_MENUS, viewPath } = views;
const { BUNDESLAENDER } = regions;
const { canonicalUrl, documentTitle, dashboardTitle, kommuneTitle } = seo;
const { formatAmountFine, formatCount, formatDate, formatNumber, formatPower } = format;
const { SITE } = site;
const { KOMMUNE } = kommune;

// --------------------------------------------------------------------------------------------------------- the data

async function fetchJson(pathname) {
  try {
    const response = await fetch(`${API}${pathname}`, { signal: AbortSignal.timeout(60_000) });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return await response.json();
  } catch (error) {
    console.warn(`prerender: ${API}${pathname}: ${error.message} – the pages go without these numbers`);
    return null;
  }
}

const [meta, solarKreise, batteryKreise, solarGemeinden, batteryGemeinden, kreisAreas, gemeindeAreas, solarLaender, windLaender, batteryLaender] =
  await Promise.all([
    fetchJson('/meta/datenstand'),
    fetchJson('/solar/dashboard-stats?level=landkreis'),
    fetchJson('/battery/dashboard-stats?level=landkreis'),
    fetchJson('/solar/dashboard-stats?level=gemeinde'),
    fetchJson('/battery/dashboard-stats?level=gemeinde'),
    fetchJson('/regions/areas?level=landkreis'),
    fetchJson('/regions/areas?level=gemeinde'),
    fetchJson('/solar/dashboard-stats?level=bundesland'),
    fetchJson('/wind/dashboard-stats?level=bundesland'),
    fetchJson('/battery/dashboard-stats?level=bundesland'),
  ]);

const datenstand = meta?.datenstand ?? null; // "2026-10-04", the sitemap's lastmod of the data pages
const stand = datenstand ? `Stand ${formatDate(datenstand)}` : null;
const byKey = (rows, key) => new Map((rows ?? []).map((row) => [row[key], row]));
const solarOfKreis = byKey(solarKreise, 'landkreis');
const batteryOfKreis = byKey(batteryKreise, 'landkreis');
const solarOfGemeinde = byKey(solarGemeinden, 'gemeinde');
const batteryOfGemeinde = byKey(batteryGemeinden, 'gemeinde');
const areaOfKreis = byKey(kreisAreas, 'region');
const sum = (rows, field) => (rows ?? []).reduce((total, row) => total + (row[field] ?? 0), 0);

// The Kreise of today's boundaries (as on the map), each with its Land and its Gemeinden (the most populous first)
const topology = JSON.parse(await readFile(path.join(DIST, 'landkreise_boundaries.topojson'), 'utf8'));
const properName = (name) => name.replace(/^(Land)?kreis /i, '');
const kreise = topology.objects[Object.keys(topology.objects)[0]].geometries
  .map((g) => g.properties)
  .filter((p) => /^\d{5}$/.test(p.ags))
  .map((p) => ({
    ags: p.ags,
    name: p.name,
    land: BUNDESLAENDER.find((b) => b.ags === p.ags.slice(0, 2)),
    gemeinden: (gemeindeAreas ?? []).filter((g) => g.region.startsWith(p.ags)).sort((a, b) => (b.einwohner ?? 0) - (a.einwohner ?? 0)),
  }))
  .filter((k) => k.land)
  .sort((a, b) => properName(a.name).localeCompare(properName(b.name), 'de'));
const kreiseOf = (land) => kreise.filter((k) => k.land === land);

// --------------------------------------------------------------------------------------------------------- the HTML

const esc = (text) => String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const link = (href, text) => `<a href="${esc(href)}">${esc(text)}</a>`;
const power = (mw) => formatAmountFine(mw, 'MW');
const capacity = (mwh) => formatAmountFine(mwh, 'MWh');
const amount = ({ value, unit }) => `${value} ${unit}`;
const list = (items) => `<ul class="prerender__links">${items.map((item) => `<li>${item}</li>`).join('')}</ul>`;
const figures = (pairs) =>
  `<dl class="prerender__figures">${pairs.map(([label, value]) => `<div><dt>${esc(label)}</dt><dd>${esc(value)}</dd></div>`).join('')}</dl>`;
const table = (head, rows) =>
  `<table><thead><tr>${head.map((h) => `<th scope="col">${esc(h)}</th>`).join('')}</tr></thead><tbody>${rows
    .map(([first, ...cells]) => `<tr><th scope="row">${first}</th>${cells.map((c) => `<td>${esc(c)}</td>`).join('')}</tr>`)
    .join('')}</tbody></table>`;

// The way to a page: visible above its title, and for search engines as structured data (BreadcrumbList)
const crumbsOf = (crumbs) =>
  `<nav class="prerender__crumbs" aria-label="Pfad">${crumbs.map(([name, href]) => link(href, name)).join(' › ')}</nav>`;
const breadcrumbList = (crumbs) => ({
  '@context': 'https://schema.org',
  '@type': 'BreadcrumbList',
  itemListElement: crumbs.map(([name, href], i) => ({ '@type': 'ListItem', position: i + 1, name, item: canonicalUrl(href) })),
});

const NAV = [
  ['/', 'Übersicht'],
  ['/erzeuger', 'Erzeuger'],
  ['/speicher', 'Speicher'],
  ['/gas', 'Gas'],
  ['/datenqualitaet', 'Datenqualität'],
  ['/info', 'Info'],
];

// A page as text, in the frame of the site: the bar with the sections, the content, the source
const frame = (main) =>
  `<div class="prerender">` +
  `<header class="prerender__bar">${link('/', SITE.name)}<nav class="prerender__nav" aria-label="Hauptnavigation">${NAV.map(([href, text]) => link(href, text)).join('')}</nav></header>` +
  `<main class="prerender__main">${main}</main>` +
  `<footer class="prerender__foot">Daten: Marktstammdatenregister (Bundesnetzagentur), dl-de/by-2-0${stand ? `, ${stand}` : ''} · ` +
  `${link('/info', 'Methodik & Quellen')} · ${link('/impressum', 'Impressum')} · ${link('/datenschutz', 'Datenschutz')}</footer>` +
  `</div>`;

// ----------------------------------------------------------------------------------------------------------- pages

// { path, title (as in the browser), description, robots?, jsonLd?, sitemap (default true), data (lastmod: Datenstand), main }
const pages = [];
const MENUS = Object.fromEntries(DASHBOARD_MENUS.map((menu) => [menu.id, menu]));
const CONFIGS = [ERZEUGER, SPEICHER, GAS];

// Start page
const solarTotal = sum(solarLaender, 'total_power');
const home = [
  ['Solaranlagen', solarLaender && `${formatCount(sum(solarLaender, 'total_units'))} · ${amount(formatPower(solarTotal))}`],
  ['Windenergieanlagen', windLaender && `${formatNumber(sum(windLaender, 'total_units'))} · ${amount(formatPower(sum(windLaender, 'total_power')))}`],
  ['Batteriespeicher', batteryLaender && `${formatCount(sum(batteryLaender, 'total_units'))} · ${amount(formatPower(sum(batteryLaender, 'total_power')))}`],
].filter(([, value]) => value);
pages.push({
  path: '/',
  title: documentTitle(null),
  description:
    'Interaktive Karten und Analysen zum Ausbau erneuerbarer Energien in Deutschland: Photovoltaik, Wind und Speicher je Bundesland, Landkreis, Gemeinde und Postleitzahl – auf Basis des Marktstammdatenregisters.',
  jsonLd: { '@context': 'https://schema.org', '@type': 'WebSite', name: SITE.name, url: canonicalUrl('/'), inLanguage: 'de' },
  data: true,
  main:
    `<h1>Unsere Energiewende im Blick</h1>` +
    `<p class="prerender__lead">Interaktive Analysen und Visualisierungen zum Ausbau erneuerbarer Energien in Deutschland – basierend auf hochauflösenden Daten des Marktstammdatenregisters (MaStR)${stand ? `, ${stand}` : ''}.</p>` +
    (home.length ? figures(home) : '') +
    `<h2>Dashboards</h2>` +
    list(CONFIGS.map((config) => `${link(config.basePath, config.title)}: ${esc(MENUS[config.id].views.karte)}`)) +
    `<h2>Photovoltaik und Batteriespeicher je Landkreis</h2>` +
    list(BUNDESLAENDER.map((land) => `${link(viewPath('/erzeuger', 'kommune', land.code), land.name)} (${link(viewPath('/speicher', 'kommune', land.code), 'Speicher')})`)),
});

// The pages of each dashboard, with the Länder (map) or the Länder's Kreise (Landkreis/Gemeinde) as links
for (const config of CONFIGS) {
  const menu = MENUS[config.id];
  for (const [view, text] of Object.entries(menu.views)) {
    const pagePath = viewPath(config.basePath, view);
    const pageTitle = dashboardTitle(config.title, view !== 'karte' && VIEWS[view].label);
    const description = view === 'karte' ? config.description : `${config.title}: ${text}. Interaktive Auswertungen auf Basis des Marktstammdatenregisters.`;
    const below =
      view === 'karte' && config.id !== 'gas'
        ? `<h2>Nach Bundesland</h2>${list(BUNDESLAENDER.map((land) => link(viewPath(config.basePath, 'karte', land.code), land.name)))}`
        : view === 'kommune'
          ? `<h2>Landkreise nach Bundesland</h2>${list(BUNDESLAENDER.map((land) => link(viewPath(config.basePath, 'kommune', land.code), land.name)))}`
          : '';
    pages.push({
      path: pagePath,
      title: documentTitle(pageTitle),
      description,
      data: true,
      main:
        crumbsOf([['Startseite', '/'], [config.title, config.basePath]]) +
        `<h1>${esc(pageTitle)}</h1><p class="prerender__lead">${esc(description)}</p>` +
        below +
        `<h2>Weitere Seiten</h2>${list(Object.entries(menu.views).map(([v, t]) => `${link(viewPath(config.basePath, v), VIEWS[v].label)}: ${esc(t)}`))}`,
    });
  }
}

// The map of every Land (Erzeuger, Speicher)
const ofLand = (rows, land) => (rows ?? []).find((row) => row.bundesland === land.ags);
for (const land of BUNDESLAENDER) {
  for (const config of [ERZEUGER, SPEICHER]) {
    const solar = ofLand(solarLaender, land);
    const wind = ofLand(windLaender, land);
    const battery = ofLand(batteryLaender, land);
    const numbers =
      config === ERZEUGER
        ? solar && wind && `${formatCount(solar.total_units)} Solaranlagen mit ${power(solar.total_power)}, ${formatNumber(wind.total_units)} Windenergieanlagen mit ${power(wind.total_power)}`
        : battery && `${formatCount(battery.total_units)} Batteriespeicher mit ${power(battery.total_power)} Leistung`;
    const what =
      config === ERZEUGER
        ? 'auf der Karte je Landkreis, Gemeinde und Postleitzahl, absolut, je km² und je Einwohner'
        : 'auf der Karte je Landkreis und Gemeinde, dazu die Pumpspeicherkraftwerke';
    const description = numbers ? `${land.name}: ${numbers}${stand ? ` (${stand})` : ''} – ${what}.` : `${config.title} in ${land.name} ${what}.`;
    const pageTitle = dashboardTitle(config.title, null, land.name);
    const crumbs = [['Startseite', '/'], [config.title, config.basePath], [land.name, viewPath(config.basePath, 'karte', land.code)]];
    pages.push({
      path: viewPath(config.basePath, 'karte', land.code),
      title: documentTitle(pageTitle),
      description,
      jsonLd: breadcrumbList(crumbs),
      data: true,
      main:
        crumbsOf(crumbs) +
        `<h1>${esc(pageTitle)}</h1><p class="prerender__lead">${esc(description)}</p>` +
        `<h2>Landkreise in ${esc(land.name)}</h2>${list(kreiseOf(land).map((k) => link(viewPath(config.basePath, 'kommune', land.code, k.ags), k.name)))}`,
    });
  }
}

// The Landkreis/Gemeinde pages: every Land (its Kreise in a table) and every Kreis (its figures and Gemeinden)
const KOMMUNE_PAGES = [
  {
    config: ERZEUGER,
    of: solarOfKreis,
    ofGemeinde: solarOfGemeinde,
    noun: 'Solaranlagen',
    other: { config: SPEICHER, label: 'Batteriespeicher' },
    columns: ['Anlagen', 'Leistung (netto)'],
    cells: (row) => [formatNumber(row.total_units), power(row.total_power)],
    numbers: (row) => `${formatNumber(row.total_units)} Solaranlagen mit ${power(row.total_power)}, ${formatNumber(row.relative_population_power, 2)} kW je Einwohner`,
    pairs: (row) => [
      ['Solaranlagen', formatNumber(row.total_units)],
      ['Leistung (netto)', power(row.total_power)],
      ['je Einwohner', `${formatNumber(row.relative_population_power, 2)} kW`],
      ['Zubau in 12 Monaten', power(row.added_12m_power)],
    ],
    rest: (gemeinden) => `Zubau je Jahr, Ausbauziel 2030 und alle ${gemeinden} Gemeinden im Vergleich.`,
  },
  {
    config: SPEICHER,
    of: batteryOfKreis,
    ofGemeinde: batteryOfGemeinde,
    noun: 'Batteriespeicher',
    other: { config: ERZEUGER, label: 'Photovoltaik' },
    columns: ['Speicher', 'Kapazität', 'Leistung'],
    cells: (row) => [formatNumber(row.total_units), capacity(row.total_capacity), power(row.total_power)],
    numbers: (row) => `${formatNumber(row.total_units)} Batteriespeicher mit ${capacity(row.total_capacity)} nutzbarer Kapazität und ${power(row.total_power)} Leistung, ${formatNumber(row.relative_population_capacity, 2)} kWh je Einwohner`,
    pairs: (row) => [
      ['Batteriespeicher', formatNumber(row.total_units)],
      ['Kapazität', capacity(row.total_capacity)],
      ['Leistung', power(row.total_power)],
      ['Zubau in 12 Monaten', capacity(row.added_12m_capacity)],
    ],
    rest: (gemeinden) => `Zubau je Jahr, Vergleich mit Solar und Land, alle ${gemeinden} Gemeinden.`,
  },
];

for (const kind of KOMMUNE_PAGES) {
  const { config } = kind;
  const base = viewPath(config.basePath, 'kommune');
  const pageLabel = VIEWS.kommune.label;
  for (const land of BUNDESLAENDER) {
    const own = kreiseOf(land);
    const rows = own.map((k) => kind.of.get(k.ags)).filter(Boolean);
    const landTitle = kommuneTitle(config.id, { landName: land.name });
    const landPath = viewPath(config.basePath, 'kommune', land.code);
    const landCrumbs = [['Startseite', '/'], [config.title, config.basePath], [pageLabel, base], [land.name, landPath]];
    const landNumbers = rows.length
      ? `${formatNumber(sum(rows, 'total_units'))} ${kind.noun} in ${own.length} Landkreisen und kreisfreien Städten${stand ? ` (${stand})` : ''}`
      : `${own.length} Landkreise und kreisfreie Städte`;
    pages.push({
      path: landPath,
      title: documentTitle(landTitle),
      description: `${land.name}: ${landNumbers} – je Kreis ${kind.noun}, Zubau je Jahr und die Gemeinden im Vergleich.`,
      jsonLd: breadcrumbList(landCrumbs),
      data: true,
      main:
        crumbsOf(landCrumbs) +
        `<h1>${esc(landTitle)}</h1><p class="prerender__lead">${esc(`${land.name}: ${landNumbers}. ${KOMMUNE[config.id].finderLead}`)}</p>` +
        table(
          ['Landkreis', ...kind.columns],
          own.map((k) => [link(viewPath(config.basePath, 'kommune', land.code, k.ags), k.name), ...(kind.of.has(k.ags) ? kind.cells(kind.of.get(k.ags)) : kind.columns.map(() => '–'))]),
        ) +
        `<h2>${esc(kind.other.label)}</h2>${list([link(viewPath(kind.other.config.basePath, 'kommune', land.code), `${land.name}: ${kind.other.label} nach Landkreis`)])}`,
    });

    for (const k of own) {
      const row = kind.of.get(k.ags);
      const einwohner = areaOfKreis.get(k.ags)?.einwohner;
      const title = kommuneTitle(config.id, { landName: land.name, kreisName: k.name });
      const kreisPath = viewPath(config.basePath, 'kommune', land.code, k.ags);
      const crumbs = [...landCrumbs, [k.name, kreisPath]];
      const lead = row ? `${k.name} (${land.name}): ${kind.numbers(row)}${stand ? ` (${stand})` : ''}.` : `${k.name} (${land.name}): ${kind.noun}.`;
      const gemeinden = k.gemeinden.map((g) => ({ ...g, row: kind.ofGemeinde.get(g.region) }));
      pages.push({
        path: kreisPath,
        title: documentTitle(title),
        description: `${lead} ${kind.rest(k.gemeinden.length)}`,
        jsonLd: breadcrumbList(crumbs),
        data: true,
        main:
          crumbsOf(crumbs) +
          `<h1>${esc(title)}</h1><p class="prerender__lead">${esc(lead)} ${esc(kind.rest(k.gemeinden.length))}</p>` +
          (row ? figures([...kind.pairs(row), ...(einwohner ? [['Einwohner', formatNumber(einwohner)]] : [])]) : '') +
          (gemeinden.length > 1
            ? `<h2>Gemeinden in ${esc(k.name)}</h2>` +
              table(['Gemeinde', ...kind.columns], gemeinden.map((g) => [esc(g.name), ...(g.row ? kind.cells(g.row) : kind.columns.map(() => '–'))]))
            : '') +
          `<h2>Mehr zu ${esc(k.name)}</h2>` +
          list([
            link(viewPath(kind.other.config.basePath, 'kommune', land.code, k.ags), `${k.name}: ${kind.other.label}`),
            link(viewPath(config.basePath, 'anlagen', land.code, k.ags), `${k.name}: Anlagen nach Größe und Ausrichtung`),
            link(viewPath(config.basePath, 'karte', land.code, k.ags), `${k.name} auf der Karte`),
          ]) +
          `<h2>Weitere Landkreise in ${esc(land.name)}</h2>${list(own.filter((other) => other !== k).map((other) => link(viewPath(config.basePath, 'kommune', land.code, other.ags), other.name)))}`,
      });
    }
  }
}

// Info and legal pages: their texts are the app's; here their title and what they are about
const STATIC = [
  { path: '/info', title: 'Info & Methodik', description: 'Wie die Zahlen entstehen: Quellen, Aufbereitung und Methodik des MaStR Dashboards, Glossar und häufige Fragen.' },
  { path: '/datenqualitaet', title: 'Datenqualität des MaStR', description: 'Wie vollständig und plausibel sind die Angaben im Marktstammdatenregister? Was beim Aufbereiten auffällt und wie die Auswertungen damit umgehen.', robots: 'noindex', sitemap: false },
  { path: '/impressum', title: 'Impressum', description: `Impressum von ${SITE.url.replace('https://', '')}.`, robots: 'index, nofollow' },
  { path: '/datenschutz', title: 'Datenschutz', description: `Datenschutzerklärung von ${SITE.url.replace('https://', '')}: welche Daten beim Besuch anfallen und wofür.` },
];
for (const page of STATIC) {
  pages.push({
    ...page,
    title: documentTitle(page.title),
    main: `<h1>${esc(page.title)}</h1><p class="prerender__lead">${esc(page.description)}</p>`,
  });
}

// ---------------------------------------------------------------------------------------------------------- writing

// The page as Vite built it; once pre-rendered, index.html is the start page and spa.html the untouched shell
const template = await readFile(path.join(DIST, 'spa.html'), 'utf8').catch(() => readFile(path.join(DIST, 'index.html'), 'utf8'));
const HEAD = /<!-- page head[\s\S]*?<!-- \/page head -->/;
const ROOT_DIV = '<div id="root"></div>';
if (!HEAD.test(template) || !template.includes(ROOT_DIV)) throw new Error('prerender: dist/index.html lacks the page head markers or the empty root');

function htmlOf(page) {
  const url = canonicalUrl(page.path);
  const head = [
    `<title>${esc(page.title)}</title>`,
    `<meta name="description" content="${esc(page.description)}" />`,
    page.robots && `<meta name="robots" content="${page.robots}" />`,
    `<link rel="canonical" href="${url}" />`,
    `<meta property="og:title" content="${esc(page.title)}" />`,
    `<meta property="og:description" content="${esc(page.description)}" />`,
    `<meta property="og:url" content="${url}" />`,
    page.jsonLd && `<script type="application/ld+json">${JSON.stringify(page.jsonLd).replace(/</g, '\\u003c')}</script>`,
  ].filter(Boolean);
  return template.replace(HEAD, head.join('\n    ')).replace(ROOT_DIV, `<div id="root">${frame(page.main)}</div>`);
}

// The shell first: index.html becomes the start page
await writeFile(path.join(DIST, 'spa.html'), template);
for (const page of pages) {
  const file = page.path === '/' ? path.join(DIST, 'index.html') : path.join(DIST, `${page.path.slice(1)}.html`);
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, htmlOf(page));
}

const sitemap = pages
  .filter((page) => page.sitemap !== false)
  .map((page) => `  <url><loc>${canonicalUrl(page.path)}</loc>${page.data && datenstand ? `<lastmod>${datenstand}</lastmod>` : ''}</url>`);
await writeFile(
  path.join(DIST, 'sitemap.xml'),
  `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${sitemap.join('\n')}\n</urlset>\n`,
);

const withNumbers = solarKreise && batteryKreise ? 'with' : 'WITHOUT';
console.log(`prerender: ${pages.length} pages (${withNumbers} the numbers of ${API}), ${sitemap.length} in the sitemap, ${stand ?? 'no Datenstand'}`);
