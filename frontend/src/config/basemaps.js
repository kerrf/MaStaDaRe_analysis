// Background maps of the Landkreis/Gemeinde page, as map tiles (Web Mercator, {z}/{y}/{x}). The basemap.de ones are the
// official German base map of the BKG (open, dl-de/by-2-0; transparent outside Germany, where our map of Europe shows);
// the satellite view is Sentinel-2 cloudless by EOX (CC BY-NC-SA 4.0, for non-commercial use). Loading a tile sends the
// visitor's IP address to its provider: named in the Datenschutzerklärung. fillOpacity: how strongly the Gemeinden's
// shading covers it at first.
const now = new Date();
const BASEMAP_DE = `© basemap.de / BKG ${String(now.getMonth() + 1).padStart(2, '0')}/${now.getFullYear()}`;
const basemapDe = (layer) => `https://sgx.geodatenzentrum.de/wmts_basemapde/tile/1.0.0/${layer}/default/GLOBAL_WEBMERCATOR/{z}/{y}/{x}.png`;

export const BASEMAPS = [
  {
    id: 'grau',
    label: 'Grau',
    url: basemapDe('de_basemapde_web_raster_grau'),
    attribution: `${BASEMAP_DE} (dl-de/by-2-0)`,
    link: 'https://basemap.de',
    // The switch shows a tile of it: the BKG serves the map in view anyway
    preview: true,
    // Areas on a grey map read like on the plain one
    fillOpacity: 0.7,
  },
  {
    id: 'farbe',
    label: 'Farbig',
    url: basemapDe('de_basemapde_web_raster_farbe'),
    attribution: `${BASEMAP_DE} (dl-de/by-2-0)`,
    link: 'https://basemap.de',
    preview: true,
    fillOpacity: 0.55,
  },
  {
    id: 'satellit',
    label: 'Satellit',
    url: 'https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless-2024_3857/default/g/{z}/{y}/{x}.jpg',
    attribution: 'Sentinel-2 cloudless 2024 von EOX IT Services GmbH (enthält modifizierte Copernicus-Sentinel-Daten 2024), CC BY-NC-SA 4.0',
    link: 'https://s2maps.eu',
    // No tile in the switch: EOX gets a request only once the satellite view is chosen (Datenschutzerklärung)
    preview: false,
    fillOpacity: 0.5,
  },
  // Our own map: Europe in grey, without streets and towns
  { id: 'ohne', label: 'Ohne', url: null, attribution: null, fillOpacity: 0.9 },
];

export const DEFAULT_BASEMAP = 'grau';

// The tile of a background map at a point, as a picture of it in the switcher (only where preview allows it)
export function tileAt(basemap, lat, lon, zoom) {
  if (!basemap.preview) return null;
  const n = 2 ** zoom;
  const x = Math.floor(((lon + 180) / 360) * n);
  const rad = (lat * Math.PI) / 180;
  const y = Math.floor(((1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2) * n);
  return basemap.url?.replace('{z}', zoom).replace('{x}', x).replace('{y}', y) ?? null;
}
