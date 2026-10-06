import { Download } from 'lucide-react';
import { exportCsv } from '../../lib/files';
import { trackEvent } from '../../lib/usage';

/**
 * The data of a chart as a CSV file: a small link, at the right of the chart's foot. rows: returns the rows
 * ({ column: value }), called on the click; filename: without ".csv"; name: the chart in the usage statistics.
 */
export default function CsvLink({ rows, filename, name }) {
  const save = () => {
    trackEvent('Grafikexport', { grafik: name });
    exportCsv(rows(), filename);
  };
  return (
    <button type="button" className="csv-link" onClick={save} title="Die Daten dieser Grafik als CSV-Datei">
      <Download size={12} aria-hidden="true" />
      CSV
    </button>
  );
}

// The foot of a chart: its note (children) on the left, the CSV link on the right. csv: the props of the link, null
// while the chart has no data
export function ChartFoot({ csv, className = '', children }) {
  return (
    <div className={className ? `chart-foot ${className}` : 'chart-foot'}>
      {children}
      {csv && <CsvLink {...csv} />}
    </div>
  );
}
