import { ChartColumnIncreasing, Landmark, Map as MapIcon, MapPinned, Ruler } from 'lucide-react';

// The pages of a dashboard: the map, and one page per kind of analysis, so no page has to hold everything. path: after
// the dashboard's basePath ("/erzeuger/zubau"). scoped: the page shows a Land or Kreis (URL /<view>/<land>/<kreis>);
// the others are about Germany as a whole.
export const VIEWS = {
  karte: { id: 'karte', label: 'Karte', icon: MapIcon, path: '', scoped: true },
  // One Landkreis and its Gemeinden in depth, on a detailed map (KommuneView)
  kommune: { id: 'kommune', label: 'Landkreis/Gemeinde', icon: Landmark, path: 'kommune', scoped: true, gemeinde: true },
  zubau: { id: 'zubau', label: 'Zubau & Registrierungen', short: 'Zubau', icon: ChartColumnIncreasing, path: 'zubau', scoped: false },
  // gemeinde: the page can show a single Gemeinde of the Kreis too (?gemeinde=…)
  anlagen: { id: 'anlagen', label: 'Anlagen', icon: Ruler, path: 'anlagen', scoped: true, gemeinde: true },
  regionen: { id: 'regionen', label: 'Regionen', icon: MapPinned, path: 'regionen', scoped: true },
};
export const VIEW_PATHS = new Set(Object.values(VIEWS).map((view) => view.path).filter(Boolean));

// The dashboards in the navigation, each with its pages and what they show (the texts of the menu)
export const DASHBOARD_MENUS = [
  {
    id: 'erzeuger',
    label: 'Erzeuger',
    basePath: '/erzeuger',
    views: {
      karte: 'Solar, Wind und Wasserkraft je Land, Kreis, Gemeinde',
      kommune: 'Ein Landkreis und seine Gemeinden im Detail: Karte, Kennzahlen, Zubau je Jahr',
      zubau: 'Zubau seit 2000, Registrierungen und Meldefristen',
      anlagen: 'Größenklassen, Ausrichtung, Batteriespeicher an Solaranlagen',
      regionen: 'Steckbrief eines Gebiets und seine Teile im Vergleich',
    },
  },
  {
    id: 'speicher',
    label: 'Speicher',
    basePath: '/speicher',
    views: {
      karte: 'Batterie- und Pumpspeicher je Land, Kreis, Gemeinde',
      kommune: 'Batteriespeicher eines Landkreises und seiner Gemeinden: Karte, Kennzahlen, Zubau je Jahr',
      zubau: 'Batteriekapazität und -leistung je Jahr, Registrierungen und Meldefristen',
      anlagen: 'Batteriespeicher an Solaranlagen',
      regionen: 'Steckbrief eines Gebiets',
    },
  },
  {
    id: 'gas',
    label: 'Gas',
    basePath: '/gas',
    views: {
      karte: 'Gaserzeuger und Gasspeicher an ihren Standorten',
      zubau: 'Registrierungen und Meldefristen',
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
