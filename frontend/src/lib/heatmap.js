// The continuous map (heatmap): a density surface from points with a value each (kW, kWh), drawn anew for every view.
//
// Each point spreads its value with a Gaussian kernel: its own width (sigma, km: how exactly its location is known – a
// plant at its coordinates, the small units of a postcode over the postcode) plus a smoothing of a few pixels, so that the
// surface stays continuous at every zoom. The values of all kernels add up per cell of a grid over the view, divided by
// the cell's area on the ground: a density, e.g. kW per km². Its colours run on a logarithmic scale over the range of the
// view: from where the thinnest 2 % of the power lies to a high quantile of the cells (so a few peaks don't wash out the
// rest), one to three decades; below, they fade out.

const EARTH_RADIUS = 6378137; // m, of Web Mercator (Leaflet's EPSG:3857)
const WORLD = 256; // px: the world at zoom 0
// Metres per pixel at zoom 0 on the equator
const EQUATOR_RESOLUTION = (2 * Math.PI * EARTH_RADIUS) / WORLD;

// The smoothing added to every kernel, in px of the view, to choose from; the grid's cells grow with it (px per cell),
// which keeps the kernels a few cells wide: the work per point stays the same
export const SMOOTHINGS = {
  fein: { label: 'fein', px: 4, cell: 2 },
  mittel: { label: 'mittel', px: 8, cell: 3 },
  grob: { label: 'grob', px: 16, cell: 6 },
};
export const DEFAULT_SMOOTHING = 'mittel';
const MIN_DECADES = 1; // of the colour scale
const MAX_DECADES = 3;
const HIGH_QUANTILE = 0.995; // of the cells
const LOW_SHARE = 0.02; // of the power (or capacity)

/**
 * The points in Web Mercator pixels at zoom 0, once per data set: x, y, the kernel's width in those pixels (it depends on
 * the latitude) and the value.
 */
export function prepare({ lon, lat, sigma, value }) {
  const n = lon.length;
  const x = new Float64Array(n);
  const y = new Float64Array(n);
  const s = new Float64Array(n);
  const v = new Float64Array(n);
  for (let i = 0; i < n; i += 1) {
    const phi = (lat[i] * Math.PI) / 180;
    const sin = Math.sin(phi);
    x[i] = ((lon[i] + 180) / 360) * WORLD;
    y[i] = (0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI)) * WORLD;
    s[i] = (sigma[i] * 1000) / (EQUATOR_RESOLUTION * Math.cos(phi));
    v[i] = value[i];
  }
  return { n, x, y, s, v };
}

// The latitude of a Web Mercator pixel row (zoom-0 pixels)
const latitudeOf = (y0) => Math.atan(Math.sinh(Math.PI * (1 - (2 * y0) / WORLD)));

// km per pixel at a zoom and latitude (radians)
export const kmPerPixel = (zoom, phi) => (EQUATOR_RESOLUTION * Math.cos(phi)) / 2 ** zoom / 1000;

// Scratch for the kernel's weights along x and y, grown as needed
let weightsX = new Float64Array(256);
let weightsY = new Float64Array(256);

// A point whose own kernel is narrower than this (in cells) only takes the smoothing: one blur of the whole grid instead
// of a kernel each, which at the zoom of all Germany is almost every point
const NARROW = 0.5;

// Blurs a grid with a Gaussian of width sd (cells), along its rows, then its columns (zero beyond its edges)
function blur(grid, cols, rows, sd) {
  const reach = Math.ceil(3 * sd);
  const kernel = new Float32Array(2 * reach + 1);
  let sum = 0;
  for (let k = -reach; k <= reach; k += 1) sum += kernel[k + reach] = Math.exp(-(k * k) / (2 * sd * sd));
  for (let k = 0; k < kernel.length; k += 1) kernel[k] /= sum;
  const line = new Float32Array(Math.max(cols, rows));
  for (let row = 0; row < rows; row += 1) {
    const offset = row * cols;
    for (let col = 0; col < cols; col += 1) {
      let value = 0;
      for (let k = Math.max(-reach, -col); k <= Math.min(reach, cols - 1 - col); k += 1) value += kernel[k + reach] * grid[offset + col + k];
      line[col] = value;
    }
    grid.set(line.subarray(0, cols), offset);
  }
  for (let col = 0; col < cols; col += 1) {
    for (let row = 0; row < rows; row += 1) {
      let value = 0;
      for (let k = Math.max(-reach, -row); k <= Math.min(reach, rows - 1 - row); k += 1) value += kernel[k + reach] * grid[(row + k) * cols + col];
      line[row] = value;
    }
    for (let row = 0; row < rows; row += 1) grid[row * cols + col] = line[row];
  }
}

