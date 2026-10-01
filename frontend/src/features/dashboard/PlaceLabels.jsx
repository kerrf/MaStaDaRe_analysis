import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useMap } from 'react-leaflet';
import L from 'leaflet';
import { loadJson } from '../../lib/data';
import { escapeHtml } from '../../lib/format';
import { placeLabels } from '../../lib/labelPlacement';

// Place names of the map (scripts/geo/build_places.py): rows of [name, lon, lat, population, ags, kind], kind L
// Landeshauptstadt, S Stadt, G Gemeinde, O Ortsteil. de.json holds the larger Gemeinden; the rest of a Land comes
// with its own file once the map shows it up close.
const BASE = '/places/de.json';
const landFile = (ags) => `/places/${ags}.json`;
const LAND_ZOOM = 8.5;

// From which population on a place is named, by zoom: the big cities in the view of Germany, the larger towns in that of
// a Land, Kleinstädte in a Kreis, villages and Ortsteile further in (in between, log-linear). Landeshauptstädte count
// half again as much, Ortsteile less than a Gemeinde of their size, and only from ORTSTEIL_ZOOM on.
const THRESHOLDS = [
  [6, 500000],
  [8.75, 50000],
  [10, 5000],
  [11, 1500],
  [12, 400],
];
function minPopulation(zoom) {
  const upper = THRESHOLDS.findIndex(([z]) => z >= zoom);
  if (upper <= 0) return THRESHOLDS[upper < 0 ? THRESHOLDS.length - 1 : 0][1];
  const [[z0, p0], [z1, p1]] = [THRESHOLDS[upper - 1], THRESHOLDS[upper]];
  return p0 * (p1 / p0) ** ((zoom - z0) / (z1 - z0));
}
const weight = (kind) => (kind === 'L' ? 1.5 : kind === 'O' ? 0.6 : 1);
const ORTSTEIL_ZOOM = 9;
// Fewer than this many names in view: smaller places follow, as long as there is room (a rural Kreis, a small Land)
const minLabels = (zoom) => (zoom >= 9.5 ? 16 : 8);
const MAX_LABELS = 60;
const SMALLER_CANDIDATES = 300;

// Type sizes, from the largest cities down to the Ortsteile; r: radius of the dot
const TIERS = [
  { weight: 700, size: 12.5, r: 3.5 },
  { weight: 650, size: 12, r: 3 },
  { weight: 600, size: 11.5, r: 2.5 },
  { weight: 550, size: 11, r: 2 },
  { weight: 500, size: 10.5, r: 1.75, italic: true },
];
function tierOf(kind, population) {
  if (kind === 'L' || population >= 500000) return 0;
  if (population >= 100000) return 1;
  if (kind === 'S' || population >= 20000) return 2;
  return kind === 'O' ? 4 : 3;
}
const POSITIONS = ['right', 'left', 'top', 'bottom'];
// Names of countries and seas around Germany (basemap labels): in capitals, letter-spaced, without a dot
const AREA_STYLE = { country: { weight: 600, size: 10.5, spacing: 1.2, upper: true }, sea: { weight: 500, size: 12, italic: true, spacing: 0.6 } };
// Things on top of the map that names must not run under
const OVERLAYS = '.leaflet-control, .map-legend, .map-chip';

// Text widths, measured once per font and name
const canvas = typeof document !== 'undefined' ? document.createElement('canvas').getContext('2d') : null;
const widths = new Map();
function textWidth(text, font, spacing = 0) {
  const key = `${font}|${spacing}|${text}`;
  if (!widths.has(key)) {
    canvas.font = font;
    widths.set(key, canvas.measureText(text).width + spacing * text.length);
  }
  return widths.get(key);
}

function iconFor(html, className) {
  return L.divIcon({ className, html, iconSize: [0, 0] });
}

/**
 * The names of the places on the map, as many as fit at the zoom, the larger first (lib/labelPlacement.js).
 * scope: the key the places must start with: '' for Germany, a Land (2 digits) or Kreis (5) – in the view of a Land or
 *        Kreis, the map names only its places
 * lands: [{ ags, bounds }] of the Länder, to load the smaller places of those in view
 * areas: names of countries and seas ({ name, kind, rank, lon, lat }), shown outside the view of a Land or Kreis
 * revision: changes when something on top of the map may have changed (legend, chips), to place the names anew
 */
