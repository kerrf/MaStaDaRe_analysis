import { useState } from 'react';
import { useDatenstand } from '../../lib/data';
import { captureNode, savePdf, savePng, sourceLine } from '../../lib/exportChart';
import { exportCsv, exportJson } from '../../lib/files';
import { trackEvent } from '../../lib/usage';
import ExportMenu from './ExportMenu';

// What the image shows: the chart's own block where it marks one (data-export), else the card or figure around it
const TARGET = '[data-export], .analysis, .card, figure';

/**
 * Every chart's exports, a download menu at the right of its foot (ExportMenu): its data as CSV or JSON, the chart as
 * an image (PNG) or a PDF page with its title and source – the card or figure it lies in, without the menu. rows:
 * returns the rows ({ column: value }), called on the click; filename: without extension; name: the chart in the usage
 * statistics; title: of the PDF (default: the heading of the card); target: a selector inside the card for what the
 * image shows instead of the whole card (a map card: its map frame, as the map's own export).
 */
export default function ChartExport({ rows, filename, name, title, target }) {
  const datenstand = useDatenstand();
  const [busy, setBusy] = useState(null);
  const save = async (format, element) => {
    trackEvent('Grafikexport', { grafik: name, format });
    if (format === 'csv') return exportCsv(rows(), filename);
    if (format === 'json') return exportJson(rows(), filename);
    const card = element.closest(TARGET);
    if (!card) return undefined;
    const node = (target && card.querySelector(target)) || card;
    setBusy(format);
    try {
      const canvas = await captureNode(node);
      if (format === 'png') savePng(canvas, filename);
      else {
        const heading = title ?? card.querySelector('h1, h2, h3, h4, figcaption')?.textContent?.trim() ?? '';
        await savePdf(canvas, filename, heading, sourceLine(datenstand));
      }
    } finally {
      setBusy(null);
    }
    return undefined;
  };
  return <ExportMenu onExport={save} busy={busy} />;
}

// The foot of a chart: its note (children) on the left, the exports on the right. csv: the props of ChartExport, null
// while the chart has no data
export function ChartFoot({ csv, className = '', children }) {
  return (
    <div className={className ? `chart-foot ${className}` : 'chart-foot'}>
      {children}
      {csv && <ChartExport {...csv} />}
    </div>
  );
}
