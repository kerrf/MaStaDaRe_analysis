import { SITE } from '../../config/site';
import { saveFile } from '../../lib/files';
import { formatDate } from '../../lib/format';

const sourceLine = (datenstand) =>
  `Quelle: Marktstammdatenregister (Bundesnetzagentur), dl-de/by-2-0 · Datenstand ${formatDate(datenstand)} · ` +
  `Karte: © GeoBasis-DE / BKG (2025) dl-de/by-2-0 (Daten verändert), Marine Regions CC BY 4.0, Natural Earth · ${SITE.url.replace('https://', '')}`;

const SCALE = 2;
// The layers Leaflet draws: a canvas or SVG per renderer, an image per overlay (heatmap), each right inside its pane
const LAYERS = '.leaflet-pane > canvas, .leaflet-pane > svg, .leaflet-pane > img.leaflet-image-layer';
// In the copy html2canvas renders: no animations (the place names would be caught fading in), no layers (drawn before),
// no background (the sea is drawn before as well)
const OVERLAY_ONLY = `
  *, *::before, *::after { animation: none !important; transition: none !important; }
  .map-frame, .map-canvas.leaflet-container { background: transparent !important; }
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
// only adds what lies on top: the place names, the legend, the chips. html2canvas and jsPDF are ~500 kB together, so
// they load only when someone exports.
async function capture(node) {
  const { default: html2canvas } = await import('html2canvas');
  const frame = node.getBoundingClientRect();
  const image = document.createElement('canvas');
  image.width = Math.round(frame.width * SCALE);
  image.height = Math.round(frame.height * SCALE);
  const ctx = image.getContext('2d');
  ctx.scale(SCALE, SCALE);
  ctx.fillStyle = getComputedStyle(node.querySelector('.leaflet-container') ?? node).backgroundColor;
  ctx.fillRect(0, 0, frame.width, frame.height);

  const paneOrder = (layer) => Number(getComputedStyle(layer.parentElement).zIndex) || 0;
  const layers = [...node.querySelectorAll(LAYERS)].sort((a, b) => paneOrder(a) - paneOrder(b)); // stable: DOM order
  for (const layer of layers) {
    const box = layer.getBoundingClientRect();
    if (!box.width || !box.height) continue;
    const source = layer.tagName.toLowerCase() === 'svg' ? await imageOf(layer) : layer;
    ctx.globalAlpha = Number(getComputedStyle(layer).opacity) * Number(getComputedStyle(layer.parentElement).opacity);
    ctx.drawImage(source, box.left - frame.left, box.top - frame.top, box.width, box.height);
  }
  ctx.globalAlpha = 1;

  const overlay = await html2canvas(node, {
    useCORS: true,
    backgroundColor: null,
    scale: SCALE,
    logging: false,
    ignoreElements: (element) => element.matches?.(LAYERS),
    onclone: (copy) => {
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
  const canvas = await capture(node);
  saveFile(canvas.toDataURL('image/png'), `${filename}.png`);
}

export async function exportPdf(node, filename, title, datenstand) {
  const [canvas, { jsPDF }] = await Promise.all([capture(node), import('jspdf')]);
  const pdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  const pageW = pdf.internal.pageSize.getWidth();
  const pageH = pdf.internal.pageSize.getHeight();
  const margin = 12;

  pdf.setFontSize(14);
  pdf.text(title, margin, margin + 4);

  const maxW = pageW - 2 * margin;
  const maxH = pageH - 2 * margin - 16;
  const ratio = Math.min(maxW / canvas.width, maxH / canvas.height);
  const w = canvas.width * ratio;
  const h = canvas.height * ratio;
  pdf.addImage(canvas.toDataURL('image/png'), 'PNG', (pageW - w) / 2, margin + 9, w, h);

  pdf.setFontSize(8);
  pdf.setTextColor(102, 112, 133);
  pdf.text(sourceLine(datenstand), margin, pageH - margin + 4);
  pdf.save(`${filename}.pdf`);
}
