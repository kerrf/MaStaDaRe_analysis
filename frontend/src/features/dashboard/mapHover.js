// The hover of a map's areas: its outline turns on over a moment instead of at once, and the value under the pointer
// goes to the legend (a mark on its colour scale) – both maps, the dashboards' and the Kreis map of Regionen im Detail.

const FADE_MS = 220;

const hex = (color) => {
  const m = /^#([0-9a-f]{6})$/i.exec(color);
  return m ? [0, 2, 4].map((i) => parseInt(m[1].slice(i, i + 2), 16)) : null;
};
const mix = (a, b, t) => {
  const [x, y] = [hex(a), hex(b)];
  if (!x || !y) return t < 1 ? a : b;
  return `rgb(${x.map((c, i) => Math.round(c + (y[i] - c) * t)).join(',')})`;
};

/**
 * Turns a Leaflet layer's outline from `from` to `to` ({ color: '#rrggbb', weight, opacity }) over a moment. A canvas
 * layer can't be eased by CSS, so its style is set frame by frame. stopFade(layer) ends it (the pointer left).
 */
export function fadeOutline(layer, from, to) {
  stopFade(layer);
  const start = performance.now();
  const step = (now) => {
    const t = Math.min(1, (now - start) / FADE_MS);
    const ease = 1 - (1 - t) ** 3;
    layer.setStyle({
      color: mix(from.color, to.color, ease),
      weight: from.weight + (to.weight - from.weight) * ease,
      opacity: from.opacity + (to.opacity - from.opacity) * ease,
    });
    layer._outlineFade = t < 1 ? requestAnimationFrame(step) : null;
  };
  layer._outlineFade = requestAnimationFrame(step);
  // Where frames don't come (a hidden tab), the end state all the same
  setTimeout(() => {
    if (layer._outlineFade) {
      stopFade(layer);
      layer.setStyle(to);
    }
  }, FADE_MS + 100);
}

export function stopFade(layer) {
  if (layer._outlineFade) cancelAnimationFrame(layer._outlineFade);
  layer._outlineFade = null;
}
