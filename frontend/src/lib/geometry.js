// Points and measures of areas (GeoJSON, lon/lat) for labelling them on a map.

// Twice the signed area of a ring (shoelace)
const ringArea2 = (ring) => ring.reduce((sum, [x1, y1], i) => {
  const [x2, y2] = ring[(i + 1) % ring.length];
  return sum + x1 * y2 - x2 * y1;
}, 0);

function insidePolygon(x, y, rings) {
  let inside = false;
  for (const ring of rings) {
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i, i += 1) {
      const [xi, yi] = ring[i];
      const [xj, yj] = ring[j];
      if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
    }
  }
  return inside;
}

// Distance of a point to the nearest edge of the polygon, with x scaled by k (degrees of longitude are shorter)
function edgeDistance(x, y, rings, k) {
  let best = Infinity;
  for (const ring of rings) {
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i, i += 1) {
      const [ax, ay] = [ring[j][0] * k, ring[j][1]];
      const [bx, by] = [ring[i][0] * k, ring[i][1]];
      const [px, py] = [x * k, y];
      const [dx, dy] = [bx - ax, by - ay];
      const t = dx || dy ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy))) : 0;
      best = Math.min(best, Math.hypot(px - ax - t * dx, py - ay - t * dy));
    }
  }
  return best;
}

/**
 * The point of an area to write its name at: in its largest polygon, the point farthest from the edges, found by a
 * search on a grid that narrows around the best point (like polylabel). Unlike the centroid it never lies outside a bent
 * area or in a hole. Returns [lon, lat].
 */
export function labelPoint(geometry) {
  const polygons = geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates;
  const rings = polygons.reduce((best, p) => (Math.abs(ringArea2(p[0])) > Math.abs(ringArea2(best[0])) ? p : best));
  const xs = rings[0].map((p) => p[0]);
  const ys = rings[0].map((p) => p[1]);
  const k = Math.cos((((Math.min(...ys) + Math.max(...ys)) / 2) * Math.PI) / 180);
  let [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  let best = { x: (x0 + x1) / 2, y: (y0 + y1) / 2, d: -Infinity };
  const STEPS = 16;
  for (let round = 0; round < 4; round += 1) {
    const [sx, sy] = [(x1 - x0) / STEPS, (y1 - y0) / STEPS];
    for (let i = 0; i <= STEPS; i += 1) {
      for (let j = 0; j <= STEPS; j += 1) {
        const [x, y] = [x0 + i * sx, y0 + j * sy];
        if (!insidePolygon(x, y, rings)) continue;
        const d = edgeDistance(x, y, rings, k);
        if (d > best.d) best = { x, y, d };
      }
    }
    // Narrow the grid to the cells around the best point
    [x0, x1, y0, y1] = [best.x - 2 * sx, best.x + 2 * sx, best.y - 2 * sy, best.y + 2 * sy];
  }
  return [best.x, best.y];
}

// The box around an area: [west, south, east, north]
export function bboxOf(geometry) {
  const polygons = geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates;
  let [w, s, e, n] = [Infinity, Infinity, -Infinity, -Infinity];
  for (const polygon of polygons) {
    for (const [x, y] of polygon[0]) {
      if (x < w) w = x;
      if (x > e) e = x;
      if (y < s) s = y;
      if (y > n) n = y;
    }
  }
  return [w, s, e, n];
}
