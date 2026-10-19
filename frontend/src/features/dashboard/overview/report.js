import { prepareCopy, renderCanvas } from '../../../lib/exportChart';

// The PDF report of the page Überblick: its report layout (OverviewReport, rendered off screen for it) as images on A4
// pages, a block never cut in two, and on every page the source, the page's address and the page number as text.

const SCALE = 2;
const PAGE = { width: 210, height: 297, margin: 14, foot: 13 }; // mm
const GAP = 4; // mm between two blocks
const SHRINK = 0.8; // a block that doesn't fit the rest of a page, but would at this size or more, shrinks to fit it
// The window html2canvas lays its copy out in: a desktop's, so the report looks the same from a phone
const WINDOW_WIDTH = 1280;

/**
 * The report as a PDF (a jsPDF document). container: the report's root, its blocks marked .ov-report__block; title,
 * subject: of the document; source: the line about the data; url: the page the report comes from.
 */
export async function buildReport(container, { title, subject, source, url }) {
  // Where the blocks lie in the copy html2canvas draws: its own layout, at its window's width
  let blocks = [];
  const onclone = (copy, root) => {
    prepareCopy(copy);
    const top = root.getBoundingClientRect().top;
    blocks = [...root.querySelectorAll('.ov-report__block')].map((block) => {
      const box = block.getBoundingClientRect();
      return { top: box.top - top, height: box.height };
    });
  };
  const [{ jsPDF }, canvas] = await Promise.all([
    import('jspdf'),
    renderCanvas(container, { scale: SCALE, backgroundColor: '#ffffff', useCORS: true, logging: false, windowWidth: WINDOW_WIDTH, onclone }),
  ]);
  const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  pdf.setProperties({ title, subject, author: 'mastr-data.de', creator: 'mastr-data.de' });

  const width = PAGE.width - 2 * PAGE.margin;
  const bottom = PAGE.height - PAGE.margin - PAGE.foot;
  const mm = width / canvas.width; // mm per pixel of the image
  let y = PAGE.margin;
  for (const block of blocks) {
    const from = Math.round(block.top * SCALE);
    const height = Math.min(Math.round(block.height * SCALE), canvas.height - from);
    if (height <= 0) continue;
    const piece = document.createElement('canvas');
    piece.width = canvas.width;
    piece.height = height;
    piece.getContext('2d').drawImage(canvas, 0, from, canvas.width, height, 0, 0, canvas.width, height);

    // On a new page where it doesn't fit any more (unless a little smaller does); one taller than a page shrinks to it
    let [w, h] = [width, height * mm];
    if (y + h > bottom && y > PAGE.margin) {
      const fit = (bottom - y) / h;
      if (fit >= SHRINK) [w, h] = [w * fit, h * fit];
      else {
        pdf.addPage();
        y = PAGE.margin;
      }
    }
    if (h > bottom - PAGE.margin) [w, h] = [(w * (bottom - PAGE.margin)) / h, bottom - PAGE.margin];
    // Compressed: jsPDF keeps an image's pixels as they are unless told otherwise (a page of them: megabytes)
    pdf.addImage(piece, 'PNG', PAGE.margin + (width - w) / 2, y, w, h, undefined, 'FAST');
    y += h + GAP;
  }

  // The foot of every page: the source and the page's address on the left, the page number on the right
  const pages = pdf.getNumberOfPages();
  for (let page = 1; page <= pages; page += 1) {
    pdf.setPage(page);
    const line = PAGE.height - PAGE.margin + 2;
    pdf.setDrawColor(220, 214, 200);
    pdf.line(PAGE.margin, line - 5, PAGE.width - PAGE.margin, line - 5);
    pdf.setFontSize(7);
    pdf.setTextColor(102, 112, 133);
    pdf.text(pdf.splitTextToSize(source, width - 24)[0], PAGE.margin, line);
    pdf.textWithLink(pdf.splitTextToSize(url, width - 24)[0], PAGE.margin, line + 3.5, { url });
    pdf.text(`Seite ${page} von ${pages}`, PAGE.width - PAGE.margin, line, { align: 'right' });
  }
  return pdf;
}

/** The report saved as filename.pdf. */
export async function saveReport(container, { filename, ...options }) {
  (await buildReport(container, options)).save(`${filename}.pdf`);
}
