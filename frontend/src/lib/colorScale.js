// Single-hue sequential ramps, light -> dark, with monotonic OKLCH lightness.
export const RAMPS = {
  orange: ['#fef2e1', '#fcd6a9', '#f6bb7a', '#ed9f4c', '#e28316', '#ca6e0e', '#b25a06', '#9a4700', '#823500'],
  blue: ['#cde2fb', '#b7d3f6', '#9ec5f4', '#86b6ef', '#5598e7', '#2a78d6', '#1c5cab', '#104281', '#0d366b'],
  teal: ['#d9f2ee', '#bce7e0', '#98d8ce', '#6fc6b9', '#46b0a2', '#239a8c', '#0e8a7e', '#0b675e', '#084f48'],
  rose: ['#fdebf0', '#f9cdd9', '#f2a9bc', '#e9829d', '#dc5a7f', '#c0365b', '#9d2547', '#7a1836', '#5c0f28'],
};

const hexToRgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));

// Skewed data (a few very large regions) would wash out a linear 0..max scale, so for
// many-region layers the upper end is clipped at the 98th percentile.
export function scaleDomainMax(values) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  if (sorted.length < 50) return sorted[sorted.length - 1];
  return sorted[Math.floor(0.98 * (sorted.length - 1))];
}

export function makeColorScale(ramp, max) {
  const stops = ramp.map(hexToRgb);
  const last = stops.length - 1;
  return (value) => {
    if (!(max > 0)) return ramp[0];
    const t = Math.min(1, Math.max(0, value / max)) * last;
    const i = Math.min(last - 1, Math.floor(t));
    const f = t - i;
    const [a, b] = [stops[i], stops[i + 1]];
    return `rgb(${a.map((c, k) => Math.round(c + f * (b[k] - c))).join(',')})`;
  };
}

export const rampGradient = (ramp) => `linear-gradient(to right, ${ramp.join(', ')})`;

// White text on the dark end of a ramp, dark text elsewhere (relative luminance of an "rgb(r,g,b)" colour)
export function inkOn(rgb) {
  const [r, g, b] = rgb.match(/\d+/g).map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b < 0.25 ? '#fff' : 'var(--ink-primary)';
}

// A colour as a value: a CSS variable ("var(--series-solar-balkon)") read from the page's tokens
const resolved = (color) => {
  const name = /^var\((--[\w-]+)\)$/.exec(color)?.[1];
  if (!name || typeof document === 'undefined') return color;
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || color;
};

/**
 * Diagonal lines over a series' colour, for CSS: its swatch, a legend, a bar (series: { color, hatch }). A tile of SVG
 * repeated, not a repeating-linear-gradient: html2canvas draws no repeating gradients, and the exports would lose it.
 */
export function hatchOf({ color, hatch }) {
  const svg =
    `<svg xmlns='http://www.w3.org/2000/svg' width='6' height='6'><rect width='6' height='6' fill='${resolved(color)}'/>` +
    `<path d='M-1,1 l2,-2 M0,6 l6,-6 M5,7 l2,-2' stroke='${resolved(hatch)}' stroke-width='1.6'/></svg>`;
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}") repeat`;
}
