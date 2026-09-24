import { useCallback, useEffect, useMemo, useRef } from 'react';
import { GeoJSON, ImageOverlay, MapContainer, Marker, Pane, Polygon, Tooltip, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { GERMANY_BOUNDS } from '../../config/regions';

// Must match the georeference the backend used when rendering the heatmap PNG.
const HEATMAP_BOUNDS = [
  [47.270111, 5.866315],
  [55.058347, 15.041931],
];

const TOP_CITIES = {
  Berlin: [13.404954, 52.520008],
  Köln: [6.953101, 50.935173],
  Düsseldorf: [6.782048, 51.227144],
  'Frankfurt am Main': [8.682127, 50.110924],
  Hamburg: [9.993682, 53.551086],
  Leipzig: [12.387772, 51.343479],
  München: [11.576124, 48.137154],
  Dortmund: [7.468554, 51.5134],
  Stuttgart: [9.181332, 48.777128],
  Nürnberg: [11.077438, 49.44982],
  Hannover: [9.73322, 52.37052],
};

const CITY_ICON = new L.DivIcon({ className: 'city-dot', html: '<span></span>', iconSize: [8, 8], iconAnchor: [4, 4] });

const NODATA_FILL = '#e4e7ec';
const MASK_FILL = '#f6f7f9';
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

function ViewController({ focusFeature }) {
  const map = useMap();
  const firstRun = useRef(true);

  useEffect(() => {
    const bounds = focusFeature ? L.geoJSON(focusFeature).getBounds() : L.latLngBounds(GERMANY_BOUNDS);
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const options = { padding: [28, 28] };
    if (firstRun.current || reduceMotion) map.fitBounds(bounds, options);
    else map.flyToBounds(bounds, { ...options, duration: 0.6 });
    firstRun.current = false;
  }, [map, focusFeature]);

  return null;
}

function SizeWatcher() {
  const map = useMap();
  useEffect(() => {
    const observer = new ResizeObserver(() => map.invalidateSize({ animate: false }));
    observer.observe(map.getContainer());
    return () => observer.disconnect();
  }, [map]);
  return null;
}

// Page scroll stays page scroll; Ctrl/⌘ + wheel zooms the map.
function WheelHandler({ onPlainWheel }) {
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

function ChoroplethLayer({ geo, valueKey, colorFor, lineWeight, tooltipFor, onRegionClick }) {
  const layerRef = useRef(null);

  const styleFor = useCallback(
    (feature) => ({
      fillColor: feature.properties._hasData ? colorFor(feature.properties[valueKey] ?? 0) : NODATA_FILL,
      fillOpacity: 1,
      color: '#ffffff',
      weight: lineWeight,
      opacity: 0.9,
    }),
    [colorFor, valueKey, lineWeight],
  );

  const onEachFeature = useCallback(
    (feature, layer) => {
      layer.bindTooltip(() => tooltipFor(feature), { sticky: true, direction: 'top', offset: [0, -8], opacity: 1, className: 'map-tooltip' });
      layer.on({
        mouseover: (e) => {
          e.target.setStyle({ weight: 2, color: '#101828', opacity: 1 });
          e.target.bringToFront();
        },
        mouseout: (e) => layerRef.current?.resetStyle(e.target),
        click: () => onRegionClick?.(feature),
      });
    },
    [tooltipFor, onRegionClick],
  );

  return <GeoJSON ref={layerRef} data={geo} style={styleFor} onEachFeature={onEachFeature} />;
}

export default function ChoroplethMap({
  mode = 'choropleth',
  geo,
  layerKey,
  valueKey,
  colorFor,
  lineWeight = 0.5,
  tooltipFor,
  outlines,
  showOutlines,
  focusFeature,
  focusColor,
  onRegionClick,
  heatmapUrl,
  onPlainWheel,
}) {
  const maskPositions = useMemo(
    () => (focusFeature ? [WORLD_RING, ...ringsOf(focusFeature.geometry)] : null),
    [focusFeature],
  );

  return (
    <MapContainer
      className="map-canvas"
      bounds={GERMANY_BOUNDS}
      boundsOptions={{ padding: [28, 28] }}
      preferCanvas
      zoomSnap={0.25}
      minZoom={5}
      maxZoom={12}
      scrollWheelZoom={false}
      attributionControl={false}
    >
      <SizeWatcher />
      <WheelHandler onPlainWheel={onPlainWheel} />
      <ViewController focusFeature={focusFeature} />

      {mode === 'heatmap' && heatmapUrl && <ImageOverlay url={heatmapUrl} bounds={HEATMAP_BOUNDS} opacity={0.9} />}

      {mode === 'choropleth' && geo && (
        <ChoroplethLayer
          key={layerKey}
          geo={geo}
          valueKey={valueKey}
          colorFor={colorFor}
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

      {focusFeature && (
        <Pane name="focus" style={{ zIndex: 430, pointerEvents: 'none' }}>
          <Polygon
            key={`mask-${focusFeature.properties.id}`}
            positions={maskPositions}
            interactive={false}
            pathOptions={{ stroke: false, fillColor: MASK_FILL, fillOpacity: 0.85 }}
          />
          <GeoJSON
            key={`outline-${focusFeature.properties.id}`}
            data={focusFeature}
            interactive={false}
            style={{ fill: false, color: focusColor, weight: 2.5, opacity: 1 }}
          />
        </Pane>
      )}

      {Object.entries(TOP_CITIES).map(([name, [lng, lat]]) => (
        <Marker key={name} position={[lat, lng]} icon={CITY_ICON} interactive={false}>
          <Tooltip permanent direction="top" offset={[0, -5]} className="city-label">
            {name}
          </Tooltip>
        </Marker>
      ))}
    </MapContainer>
  );
}
