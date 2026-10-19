import { prepareCopy, renderCanvas, savePdf, savePng, sourceLine } from '../../lib/exportChart';

const CREDITS = 'Karte: © GeoBasis-DE / BKG (2025) dl-de/by-2-0 (Daten verändert), Marine Regions CC BY 4.0, Natural Earth';

const SCALE = 2;
// The layers Leaflet draws: a canvas or SVG per renderer, an image per overlay (heatmap), each right inside its pane,
// and the tiles of a background map (Regionen im Detail; loaded with crossOrigin, so the image may use them)
const LAYERS = '.leaflet-pane > canvas, .leaflet-pane > svg, .leaflet-pane > img.leaflet-image-layer, img.leaflet-tile';
// The map's buttons and exports: not in the image
const CONTROLS = '.leaflet-control-zoom, .basemap-switch, .chart-export';
// In the copy html2canvas renders: no animations (the place names would be caught fading in), no layers (drawn before),
// no background (the sea is drawn before as well)
const OVERLAY_ONLY = `
  *, *::before, *::after { animation: none !important; transition: none !important; }
  .map-frame, .leaflet-container { background: transparent !important; }
`;

// An SVG layer as an image. Without its style: Leaflet places it with a CSS transform, which inside the image would move
// its content a second time.
function imageOf(svg) {
  const copy = svg.cloneNode(true);
  copy.removeAttribute('style');
  copy.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  const image = new Image();
  image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(new XMLSerializer().serializeToString(copy))}`;
  return image.decode().then(() => image);
}

// The map frame as an image. html2canvas misplaces Leaflet's layers once the map has moved (they sit in panes moved by
// translate3d), so the layers are copied first, each where it is on screen, in the order of their panes; html2canvas
// only adds what lies on top: the place names, the legend, the chips.
export async function captureMap(node) {
  const frame = node.getBoundingClientRect();
  const image = document.createElement('canvas');
  image.width = Math.round(frame.width * SCALE);
  image.height = Math.round(frame.height * SCALE);
  const ctx = image.getContext('2d');
  ctx.scale(SCALE, SCALE);
  ctx.fillStyle = getComputedStyle(node.querySelector('.leaflet-container') ?? node).backgroundColor;
  ctx.fillRect(0, 0, frame.width, frame.height);

  const paneOrder = (layer) => Number(getComputedStyle(layer.closest('.leaflet-pane')).zIndex) || 0;
  // A layer's opacity with that of everything around it inside the map (the background map's own, its pane's)
  const opacityOf = (layer) => {
    let opacity = 1;
    for (let el = layer; el && !el.classList.contains('leaflet-container'); el = el.parentElement) opacity *= Number(getComputedStyle(el).opacity);
    return opacity;
  };
  const layers = [...node.querySelectorAll(LAYERS)].sort((a, b) => paneOrder(a) - paneOrder(b)); // stable: DOM order
  for (const layer of layers) {
    const box = layer.getBoundingClientRect();
    if (!box.width || !box.height) continue;
    const source = layer.tagName.toLowerCase() === 'svg' ? await imageOf(layer) : layer;
    ctx.globalAlpha = opacityOf(layer);
    ctx.drawImage(source, box.left - frame.left, box.top - frame.top, box.width, box.height);
  }
  ctx.globalAlpha = 1;

  const overlay = await renderCanvas(node, {
    useCORS: true,
    backgroundColor: null,
    scale: SCALE,
    logging: false,
    // Drawn before (the layers), or controls with nothing to say in an image
    ignoreElements: (element) => Boolean(element.matches?.(`${LAYERS}, ${CONTROLS}`)),
    onclone: (copy) => {
      prepareCopy(copy);
      const style = copy.createElement('style');
      style.textContent = OVERLAY_ONLY;
      copy.head.appendChild(style);
    },
  });
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.drawImage(overlay, 0, 0, image.width, image.height);
  return image;
}

export async function exportPng(node, filename) {
  savePng(await captureMap(node), filename);
}

export async function exportPdf(node, filename, title, datenstand) {
  await savePdf(await captureMap(node), filename, title, sourceLine(datenstand, CREDITS));
}
