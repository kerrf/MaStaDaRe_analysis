// Single-hue sequential ramps, light -> dark, with monotonic OKLCH lightness.
export const RAMPS = {
  orange: ['#fef2e1', '#fcd6a9', '#f6bb7a', '#ed9f4c', '#e28316', '#ca6e0e', '#b25a06', '#9a4700', '#823500'],
  blue: ['#cde2fb', '#b7d3f6', '#9ec5f4', '#86b6ef', '#5598e7', '#2a78d6', '#1c5cab', '#104281', '#0d366b'],
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
