import { SITE } from '../../config/site';
import { formatDate } from '../../lib/format';

const SOURCE_LINE = () =>
  `Quelle: Marktstammdatenregister (Bundesnetzagentur), dl-de/by-2-0 · Datenstand ${formatDate(SITE.dataStand)} · ${SITE.url.replace('https://', '')}`;

function download(href, filename) {
  const link = document.createElement('a');
  link.href = href;
  link.download = filename;
  link.click();
}

// html2canvas and jsPDF are ~500 kB together, so they load only when someone exports.
async function capture(node) {
  const { default: html2canvas } = await import('html2canvas');
  return html2canvas(node, { useCORS: true, backgroundColor: '#ffffff', scale: 2, logging: false });
}

export async function exportPng(node, filename) {
  const canvas = await capture(node);
  download(canvas.toDataURL('image/png'), `${filename}.png`);
}

export async function exportPdf(node, filename, title) {
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
  pdf.text(SOURCE_LINE(), margin, pageH - margin + 4);
  pdf.save(`${filename}.pdf`);
}

const csvCell = (value) => {
  const text = value == null ? '' : String(value);
  return /[",\n;]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};

export function exportCsv(rows, filename) {
  if (!rows?.length) return;
  const headers = Object.keys(rows[0]);
  const lines = [headers.map(csvCell).join(','), ...rows.map((row) => headers.map((h) => csvCell(row[h])).join(','))];
  const blob = new Blob([`\uFEFF${lines.join('\n')}\n`], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  download(url, `${filename}.csv`);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
