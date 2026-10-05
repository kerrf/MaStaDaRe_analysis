import { useCallback, useEffect, useMemo, useRef } from 'react';
import { GeoJSON, MapContainer, Pane, Polygon, Tooltip, useMap } from 'react-leaflet';
import L from 'leaflet';
import { ZoomOut } from 'lucide-react';
import 'leaflet/dist/leaflet.css';
import { STATES_TOPOLOGY } from '../../config/dashboards';
import { EUROPE_BOUNDS, GERMANY_BOUNDS, OFFSHORE } from '../../config/regions';
import { useLayers, useOpenEdge } from '../../lib/data';
import HeatmapLayer from './HeatmapLayer';
import PlaceLabels from './PlaceLabels';

// Colours as in styles/tokens.css (--map-*): the canvas can't read CSS variables
const NODATA_FILL = '#d3d8df';
// Areas that carry no values (plant icons on top, borders only, no data yet) look like a plain map instead of "Keine Daten".
const NEUTRAL_STYLE = { fillColor: '#f3efe7', fillOpacity: 1, color: '#aab2be', opacity: 1 };
const MASK_STYLE = { stroke: false, fillColor: '#f6f7f9', fillOpacity: 0.85 };
// Europe around Germany (scripts/geo/build_basemap.py): plain grey land on the blue of the sea, white borders
const BASEMAP = '/basemap_europe.topojson';
const LAND_STYLE = { stroke: false, fillColor: '#eceef1', fillOpacity: 1 };
const BORDER_STYLE = { color: '#ffffff', weight: 1.2, opacity: 1 };
// The German sea (offshore wind) is a zone at sea: hatched in its colour, the water showing through, without a border
// along the coast; out at sea, a dashed line marks where it ends. The choropleth only keeps it for tooltip and click.
const SEA_HIDDEN = { fillOpacity: 0, weight: 0 };
const SEA_EDGE_STYLE = { fill: false, color: '#3d6fa8', weight: 1.4, opacity: 0.9, dashArray: '5 4' };
const MIN_ZOOM = 5;

// The hatching of the sea in its colour: diagonal stripes on a light tint of it, the water showing through. A pattern
// on the canvas, like the areas, so the map exports keep it in place.
function hatchOf(color) {
  const size = 8;
  const tile = document.createElement('canvas');
  tile.width = size;
  tile.height = size;
  const ctx = tile.getContext('2d');
  ctx.fillStyle = color;
  ctx.globalAlpha = 0.3;
  ctx.fillRect(0, 0, size, size);
  ctx.globalAlpha = 1;
  ctx.strokeStyle = color;
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  for (const offset of [-size, 0, size]) {
    ctx.moveTo(offset, size);
    ctx.lineTo(offset + size, 0);
  }
  ctx.stroke();
  return ctx.createPattern(tile, 'repeat');
}

const WORLD_RING = [
  [-85, -180],
  [-85, 180],
  [85, 180],
  [85, -180],
];

function ringsOf(geometry) {
  if (!geometry) return [];
  const polygons = geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.type === 'MultiPolygon' ? geometry.coordinates : [];
  return polygons.flatMap((polygon) => polygon.map((ring) => ring.map(([lng, lat]) => [lat, lng])));
}

function ViewController({ focusFeature, homeBounds }) {
  const map = useMap();
  const firstRun = useRef(true);

  useEffect(() => {
    const bounds = focusFeature ? L.geoJSON(focusFeature).getBounds() : L.latLngBounds(homeBounds);
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const options = { padding: [28, 28] };
    if (firstRun.current || reduceMotion) map.fitBounds(bounds, options);
    else map.flyToBounds(bounds, { ...options, duration: 0.6 });
    firstRun.current = false;
  }, [map, focusFeature, homeBounds]);

  return null;
}

// Keeps the map in its frame: after a resize, and so far out that Europe always fills it (the map ends at its edges)
function SizeWatcher() {
  const map = useMap();
  useEffect(() => {
    const fit = () => {
      map.invalidateSize({ animate: false });
      map.setMinZoom(Math.max(MIN_ZOOM, Math.ceil(map.getBoundsZoom(EUROPE_BOUNDS, true) * 4) / 4));
    };
    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(map.getContainer());
    return () => observer.disconnect();
  }, [map]);
  return null;
}

