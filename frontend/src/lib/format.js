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

// Shares of a whole: tiny ones read "< 0,1 %", not "0 %"
export const formatShare = (share) => (share > 0 && share < 0.001 ? '< 0,1 %' : formatPercent(share));

// Counts: "214.175", from a million on "2,7 Mio."
export const formatCount = (value) =>
  Math.abs(value) >= 1e6 ? nf({ notation: 'compact', maximumFractionDigits: 1 }).format(value) : formatNumber(value);

// Power arrives in MW; large totals read better in GW.
export function formatPower(mw) {
  if (mw == null || Number.isNaN(mw)) return { value: '—', unit: '' };
  if (Math.abs(mw) >= 1000) return { value: formatNumber(mw / 1000, 1), unit: 'GW' };
  return { value: formatNumber(mw, 0), unit: 'MW' };
}

// The next larger unit prefix, for amounts of 1,000 and more
const LARGER = { k: 'M', M: 'G', G: 'T' };

// Amounts in their unit, from 1,000 on in the next larger one: "733 MW", "1,05 GW", "17,6 GW", "45,8 TWh" (from GWh).
export function scaleAmount(value, unit) {
  if (value == null || Number.isNaN(value)) return { value: '—', unit: '' };
  let scaled = value;
  let scaledUnit = unit;
  while (Math.abs(scaled) >= 1000 && LARGER[scaledUnit[0]]) {
    scaled /= 1000;
    scaledUnit = LARGER[scaledUnit[0]] + scaledUnit.slice(1);
  }
  const digits = (Math.abs(scaled) < 10 ? 1 : 0) + (scaledUnit !== unit ? 1 : 0);
  return { value: formatNumber(scaled, digits), unit: scaledUnit };
}

export function formatAmount(value, unit) {
  const amount = scaleAmount(value, unit);
  return amount.unit ? `${amount.value} ${amount.unit}` : amount.value;
}

// Capacity arrives in MWh; large totals read better in GWh.
export function formatCapacity(mwh) {
  if (mwh == null || Number.isNaN(mwh)) return { value: '—', unit: '' };
  if (Math.abs(mwh) >= 1000) return { value: formatNumber(mwh / 1000, 1), unit: 'GWh' };
  return { value: formatNumber(mwh, 0), unit: 'MWh' };
}

export const formatDate = (isoDate) =>
  new Date(`${isoDate}T00:00:00`).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });

export const escapeHtml = (text) =>
  String(text).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