export default function PlaceLabels({ scope = '', lands, areas, revision }) {
  const map = useMap();
  const [files, setFiles] = useState(() => new Map()); // url -> rows
  const loading = useRef(new Set());
  const layer = useRef(null);
  const markers = useRef(new Map()); // id -> { marker, position }

  const load = useCallback((url) => {
    if (loading.current.has(url)) return;
    loading.current.add(url);
    loadJson(url).then(
      (rows) => setFiles((prev) => new Map(prev).set(url, rows)),
      () => loading.current.delete(url),
    );
  }, []);
  useEffect(() => load(BASE), [load]);

  // All places loaded so far, the most important first
  const places = useMemo(() => {
    const all = [...files.values()].flat();
    return all
      .map(([name, lon, lat, population, ags, kind]) => ({
        id: `${ags}|${name}|${lon}|${lat}`,
        name,
        lon,
        lat,
        population,
        ags,
        kind,
        priority: population * weight(kind),
        tier: tierOf(kind, population),
      }))
      .sort((a, b) => b.priority - a.priority);
  }, [files]);

  useEffect(() => {
    const group = L.layerGroup([], { pane: 'places' }).addTo(map);
    layer.current = group;
    const shown = markers.current;
    return () => {
      group.remove();
      shown.clear();
    };
  }, [map]);

  const update = useCallback(() => {
    const group = layer.current;
    if (!group) return;
    const zoom = map.getZoom();
    const view = map.getBounds();

    // The smaller places of the Länder in view, once the map is close enough (or shows a single Kreis)
    if (lands && (zoom >= LAND_ZOOM || scope.length === 5)) {
      for (const land of lands) {
        if ((!scope || land.ags === scope.slice(0, 2)) && land.bounds.intersects(view)) load(landFile(land.ags));
      }
    }

    const container = map.getContainer();
    const family = getComputedStyle(container).fontFamily;
    const origin = container.getBoundingClientRect();
    const obstacles = [...(container.closest('.map-frame') ?? container).querySelectorAll(OVERLAYS)]
      .map((element) => element.getBoundingClientRect())
      .filter((rect) => rect.width && rect.height)
      .map((rect) => [rect.left - origin.left, rect.top - origin.top, rect.right - origin.left, rect.bottom - origin.top]);
    const size = map.getSize();
    const padded = view.pad(0.02);

    const candidates = [];
    if (!scope && areas) {
      for (const area of areas) {
        if ((area.kind === 'country' && (zoom < area.rank - 1 || zoom > 9)) || !padded.contains([area.lat, area.lon])) continue;
        const style = AREA_STYLE[area.kind];
        const text = style.upper ? area.name.toUpperCase() : area.name;
        const font = `${style.italic ? 'italic ' : ''}${style.weight} ${style.size}px ${family}`;
        const { x, y } = map.latLngToContainerPoint([area.lat, area.lon]);
        candidates.push({ id: `area|${area.name}`, area, text, x, y, w: textWidth(text, font, style.spacing), h: style.size + 2, r: 0, positions: ['center'] });
      }
    }
    // Every place in view above the threshold, then the largest of the smaller ones, for views with too few names
    const threshold = minPopulation(zoom);
    let smaller = 0;
    for (const place of places) {
      if (!place.ags.startsWith(scope) || (place.kind === 'O' && zoom < ORTSTEIL_ZOOM) || !padded.contains([place.lat, place.lon])) continue;
      if (place.priority < threshold && (smaller += 1) > SMALLER_CANDIDATES) break;
      const tier = TIERS[place.tier];
      const font = `${tier.italic ? 'italic ' : ''}${tier.weight} ${tier.size}px ${family}`;
      const { x, y } = map.latLngToContainerPoint([place.lat, place.lon]);
      candidates.push({ id: place.id, place, x, y, w: textWidth(place.name, font), h: tier.size + 2, r: tier.r, positions: POSITIONS });
    }

    const placed = placeLabels(
      candidates,
      { width: size.x, height: size.y, obstacles },
      { mx: 14, my: 7, gap: 4 },
      (c, count) => count < MAX_LABELS && (!c.place || c.place.priority >= threshold || count < minLabels(zoom)),
    );

    // Keep the markers of names that stay, so they don't flicker; new ones fade in (CSS)
    const byId = new Map(candidates.map((c) => [c.id, c]));
    const next = new Map(placed.map((p) => [p.id, p.position]));
    for (const [id, entry] of markers.current) {
      if (!next.has(id)) {
        group.removeLayer(entry.marker);
        markers.current.delete(id);
      }
    }
    for (const [id, position] of next) {
      const c = byId.get(id);
      const entry = markers.current.get(id);
      if (entry && entry.position === position) continue;
      const html = c.area
        ? `<span class="place__name">${escapeHtml(c.text)}</span>`
        : `<span class="place__dot"></span><span class="place__name">${escapeHtml(c.place.name)}</span>`;
      const className = c.area ? `place place--${c.area.kind}` : `place place--t${c.place.tier} place--${position}`;
      if (entry) {
        entry.marker.setIcon(iconFor(html, className));
        entry.position = position;
      } else {
        const latLng = c.area ? [c.area.lat, c.area.lon] : [c.place.lat, c.place.lon];
        const marker = L.marker(latLng, { icon: iconFor(html, className), interactive: false, keyboard: false, pane: 'places' });
        group.addLayer(marker);
        markers.current.set(id, { marker, position });
      }
    }
  }, [map, places, scope, lands, areas, load]);

  useEffect(() => {
    update();
    map.on('moveend zoomend resize', update);
    return () => map.off('moveend zoomend resize', update);
  }, [map, update, revision]);

  return null;
}