// Page scroll stays page scroll; Ctrl/⌘ + wheel zooms the map. Also the map of the Landkreis/Gemeinde page.
export function WheelHandler({ onPlainWheel }) {
  const map = useMap();
  useEffect(() => {
    map.scrollWheelZoom.disable();
    const container = map.getContainer();
    const handleWheel = (e) => {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        if (e.deltaY < 0) map.zoomIn();
        else map.zoomOut();
      } else {
        onPlainWheel?.();
      }
    };
    container.addEventListener('wheel', handleWheel, { passive: false });
    return () => container.removeEventListener('wheel', handleWheel);
  }, [map, onPlainWheel]);
  return null;
}

function ChoroplethLayer({ geo, valueKey, colorFor, neutral, lineWeight, tooltipFor, onRegionClick }) {
  const layerRef = useRef(null);
  // Leaflet binds the handlers once per layer. Read the latest ones through a ref, so a new scope (another Land, a
  // Landkreis) that keeps the same layer doesn't click and label with the old one.
  const handlers = useRef({ tooltipFor, onRegionClick });
  useEffect(() => {
    handlers.current = { tooltipFor, onRegionClick };
  }, [tooltipFor, onRegionClick]);

  const styleFor = useCallback(
    (feature) => {
      if (neutral) return { ...NEUTRAL_STYLE, weight: lineWeight };
      return {
        fillColor: feature.properties._hasData ? colorFor(feature.properties[valueKey] ?? 0) : NODATA_FILL,
        fillOpacity: 1,
        color: '#ffffff',
        weight: lineWeight,
        opacity: 0.9,
        ...(feature.properties.ags === OFFSHORE.ags && SEA_HIDDEN),
      };
    },
    [neutral, colorFor, valueKey, lineWeight],
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
        e.target.setStyle({ weight: 2, color: '#101828', opacity: 1 });
        e.target.bringToFront();
      },
      mouseout: (e) => layerRef.current?.resetStyle(e.target),
      click: () => handlers.current.onRegionClick?.(feature),
    });
  }, []);

  return <GeoJSON ref={layerRef} data={geo} style={styleFor} onEachFeature={onEachFeature} />;
}