/**
 * The density on a grid over a region of the map: originX/originY its top left corner in absolute pixels at the zoom,
 * width/height in pixels, smoothing one of SMOOTHINGS. Returns the grid (value per km² per cell, row by row), its size in
 * cells and their size in px.
 */
export function densityGrid(points, { zoom, originX, originY, width, height, smoothing = SMOOTHINGS[DEFAULT_SMOOTHING] }) {
  const CELL = smoothing.cell;
  const cols = Math.ceil(width / CELL);
  const rows = Math.ceil(height / CELL);
  const grid = new Float32Array(cols * rows);
  // The narrow points, each split between the four cells around it, blurred together at the end
  const narrow = new Float32Array(cols * rows);
  const scale = 2 ** zoom;
  const smoothCells = smoothing.px / CELL;
  const smooth2 = smoothCells ** 2;
  const smoothReach = Math.ceil(3 * smoothCells);
  const { n, x, y, s, v } = points;

  for (let i = 0; i < n; i += 1) {
    // In grid cells: the centre and the kernel's width
    const gx = (x[i] * scale - originX) / CELL;
    const gy = (y[i] * scale - originY) / CELL;
    const own = (s[i] * scale) / CELL;

    if (own < NARROW) {
      if (gx < -smoothReach || gy < -smoothReach || gx > cols + smoothReach || gy > rows + smoothReach) continue;
      const fx = gx - 0.5;
      const fy = gy - 0.5;
      const col = Math.floor(fx);
      const row = Math.floor(fy);
      const ax = fx - col;
      const ay = fy - row;
      const left = (1 - ax) * v[i];
      const right = ax * v[i];
      for (const [r, w] of [
        [row, 1 - ay],
        [row + 1, ay],
      ]) {
        if (r < 0 || r >= rows) continue;
        if (col >= 0 && col < cols) narrow[r * cols + col] += left * w;
        if (col + 1 >= 0 && col + 1 < cols) narrow[r * cols + col + 1] += right * w;
      }
      continue;
    }

    const sd = Math.sqrt(own * own + smooth2);
    const reach = Math.ceil(3 * sd);
    if (gx + reach < 0 || gy + reach < 0 || gx - reach > cols || gy - reach > rows) continue;

    // The weights along each axis, summed over the whole kernel (also where it leaves the grid: that part of the value
    // lies outside the view), kept where it is on the grid
    const twice = 2 * sd * sd;
    const fromX = Math.floor(gx - reach);
    const fromY = Math.floor(gy - reach);
    const span = 2 * reach + 2;
    if (span > weightsX.length) {
      weightsX = new Float64Array(span * 2);
      weightsY = new Float64Array(span * 2);
    }
    let sumX = 0;
    let sumY = 0;
    for (let k = 0; k < span; k += 1) {
      const dx = fromX + k + 0.5 - gx;
      const dy = fromY + k + 0.5 - gy;
      weightsX[k] = Math.exp(-(dx * dx) / twice);
      weightsY[k] = Math.exp(-(dy * dy) / twice);
      sumX += weightsX[k];
      sumY += weightsY[k];
    }
    const share = v[i] / (sumX * sumY);
    const x0 = Math.max(0, fromX);
    const x1 = Math.min(cols - 1, fromX + span - 1);
    const y0 = Math.max(0, fromY);
    const y1 = Math.min(rows - 1, fromY + span - 1);
    for (let row = y0; row <= y1; row += 1) {
      const wy = weightsY[row - fromY] * share;
      if (wy === 0) continue;
      const offset = row * cols;
      for (let col = x0; col <= x1; col += 1) grid[offset + col] += weightsX[col - fromX] * wy;
    }
  }

  blur(narrow, cols, rows, smoothCells);

  // Per km²: a cell's area on the ground shrinks towards the north
  for (let row = 0; row < rows; row += 1) {
    const phi = latitudeOf((originY + (row + 0.5) * CELL) / scale);
    const side = CELL * kmPerPixel(zoom, phi);
    const perArea = 1 / (side * side);
    const offset = row * cols;
    for (let col = 0; col < cols; col += 1) grid[offset + col] = (grid[offset + col] + narrow[offset + col]) * perArea;
  }
  return { grid, cols, rows, cell: CELL };
}

