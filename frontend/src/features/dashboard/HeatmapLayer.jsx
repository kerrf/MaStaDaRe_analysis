import { useEffect, useRef } from 'react';
import { useMap } from 'react-leaflet';
import L from 'leaflet';
import { densityGrid, kmPerPixel, lookupOf, paint, prepare, scaleOf } from '../../lib/heatmap';

// Beyond the view on every side, as a share of its size: panning a little shows no empty edge before the next drawing
const PADDING = 0.15;

// The density surface as a canvas in its own pane, below the borders: drawn anew after every move and zoom, scaled with
// the map while it zooms (like Leaflet's own canvas layers)
const DensityCanvas = L.Layer.extend({
  initialize(points, ramp, smoothing, onDrawn) {
    this._points = points;
    this._lookup = lookupOf(ramp);
    this._smoothing = smoothing;
    this._onDrawn = onDrawn;
  },

  setSmoothing(smoothing) {
    this._smoothing = smoothing;
    this._draw();
  },

  onAdd(map) {
    const pane = map.getPane('heat') ?? map.createPane('heat');
    pane.style.zIndex = 400;
    pane.style.pointerEvents = 'none';
    this._canvas = L.DomUtil.create('canvas', 'heat-canvas leaflet-zoom-animated', pane);
    map.on('moveend resize', this._draw, this);
    map.on('zoomanim', this._animateZoom, this);
    map.on('zoom', this._follow, this);
    this._draw();
  },

  onRemove(map) {
    map.off('moveend resize', this._draw, this);
    map.off('zoomanim', this._animateZoom, this);
    map.off('zoom', this._follow, this);
    L.DomUtil.remove(this._canvas);
    this._canvas = null;
  },

  // The density at a point of the map container, per km²; null outside the drawing
  valueAt(point) {
    const drawn = this._drawn;
    if (!drawn) return null;
    const col = Math.floor((point.x + drawn.padX) / drawn.cell);
    const row = Math.floor((point.y + drawn.padY) / drawn.cell);
    if (col < 0 || row < 0 || col >= drawn.cols || row >= drawn.rows) return null;
    return drawn.grid[row * drawn.cols + col];
  },

  // While the zoom changes frame by frame (flying to a Land or Kreis, pinching), the drawing follows, stretched: its top
  // left corner where it lies now, scaled from the zoom it was drawn at. The next drawing comes after the move.
  _follow() {
    if (!this._drawnAt) return;
    const map = this._map;
    L.DomUtil.setTransform(this._canvas, map.latLngToLayerPoint(this._drawnAt.corner), map.getZoomScale(map.getZoom(), this._drawnAt.zoom));
  },

  _animateZoom(e) {
    const map = this._map;
    const scale = map.getZoomScale(e.zoom);
    const offset = map._latLngBoundsToNewLayerBounds(this._bounds, e.zoom, e.center).min;
    L.DomUtil.setTransform(this._canvas, offset, scale);
  },

  _draw() {
    const map = this._map;
    if (!map || !this._canvas) return;
    const size = map.getSize();
    // Not laid out yet (a hidden or collapsing frame): nothing to draw on
    if (!size.x || !size.y) return;
    const padX = Math.round(size.x * PADDING);
    const padY = Math.round(size.y * PADDING);
    const width = size.x + 2 * padX;
    const height = size.y + 2 * padY;
    const zoom = map.getZoom();
    const origin = map.getPixelBounds().min;
    const smoothing = this._smoothing;
    const { grid, cols, rows, cell } = densityGrid(this._points, {
      zoom,
      originX: origin.x - padX,
      originY: origin.y - padY,
      width,
      height,
      smoothing,
    });

    // Where the canvas lies: its top left corner as a layer point, and as a place for the zoom animation
    const topLeft = map.containerPointToLayerPoint([-padX, -padY]);
    this._bounds = L.latLngBounds(map.containerPointToLatLng([-padX, height - padY]), map.containerPointToLatLng([width - padX, -padY]));
    L.DomUtil.setPosition(this._canvas, topLeft);
    this._drawnAt = { corner: map.containerPointToLatLng([-padX, -padY]), zoom };

    // The colours of the cells, then stretched over the canvas: smooth, a pixel per cell would show
    const scale = scaleOf(grid);
    const cells = document.createElement('canvas');
    cells.width = cols;
    cells.height = rows;
    const cellContext = cells.getContext('2d');
    const image = cellContext.createImageData(cols, rows);
    paint(image, grid, scale, this._lookup);
    cellContext.putImageData(image, 0, 0);

    this._canvas.width = width;
    this._canvas.height = height;
    this._canvas.style.width = `${width}px`;
    this._canvas.style.height = `${height}px`;
    const context = this._canvas.getContext('2d');
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = 'high';
    context.drawImage(cells, 0, 0, cols * cell, rows * cell);

    this._drawn = { grid, cols, rows, cell, padX, padY };
    // The scale for the legend, with the smoothing in km in the middle of the view
    const centre = (map.getCenter().lat * Math.PI) / 180;
    this._onDrawn?.({ scale, smoothingKm: smoothing.px * kmPerPixel(zoom, centre) });
  },
});

/**
 * The continuous map of a technology: its points (GET …/heatmap: lon, lat, sigma, value) as a density surface in the
 * colours of the ramp, smoothed by one of SMOOTHINGS (lib/heatmap). onDrawn({ scale, smoothingKm }) after every drawing,
 * for the legend; onHover(density per km² or null) while the pointer moves over the map.
 */
export default function HeatmapLayer({ data, ramp, smoothing, onDrawn, onHover }) {
  const map = useMap();
  const callbacks = useRef({ onDrawn, onHover });
  useEffect(() => {
    callbacks.current = { onDrawn, onHover };
  }, [onDrawn, onHover]);
  const layerRef = useRef(null);
  // The smoothing the layer starts with; a later one is set on it
  const smoothingRef = useRef(smoothing);

  useEffect(() => {
    if (!data) return undefined;
    const layer = new DensityCanvas(prepare(data), ramp, smoothingRef.current, (drawn) => callbacks.current.onDrawn?.(drawn));
    layerRef.current = layer;
    layer.addTo(map);
    const move = (e) => callbacks.current.onHover?.(layer.valueAt(e.containerPoint));
    const out = () => callbacks.current.onHover?.(null);
    map.on('mousemove', move);
    map.on('mouseout', out);
    return () => {
      map.off('mousemove', move);
      map.off('mouseout', out);
      layer.remove();
      layerRef.current = null;
    };
  }, [map, data, ramp]);

  useEffect(() => {
    smoothingRef.current = smoothing;
    if (layerRef.current && layerRef.current._smoothing !== smoothing) layerRef.current.setSmoothing(smoothing);
  }, [smoothing]);

  return null;
}
