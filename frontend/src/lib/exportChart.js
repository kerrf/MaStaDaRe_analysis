import { SITE } from '../config/site';
import { saveFile } from './files';
import { formatDate } from './format';

const SCALE = 2;
// The site first, then the data it builds on; credits: what else the image shows (the map's boundaries)
export const sourceLine = (datenstand, credits = '') =>
  `Quelle: ${SITE.url.replace('https://', '')} · Daten: Marktstammdatenregister (Bundesnetzagentur), dl-de/by-2-0 · ` +
  `Datenstand ${formatDate(datenstand)}${credits ? ` · ${credits}` : ''}`;

// What doesn't belong in the image of a chart: its export buttons, and what marks itself so (data-export-skip)
const isSkipped = (element) => Boolean(element.classList?.contains('chart-export') || element.dataset?.exportSkip != null);

// For the copy html2canvas renders: no animations, and the capitals of `text-transform: uppercase` written out –
// html2canvas measures the text after the transform but cuts it in the original, and "Größe" becomes "GRÖSSE", one
// letter longer (it fails on "ß")
export function prepareCopy(copy) {
  const style = copy.createElement('style');
  style.textContent = '*, *::before, *::after { animation: none !important; transition: none !important; }';
  copy.head.appendChild(style);
  const view = copy.defaultView;
  for (const element of copy.body.querySelectorAll('*')) {
    if (view.getComputedStyle(element).textTransform !== 'uppercase') continue;
    for (const child of element.childNodes) {
      if (child.nodeType === 3) child.textContent = child.textContent.toUpperCase();
    }
    element.style.textTransform = 'none';
  }
}

// A chart's card as an image, on its own background. html2canvas and jsPDF are ~500 kB together: they load only when
// someone exports.
export async function captureNode(node) {
  // A Leaflet map inside: html2canvas would misplace its layers, the map export copies them first
  if (node.querySelector('.leaflet-pane')) return (await import('../features/dashboard/exportMap')).captureMap(node);
  const { default: html2canvas } = await import('html2canvas');
  let background = getComputedStyle(node).backgroundColor;
  if (!background || background === 'rgba(0, 0, 0, 0)') background = getComputedStyle(document.body).backgroundColor;
  return html2canvas(node, {
    useCORS: true,
    backgroundColor: background,
    scale: SCALE,
    logging: false,
    ignoreElements: isSkipped,
    onclone: prepareCopy,
  });
}

export function savePng(canvas, filename) {
  saveFile(canvas.toDataURL('image/png'), `${filename}.png`);
}

// The image on an A4 page, landscape when it is wide, with its title above and the source below
export async function savePdf(canvas, filename, title, source) {
  const { jsPDF } = await import('jspdf');
  const pdf = new jsPDF({ orientation: canvas.width >= canvas.height ? 'landscape' : 'portrait', unit: 'mm', format: 'a4' });
  const pageW = pdf.internal.pageSize.getWidth();
  const pageH = pdf.internal.pageSize.getHeight();
  const margin = 12;

  pdf.setFontSize(14);
  pdf.text(pdf.splitTextToSize(title, pageW - 2 * margin)[0], margin, margin + 4);

  const maxW = pageW - 2 * margin;
  const maxH = pageH - 2 * margin - 16;
  const ratio = Math.min(maxW / canvas.width, maxH / canvas.height);
  const [w, h] = [canvas.width * ratio, canvas.height * ratio];
  pdf.addImage(canvas.toDataURL('image/png'), 'PNG', (pageW - w) / 2, margin + 9, w, h);

  pdf.setFontSize(7);
  pdf.setTextColor(102, 112, 133);
  pdf.text(pdf.splitTextToSize(source, pageW - 2 * margin), margin, pageH - margin + 1);
  pdf.save(`${filename}.pdf`);
}