export default function ChoroplethMap({
  mode = 'choropleth',
  geo,
  layerKey,
  valueKey,
  colorFor,
  neutral = false,
  lineWeight = 0.5,
  tooltipFor,
  outlines,
  showOutlines,
  focusFeature,
  homeBounds = GERMANY_BOUNDS,
  focusColor,
  onExitFocus,
  exitHint,
  onRegionClick,
  highlight,
  heat,
  onPlainWheel,
  children,
}) {
  const maskPositions = useMemo(
    () => (focusFeature ? [WORLD_RING, ...ringsOf(focusFeature.geometry)] : null),
    [focusFeature],
  );
  const sea = mode === 'choropleth' && !neutral ? geo?.features.find((f) => f.properties.ags === OFFSHORE.ags) ?? null : null;
  const seaColor = sea && (sea.properties._hasData ? colorFor(sea.properties[valueKey] ?? 0) : NODATA_FILL);
  const seaEdge = useOpenEdge(sea ? STATES_TOPOLOGY : null, OFFSHORE.ags);
  const seaStyle = useMemo(() => seaColor && { stroke: false, fillColor: hatchOf(seaColor), fillOpacity: 1 }, [seaColor]);
  const basemap = useLayers(BASEMAP);
  // Names of countries and seas; the Land or Kreis in view, whose places the map names
  const areas = useMemo(
    () =>
      basemap.data?.labels.features.map((f) => ({ ...f.properties, lon: f.geometry.coordinates[0], lat: f.geometry.coordinates[1] })) ??
      null,
    [basemap.data],
  );
  const focusAgs = focusFeature?.properties.ags ?? '';
  const focusBounds = useMemo(() => (focusFeature ? L.geoJSON(focusFeature).getBounds() : null), [focusFeature]);

  // The focus layers are drawn as SVG (the rest of the map is canvas): an SVG path only catches the pointer
  // where it is painted, so the mask takes clicks outside the focused Land or Kreis while the hole passes them
  // through to the choropleth below. A canvas would swallow every event on top of the map.
  const focusRenderer = useMemo(() => L.svg({ pane: 'focus' }), []);
  const exitHandlers = useMemo(() => ({ click: () => onExitFocus?.() }), [onExitFocus]);

  return (
    <MapContainer
      className="map-canvas"
      bounds={homeBounds}
      boundsOptions={{ padding: [28, 28] }}
      preferCanvas
      zoomSnap={0.25}
      minZoom={MIN_ZOOM}
      maxZoom={12}
      maxBounds={EUROPE_BOUNDS}
      maxBoundsViscosity={1}
      scrollWheelZoom={false}
      attributionControl={false}
    >
      <SizeWatcher />
      <WheelHandler onPlainWheel={onPlainWheel} />
      <ViewController focusFeature={focusFeature} homeBounds={homeBounds} />

      {basemap.data && (
        <Pane name="basemap" style={{ zIndex: 250, pointerEvents: 'none' }}>
          <GeoJSON data={basemap.data.land} interactive={false} style={LAND_STYLE} />
          <GeoJSON data={basemap.data.borders} interactive={false} style={BORDER_STYLE} />
        </Pane>
      )}

      {/* heat: { data, ramp, onDrawn, onHover } (HeatmapLayer) */}
      {mode === 'heatmap' && heat?.data && <HeatmapLayer {...heat} />}

      {mode === 'choropleth' && geo && (
        <ChoroplethLayer
          key={layerKey}
          geo={geo}
          valueKey={valueKey}
          colorFor={colorFor}
          neutral={neutral}
          lineWeight={lineWeight}
          tooltipFor={tooltipFor}
          onRegionClick={onRegionClick}
        />
      )}

      {outlines && (showOutlines || mode === 'heatmap') && (
        <Pane name="outlines" style={{ zIndex: 420, pointerEvents: 'none' }}>
          <GeoJSON data={outlines} interactive={false} style={{ fill: false, color: '#344054', weight: 1, opacity: 0.55 }} />
        </Pane>
      )}

      {sea && (
        <Pane name="sea-fill" style={{ zIndex: 405, pointerEvents: 'none' }}>
          <GeoJSON key={`sea-${layerKey}-${seaColor}`} data={sea} interactive={false} style={seaStyle} />
        </Pane>
      )}
      {sea && seaEdge.data && (
        <Pane name="sea" style={{ zIndex: 425, pointerEvents: 'none' }}>
          <GeoJSON key={`sea-edge-${layerKey}`} data={seaEdge.data} interactive={false} style={SEA_EDGE_STYLE} />
        </Pane>
      )}

      {/* Always mounted: the SVG renderer lives inside this pane for the lifetime of the map. */}
      <Pane name="focus" style={{ zIndex: 430, pointerEvents: 'none' }}>
        {focusFeature && (
          <>
            <Polygon
              key={`mask-${focusFeature.properties.ags}`}
              positions={maskPositions}
              renderer={focusRenderer}
              className="map-focus-mask"
              interactive={Boolean(onExitFocus)}
              pathOptions={MASK_STYLE}
              eventHandlers={exitHandlers}
            >
              {/* Explicit pane: inside <Pane> the tooltip would inherit "focus" and end up below the mask. */}
              {onExitFocus && (
                <Tooltip pane="tooltipPane" sticky direction="top" offset={[0, -10]} opacity={1} className="map-exit-hint">
                  <ZoomOut size={14} aria-hidden="true" />
                  {exitHint}
                </Tooltip>
              )}
            </Polygon>
            <GeoJSON
              key={`outline-${focusFeature.properties.ags}`}
              data={focusFeature}
              renderer={focusRenderer}
              interactive={false}
              style={{ fill: false, color: focusColor, weight: 2.5, opacity: 1 }}
            />
          </>
        )}
        {/* An area picked on the map (its analyses below it): outlined, on top of its neighbours */}
        {highlight && (
          <GeoJSON
            key={`pick-${highlight.properties._key}`}
            data={highlight}
            renderer={focusRenderer}
            interactive={false}
            style={{ fill: false, color: '#101828', weight: 2.5, opacity: 1 }}
          />
        )}
      </Pane>

      {/* Above the areas and the mask, below the plant icons and tooltips */}
      <Pane name="places" style={{ zIndex: 450, pointerEvents: 'none' }} />
      <PlaceLabels scope={focusAgs} scopeBounds={focusBounds} areas={areas} revision={layerKey} />
      {children}
    </MapContainer>
  );
}
