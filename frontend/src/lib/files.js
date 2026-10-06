// Files for the visitor to save: the map as an image or PDF (features/dashboard/exportMap.js), the tables and the data of
// every chart as CSV (components/ui/CsvLink.jsx)

// Saves a file: a link to it (a data or blob URL), clicked
export function saveFile(href, filename) {
  const link = document.createElement('a');
  link.href = href;
  link.download = filename;
  link.click();
}

const csvCell = (value) => {
  const text = value == null ? '' : String(value);
  return /[",\n;]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};

// Rows ({ column: value }, the columns of the first row) as a CSV file: UTF-8 with a byte order mark, so that Excel reads
// the umlauts; numbers with a decimal point
export function exportCsv(rows, filename) {
  if (!rows?.length) return;
  const headers = Object.keys(rows[0]);
  const lines = [headers.map(csvCell).join(','), ...rows.map((row) => headers.map((h) => csvCell(row[h])).join(','))];
  const blob = new Blob([`\uFEFF${lines.join('\n')}\n`], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  saveFile(url, `${filename}.csv`);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// A value for a CSV cell without the noise of floating point (0.1 + 0.2 -> 0.3); none stays empty
export const round = (value, digits = 3) => (value == null || !Number.isFinite(value) ? null : Math.round(value * 10 ** digits) / 10 ** digits);

// A file name from its parts, the empty ones left out: fileName('mastr', 'solar', '', 'de') -> "mastr_solar_de"
export const fileName = (...parts) => parts.filter(Boolean).join('_').toLowerCase();

// A selection (the query of the API: "anlagenart=gebaeude&leistung=brutto") in a file name: "gebaeude-brutto"
export const selectionSlug = (query) => (query ? [...new URLSearchParams(query).values()].join('-') : '');
