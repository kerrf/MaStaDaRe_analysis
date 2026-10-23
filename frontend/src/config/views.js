import { ChartColumnIncreasing, Landmark, LayoutDashboard, Map as MapIcon, MapPinned, Ruler, UtilityPole } from 'lucide-react';

// The pages of a dashboard: the map, and one page per kind of analysis, so no page has to hold everything. path: after
// the dashboard's basePath ("/erzeuger/zubau"). scoped: the page shows a Land or Kreis (URL /<view>/<land>/<kreis>);
// the others are about Germany as a whole.
export const VIEWS = {
  karte: { id: 'karte', label: 'Karte', icon: MapIcon, path: '', scoped: true },
  // One technology of an area on one page, like a report for a year or a month: Bestand, Zubau, its Arten, its place
  // among its peers, the targets (OverviewView), also as a PDF – in Deutschland, a Land or a Kreis
  ueberblick: { id: 'ueberblick', label: 'Überblick', icon: LayoutDashboard, path: 'ueberblick', scoped: true },
  // In Deutschland, a Land or a Kreis (no Gemeinde: the monthly series stop at the Kreise)
  zubau: { id: 'zubau', label: 'Zubau & Registrierungen', short: 'Zubau', icon: ChartColumnIncreasing, path: 'zubau', scoped: true },
  // gemeinde: the page can show a single Gemeinde of the Kreis too (?gemeinde=…)
  anlagen: { id: 'anlagen', label: 'Anlagen', icon: Ruler, path: 'anlagen', scoped: true, gemeinde: true },
  // One Landkreis and its Gemeinden in depth, on a detailed map (KommuneView)
  kommune: { id: 'kommune', label: 'Regionen im Detail', icon: Landmark, path: 'kommune', scoped: true, gemeinde: true },
  // The parts of an area side by side (Länder of Germany, Kreise of a Land, Gemeinden of a Kreis)
  regionen: { id: 'regionen', label: 'Regionen im Vergleich', icon: MapPinned, path: 'regionen', scoped: true },
  // The Netzanschlüsse of an area by Netzebene, technology and grid operator (NetzView), in Deutschland, a Land or a Kreis
  spannungsebenen: {
    id: 'spannungsebenen',
    label: 'Spannungsebenen & Netzbetreiber',
    short: 'Spannungsebenen',
    icon: UtilityPole,
    path: 'spannungsebenen',
    scoped: true,
  },
};
export const VIEW_PATHS = new Set(Object.values(VIEWS).map((view) => view.path).filter(Boolean));

// The dashboards in the navigation, each with its pages and what they show (the texts of the menu), in the order of the
// menu and the tabs: the Überblick first
export const DASHBOARD_MENUS = [
  {
    id: 'erzeuger',
    label: 'Erzeuger',
    basePath: '/erzeuger',
    views: {
      ueberblick: 'Eine Technologie eines Gebiets in einem Jahr oder Monat: Bestand, Zubau, Rang, Ausbauziel – auch als PDF',
      karte: 'Solar, Wind, Biomasse, Wasserkraft, Geothermie, KWK je Land, Kreis, Gemeinde',
      zubau: 'Zubau seit 2000, Registrierungen und Meldefristen',
      anlagen: 'Größenklassen, Ausrichtung, Batteriespeicher an Solaranlagen',
      kommune: 'Ein Landkreis und seine Gemeinden im Detail: Karte, Kennzahlen, Zubau je Jahr',
      regionen: 'Die Teile eines Gebiets im Vergleich: Ausrichtung und Anlagengröße je Land, Kreis, Gemeinde',
    },
  },
  {
    id: 'speicher',
    label: 'Speicher',
    basePath: '/speicher',
    views: {
      ueberblick: 'Batterie- oder sonstige Speicher eines Gebiets in einem Jahr oder Monat: Bestand, Zubau, Arten, Rang – auch als PDF',
      karte: 'Batterie-, Pump-, Druckluft-, Schwungrad- und Wasserstoffspeicher je Land, Kreis, Gemeinde',
      zubau: 'Batteriekapazität und -leistung je Jahr, Registrierungen und Meldefristen',
      anlagen: 'Speichergröße, Batterietechnologie und Kopplung, Batteriespeicher an Solaranlagen',
      kommune: 'Batteriespeicher eines Landkreises und seiner Gemeinden: Karte, Kennzahlen, Zubau je Jahr',
      regionen: 'Die Teile eines Gebiets im Vergleich: Speichergröße je Land, Kreis, Gemeinde',
    },
  },
  {
    id: 'gas',
    label: 'Gas',
    basePath: '/gas',
    views: {
      karte: 'Gaserzeuger und Gasspeicher an ihren Standorten',
      zubau: 'Registrierungen und Meldefristen',
      anlagen: 'Größenklassen und Technologien der Gaserzeuger, Größen und Arten der Gasspeicher',
    },
  },
  {
    id: 'netz',
    label: 'Netzanschlüsse',
    basePath: '/netz',
    views: {
      karte: 'Netzanschlusspunkte der Stromerzeugung je Land, Kreis, Gemeinde',
      zubau: 'Neue Netzanschlüsse und angeschlossene Leistung je Spannungsebene, Registrierungen',
      spannungsebenen: 'Netzanschlüsse je Netzebene und Technologie, die größten Netzbetreiber',
    },
  },
];

// The address of a page of a dashboard, in a Land or Kreis where the page has one
export function viewPath(basePath, viewId, land = null, kreis = null) {
  const view = VIEWS[viewId];
  return [basePath, view.path, view.scoped && land, view.scoped && land && kreis].filter(Boolean).join('/');
}

// The pages of one dashboard, in menu order
export const viewsOf = (dashboardId) => Object.keys(DASHBOARD_MENUS.find((menu) => menu.id === dashboardId)?.views ?? { karte: '' });
