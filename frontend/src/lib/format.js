const formatters = new Map();
const nf = (options) => {
  const key = JSON.stringify(options);
  if (!formatters.has(key)) formatters.set(key, new Intl.NumberFormat('de-DE', options));
  return formatters.get(key);
};

export const formatNumber = (value, digits = 0) =>
  value == null || Number.isNaN(value) ? '—' : nf({ maximumFractionDigits: digits }).format(value);

// Legend ticks: German compact notation only abbreviates from "Mio." upward, so pick precision by magnitude.
export function formatTick(value) {
  if (value == null || Number.isNaN(value)) return '—';
  const abs = Math.abs(value);
  if (abs >= 1e6) return nf({ notation: 'compact', maximumFractionDigits: 1 }).format(value);
  if (abs >= 100) return formatNumber(value, 0);
  if (abs >= 1) return formatNumber(value, 1);
  return formatNumber(value, 2);
}

export const formatPercent = (value) =>
  value == null || Number.isNaN(value) ? '—' : nf({ style: 'percent', maximumFractionDigits: 1 }).format(value);

// Power arrives in MW; large totals read better in GW.
export function formatPower(mw) {
  if (mw == null || Number.isNaN(mw)) return { value: '—', unit: '' };
  if (Math.abs(mw) >= 1000) return { value: formatNumber(mw / 1000, 1), unit: 'GW' };
  return { value: formatNumber(mw, 0), unit: 'MW' };
}

export const formatDate = (isoDate) =>
  new Date(`${isoDate}T00:00:00`).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });

export const escapeHtml = (text) =>
  String(text).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
