import { useCallback, useEffect, useMemo, useRef } from 'react';
import { GeoJSON, MapContainer, Pane, Polygon, TileLayer, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { BASEMAPS, tileAt } from '../../config/basemaps';
import { EUROPE_BOUNDS } from '../../config/regions';
import { useLayers } from '../../lib/data';
import { escapeHtml } from '../../lib/format';
import { placeLabels } from '../../lib/labelPlacement';
import { WheelHandler } from './ChoroplethMap';

// Europe around Germany (scripts/geo/build_basemap.py), under the tiles: basemap.de ends at the German border
const EUROPE = '/basemap_europe.topojson';
const LAND_STYLE = { stroke: false, fillColor: '#eceef1', fillOpacity: 1 };
const BORDER_STYLE = { color: '#ffffff', weight: 1.2, opacity: 1 };
const NODATA_FILL = '#d3d8df';
// Outside the Kreis a light veil: its surroundings stay readable, the Kreis stands out
const VEIL_STYLE = { stroke: false, fillColor: '#ffffff', fillOpacity: 0.45 };
const WORLD_RING = [
  [-85, -180],
  [-85, 180],
  [85, 180],
  [85, -180],
];
// Names of the Gemeinden: 12px, measured once per name
const LABEL_FONT = '600 12px Inter Variable, Inter, system-ui, sans-serif';
const OVERLAYS = '.leaflet-control, .map-legend, .basemap-switch, .map-scope';

const canvas = typeof document !== 'undefined' ? document.createElement('canvas').getContext('2d') : null;
const widths = new Map();
function textWidth(text) {
  if (!widths.has(text)) {
    canvas.font = LABEL_FONT;
    widths.set(text, canvas.measureText(text).width);
  }
  return widths.get(text);
}

function ringsOf(geometry) {
  if (!geometry) return [];
  const polygons = geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.type === 'MultiPolygon' ? geometry.coordinates : [];
  return polygons.flatMap((polygon) => polygon.map((ring) => ring.map(([lng, lat]) => [lat, lng])));
}

// Shows the whole Kreis whenever it changes, and keeps the map in its frame after a resize
function FitKreis({ bounds }) {
  const map = useMap();
  useEffect(() => {
    if (bounds) map.fitBounds(bounds, { padding: [24, 24] });
  }, [map, bounds]);
  useEffect(() => {
    const observer = new ResizeObserver(() => map.invalidateSize({ animate: false }));
    observer.observe(map.getContainer());
    return () => observer.disconnect();
  }, [map]);
  return null;
}

// Metric scale bar, bottom left
function ScaleBar() {
  const map = useMap();
  useEffect(() => {
    const control = L.control.scale({ imperial: false, position: 'bottomleft', maxWidth: 120 }).addTo(map);
    return () => control.remove();
  }, [map]);
  return null;
}

// The names of the Gemeinden at their label points: the largest first, as many as fit without touching each other or
// the legend and controls; zooming in names more of them
function GemeindeNames({ labels, selected }) {
  const map = useMap();
  const group = useRef(null);

  const update = useCallback(() => {
    if (!group.current) return;
    group.current.clearLayers();
    const container = map.getContainer();
    const origin = container.getBoundingClientRect();
    const obstacles = [...(container.closest('.map-frame') ?? container).querySelectorAll(OVERLAYS)]
      .map((element) => element.getBoundingClientRect())
      .filter((rect) => rect.width && rect.height)
      .map((rect) => [rect.left - origin.left, rect.top - origin.top, rect.right - origin.left, rect.bottom - origin.top]);
    const size = map.getSize();
    const candidates = labels.map((label) => {
      const { x, y } = map.latLngToContainerPoint([label.lat, label.lon]);
      return { id: label.ags, label, x, y, w: textWidth(label.name) + 4, h: 15, r: 0, positions: ['center'] };
    });
    // The picked Gemeinde first: its name always shows
    candidates.sort((a, b) => (b.id === selected) - (a.id === selected));
    const placed = new Set(placeLabels(candidates, { width: size.x, height: size.y, obstacles }, { mx: 6, my: 3 }).map((p) => p.id));
    for (const c of candidates) {
      if (!placed.has(c.id)) continue;
      const icon = L.divIcon({
        className: `gemeinde-label${c.id === selected ? ' is-selected' : ''}`,
        html: `<span>${escapeHtml(c.label.name)}</span>`,
        iconSize: [0, 0],
      });
      L.marker([c.label.lat, c.label.lon], { icon, interactive: false, keyboard: false, pane: 'gemeinde-names' }).addTo(group.current);
    }
  }, [map, labels, selected]);

  useEffect(() => {
    group.current = L.layerGroup().addTo(map);
    return () => {
      group.current.remove();
      group.current = null;
    };
  }, [map]);
  useEffect(() => {
    update();
    map.on('moveend zoomend resize', update);
    return () => map.off('moveend zoomend resize', update);
  }, [map, update]);
  return null;
}

/**
 * The Gemeinden of a Landkreis on a background map (config/basemaps.js), shaded by a value, with their names.
 *
 * gemeinden:  FeatureCollection of the Kreis's Gemeinden; properties: ags, name, _hasData, and the value (valueKey)
 * kreis:      the Kreis's feature (its outline); neighbours: the Kreise around it (thin outlines)
 * labels:     [{ ags, name, lon, lat }] where to write each Gemeinde's name, the most important first
 * selected:   key of the picked Gemeinde (outlined, its name always shown); onSelect(ags | null) on a click
 * dataKey:    changes with the values (another figure, Anlagenart, Leistung): the shading is drawn anew
 * basemap:    id of the background map; opacity: of the shading (0..1)
 */
export default function KommuneMap({
  gemeinden,
  dataKey,
  kreis,
  neighbours,
  labels,
  valueKey,
  colorFor,
  selected,
  onSelect,
  tooltipFor,
  basemap,
  opacity,
  onBasemap,
  children,
}) {
  const europe = useLayers(EUROPE);
  const tiles = BASEMAPS.find((b) => b.id === basemap) ?? BASEMAPS[0];
  const bounds = useMemo(() => (kreis ? L.geoJSON(kreis).getBounds() : null), [kreis]);
  const veil = useMemo(() => (kreis ? [WORLD_RING, ...ringsOf(kreis.geometry)] : null), [kreis]);
  const selectedFeature = useMemo(() => gemeinden?.features.find((f) => f.properties.ags === selected) ?? null, [gemeinden, selected]);
  const centre = bounds?.getCenter();
  const onLight = tiles.id !== 'satellit';

  // Leaflet binds the handlers once per layer: read the latest ones through a ref
  const handlers = useRef({ tooltipFor, onSelect, selected });
  useEffect(() => {
    handlers.current = { tooltipFor, onSelect, selected };
  }, [tooltipFor, onSelect, selected]);
  const layerRef = useRef(null);

  const styleFor = useCallback(
    (feature) => ({
      fillColor: feature.properties._hasData ? colorFor(feature.properties[valueKey] ?? 0) : NODATA_FILL,
      fillOpacity: opacity,
      color: onLight ? '#ffffff' : '#f2f4f7',
      weight: 1.2,
      opacity: 0.95,
    }),
    [colorFor, valueKey, opacity, onLight],
  );
  const onEachFeature = useCallback((feature, layer) => {
    layer.bindTooltip(() => handlers.current.tooltipFor(feature), {
      sticky: true,
      direction: 'top',
      offset: [0, -8],
      opacity: 1,
      className: 'map-tooltip',
    });
    layer.on({
      mouseover: (e) => {
        e.target.setStyle({ weight: 2.5, color: '#101828' });
        e.target.bringToFront();
      },
      mouseout: (e) => layerRef.current?.resetStyle(e.target),
      click: () => {
        const { ags } = feature.properties;
        handlers.current.onSelect(handlers.current.selected === ags ? null : ags);
      },
    });
  }, []);

  return (
    <>
      <MapContainer
        className="map-canvas kommune-map"
        bounds={bounds ?? EUROPE_BOUNDS}
        boundsOptions={{ padding: [24, 24] }}
        zoomSnap={0.25}
        minZoom={6}
        maxZoom={16}
        maxBounds={EUROPE_BOUNDS}
        maxBoundsViscosity={1}
        scrollWheelZoom={false}
      >
        <FitKreis bounds={bounds} />
        <WheelHandler />
        <ScaleBar />

        {europe.data && (
          <Pane name="europe" style={{ zIndex: 150, pointerEvents: 'none' }}>
            <GeoJSON data={europe.data.land} interactive={false} style={LAND_STYLE} />
            <GeoJSON data={europe.data.borders} interactive={false} style={BORDER_STYLE} />
          </Pane>
        )}
        {tiles.url && (
          <TileLayer
            key={tiles.id}
            url={tiles.url}
            attribution={`<a href="${tiles.link}" target="_blank" rel="noopener noreferrer">${escapeHtml(tiles.attribution)}</a>`}
            maxZoom={16}
            crossOrigin
          />
        )}

        {gemeinden && (
          // Leaflet's resetStyle (after a hover) goes back to the style the layer was made with: a new one for each
          <GeoJSON
            key={`${dataKey}-${tiles.id}-${opacity}`}
            ref={layerRef}
            data={gemeinden}
            style={styleFor}
            onEachFeature={onEachFeature}
          />
        )}

        <Pane name="kreis" style={{ zIndex: 420, pointerEvents: 'none' }}>
          {veil && <Polygon key={`veil-${kreis.properties.ags}`} positions={veil} interactive={false} pathOptions={VEIL_STYLE} />}
          {neighbours && (
            <GeoJSON key={`neighbours-${kreis?.properties.ags}`} data={neighbours} interactive={false} style={{ fill: false, color: '#667085', weight: 1, opacity: 0.6, dashArray: '4 3' }} />
          )}
          {kreis && <GeoJSON key={`kreis-${kreis.properties.ags}`} data={kreis} interactive={false} style={{ fill: false, color: '#9a4700', weight: 3, opacity: 1 }} />}
          {selectedFeature && (
            <GeoJSON key={`selected-${selected}`} data={selectedFeature} interactive={false} style={{ fill: false, color: '#101828', weight: 3, opacity: 1 }} />
          )}
        </Pane>

        <Pane name="gemeinde-names" style={{ zIndex: 450, pointerEvents: 'none' }} />
        {labels && <GemeindeNames labels={labels} selected={selected} />}
      </MapContainer>

      {/* The background map: a picture of each at the Kreis, like the switch of a map app */}
      <div className="basemap-switch" role="radiogroup" aria-label="Hintergrundkarte">
        {BASEMAPS.map((b) => {
          const thumbnail = centre ? tileAt(b, centre.lat, centre.lng, 11) : null;
          const active = b.id === tiles.id;
          return (
            <button key={b.id} type="button" role="radio" aria-checked={active} className={`basemap-switch__option${active ? ' is-active' : ''}`} onClick={() => onBasemap(b.id)}>
              <span className={`basemap-switch__thumb basemap-switch__thumb--${b.id}`} style={thumbnail ? { backgroundImage: `url(${thumbnail})` } : undefined} />
              <span className="basemap-switch__label">{b.label}</span>
            </button>
          );
        })}
      </div>
      {children}
    </>
  );
}