const BINS = 600;

/**
 * The colour scale of a grid, from a histogram of the logarithms of its cells: the high end where HIGH_QUANTILE of the
 * cells lie below, the low end where LOW_SHARE of the value does (the thin rest, not the empty land: the cells are summed
 * by their value), between MIN_DECADES and MAX_DECADES below the high end.
 */
export function scaleOf(grid) {
  let max = 0;
  for (let i = 0; i < grid.length; i += 1) if (grid[i] > max) max = grid[i];
  if (!(max > 0)) return null;
  // Cells below a millionth of the maximum are only the tails of the kernels
  const floor = max * 1e-6;
  const span = Math.log10(max / floor);
  const cells = new Uint32Array(BINS);
  const mass = new Float64Array(BINS);
  let count = 0;
  let total = 0;
  for (let i = 0; i < grid.length; i += 1) {
    if (grid[i] <= floor) continue;
    const bin = Math.min(BINS - 1, Math.floor((Math.log10(grid[i] / floor) / span) * BINS));
    cells[bin] += 1;
    mass[bin] += grid[i];
    count += 1;
    total += grid[i];
  }
  const valueOf = (bin) => floor * 10 ** (((bin + 1) / BINS) * span);
  let seen = 0;
  let top = 0;
  while (top < BINS - 1 && seen + cells[top] < HIGH_QUANTILE * count) seen += cells[top++];
  let summed = 0;
  let bottom = 0;
  while (bottom < BINS - 1 && summed + mass[bottom] < LOW_SHARE * total) summed += mass[bottom++];
  const high = valueOf(top);
  const low = Math.min(high / 10 ** MIN_DECADES, Math.max(high / 10 ** MAX_DECADES, valueOf(bottom)));
  return { low, high, max };
}

const hexToRgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));

// 256 colours along a ramp (light to dark), as RGB
export function lookupOf(ramp) {
  const stops = ramp.map(hexToRgb);
  const last = stops.length - 1;
  const table = new Uint8ClampedArray(256 * 3);
  for (let i = 0; i < 256; i += 1) {
    const t = (i / 255) * last;
    const k = Math.min(last - 1, Math.floor(t));
    const f = t - k;
    for (let c = 0; c < 3; c += 1) table[i * 3 + c] = stops[k][c] + f * (stops[k + 1][c] - stops[k][c]);
  }
  return table;
}

// Where a value lies on the scale: 0 at its low end, 1 at its high end (log)
export const positionOf = (value, scale) => Math.log10(value / scale.low) / Math.log10(scale.high / scale.low);

/**
 * The grid as pixels: the colour of its value on the scale; below the low end, the lowest colour fades out over one more
 * decade. opacity: of the highest colours.
 */
export function paint(image, grid, scale, lookup, opacity = 0.88) {
  const { data } = image;
  const top = Math.round(opacity * 255);
  for (let i = 0; i < grid.length; i += 1) {
    const value = grid[i];
    const o = i * 4;
    if (!scale || value <= scale.low / 10) {
      data[o + 3] = 0;
      continue;
    }
    const t = positionOf(value, scale);
    const index = t <= 0 ? 0 : t >= 1 ? 255 : Math.round(t * 255);
    data[o] = lookup[index * 3];
    data[o + 1] = lookup[index * 3 + 1];
    data[o + 2] = lookup[index * 3 + 2];
    // Fading out below the low end: from 0 a decade below it to full at it; the light colours a little less opaque
    const fade = t < 0 ? Math.max(0, 1 + Math.log10(value / scale.low)) : 1;
    data[o + 3] = Math.round(top * fade * (0.55 + 0.45 * Math.min(1, Math.max(0, t))));
  }
}
