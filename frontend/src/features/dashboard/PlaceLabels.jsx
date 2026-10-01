import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useMap } from 'react-leaflet';
import L from 'leaflet';
import { loadJson } from '../../lib/data';
import { escapeHtml } from '../../lib/format';
import { placeLabels } from '../../lib/labelPlacement';

// Place names of the map (scripts/geo/build_places.py): Gemeinden as rows of [name, lon, lat, population, ags, kind],
// kind L Landeshauptstadt, S Stadt, G Gemeinde
const PLACES = '/places.json';

// Three layers of names, one per view: the big cities of Germany, the larger towns of a Land, the main towns of a Kreis.
// The names of a Land or Kreis are chosen once, at the zoom that shows it whole: the largest that fit there without
// touching, at most `most`. Zooming in or out moves them, it adds none.
const GERMANY_MIN_POPULATION = 500000;
const LAYERS = { 0: { id: 'deutschland' }, 2: { id: 'land', most: 8 }, 5: { id: 'kreis', most: 4 } };
// Landeshauptstädte count half again as much (Stuttgart before Mannheim), whatever their size
const weight = (kind) => (kind === 'L' ? 1.5 : 1);
const FIT_PADDING = L.point(56, 56); // the padding the map fits a Land or Kreis with (28 px on each side)
const SPACING = { mx: 14, my: 7, gap: 4 };

// Type sizes, from the largest cities down; r: radius of the dot. Every name dark: the layers keep the map calm.
const TIERS = [
  { weight: 700, size: 12.5, r: 3.5 },
  { weight: 650, size: 12, r: 3 },
  { weight: 600, size: 11.5, r: 2.5 },
];
const tierOf = (kind, population) => (kind === 'L' || population >= 500000 ? 0 : population >= 100000 ? 1 : 2);
const POSITIONS = ['right', 'left', 'top', 'bottom'];
// Names of countries and seas around Germany (basemap labels): in capitals, letter-spaced, without a dot
const AREA_STYLE = { country: { weight: 600, size: 10.5, spacing: 1.2, upper: true }, sea: { weight: 500, size: 12, italic: true, spacing: 0.6 } };
// Things on top of the map that names must not run under
const OVERLAYS = '.leaflet-control, .map-legend, .map-chip, .map-scope';

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
const fontOf = (style, family) => `${style.italic ? 'italic ' : ''}${style.weight} ${style.size}px ${family}`;

function iconFor(html, className) {
  return L.divIcon({ className, html, iconSize: [0, 0] });
}

/**
 * The names of the places on the map, in the layer of the view (Germany, a Land, a Kreis), placed so that none touch
 * (lib/labelPlacement.js) and none run under the legend or the controls.
 * scope:       the view: '' for Germany, the key of a Land (2 digits) or Kreis (5); in the view of a Land or Kreis, only
 *              its places are named
 * scopeBounds: the bounds of that Land or Kreis, to choose its names at the zoom that shows it whole
 * areas:       names of countries and seas ({ name, kind, rank, lon, lat }), shown in the view of Germany
 * revision:    changes when something on top of the map may have changed (legend, chips), to place the names anew
 */
export default function PlaceLabels({ scope = '', scopeBounds, areas, revision }) {
  const map = useMap();
  const [rows, setRows] = useState(null);
  const layer = useRef(null);
  const markers = useRef(new Map()); // id -> { marker, position }
  const chosen = useRef({ key: null, places: [] }); // the names of the current Land or Kreis

  useEffect(() => {
    let cancelled = false;
    loadJson(PLACES).then(
      (data) => !cancelled && setRows(data),
      () => {},
    );
    return () => {
      cancelled = true;
    };
  }, []);

  // Every place, the most important first, with its type size
  const places = useMemo(
    () =>
      (rows ?? [])
        .map(([name, lon, lat, population, ags, kind]) => ({
          id: ags,
          name,
          lon,
          lat,
          population,
          ags,
          kind,
          priority: population * weight(kind),
          tier: tierOf(kind, population),
        }))
        .sort((a, b) => b.priority - a.priority),
    [rows],
  );

  useEffect(() => {
    const group = L.layerGroup().addTo(map);
    layer.current = group;
    const shown = markers.current;
    return () => {
      group.remove();
      shown.clear();
    };
  }, [map]);

  // The names of the layer of the view: Germany's big cities, or those a Land or Kreis shows at the zoom that fits it
  const layerPlaces = useCallback(
    (family) => {
      const { most } = LAYERS[scope.length] ?? LAYERS[0];
      if (!most) return places.filter((p) => p.population >= GERMANY_MIN_POPULATION);
      if (!scopeBounds) return [];
      const zoom = map.getBoundsZoom(scopeBounds, false, FIT_PADDING);
      const key = `${scope}|${zoom}|${places.length}`;
      if (chosen.current.key !== key) {
        const candidates = places
          .filter((p) => p.ags.startsWith(scope))
          .map((place) => {
            const tier = TIERS[place.tier];
            const { x, y } = map.project([place.lat, place.lon], zoom);
            return { id: place.id, place, x, y, w: textWidth(place.name, fontOf(tier, family)), h: tier.size + 2, r: tier.r, positions: POSITIONS };
          });
        const placed = placeLabels(candidates, { width: Infinity, height: Infinity }, { ...SPACING, edge: -Infinity }, (c, count) => count < most);
        const ids = new Set(placed.map((p) => p.id));
        chosen.current = { key, places: places.filter((p) => ids.has(p.id)) };
      }
      return chosen.current.places;
    },
    [map, places, scope, scopeBounds],
  );

  const update = useCallback(() => {
    const group = layer.current;
    if (!group || !places.length) return;
    const zoom = map.getZoom();
    const container = map.getContainer();
    const family = getComputedStyle(container).fontFamily;
    const origin = container.getBoundingClientRect();
    const obstacles = [...(container.closest('.map-frame') ?? container).querySelectorAll(OVERLAYS)]
      .map((element) => element.getBoundingClientRect())
      .filter((rect) => rect.width && rect.height)
      .map((rect) => [rect.left - origin.left, rect.top - origin.top, rect.right - origin.left, rect.bottom - origin.top]);
    const size = map.getSize();
    const view = map.getBounds().pad(0.02);

    const candidates = [];
    if (!scope && areas) {
      for (const area of areas) {
        if ((area.kind === 'country' && (zoom < area.rank - 1 || zoom > 9)) || !view.contains([area.lat, area.lon])) continue;
        const style = AREA_STYLE[area.kind];
        const text = style.upper ? area.name.toUpperCase() : area.name;
        const { x, y } = map.latLngToContainerPoint([area.lat, area.lon]);
        candidates.push({ id: `area|${area.name}`, area, text, x, y, w: textWidth(text, fontOf(style, family), style.spacing), h: style.size + 2, r: 0, positions: ['center'] });
      }
    }
    for (const place of layerPlaces(family)) {
      if (!view.contains([place.lat, place.lon])) continue;
      const tier = TIERS[place.tier];
      const { x, y } = map.latLngToContainerPoint([place.lat, place.lon]);
      candidates.push({ id: place.id, place, x, y, w: textWidth(place.name, fontOf(tier, family)), h: tier.size + 2, r: tier.r, positions: POSITIONS });
    }
    const placed = placeLabels(candidates, { width: size.x, height: size.y, obstacles }, SPACING);

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
  }, [map, places, scope, areas, layerPlaces]);

  useEffect(() => {
    update();
    map.on('moveend zoomend resize', update);
    return () => map.off('moveend zoomend resize', update);
  }, [map, update, revision]);

  return null;
}
