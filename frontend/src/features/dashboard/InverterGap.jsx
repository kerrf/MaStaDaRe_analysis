import { API_BASE_URL } from '../../config/site';
import { useStats } from '../../lib/data';
import { formatAmount, formatPercent } from '../../lib/format';

const sumOf = (rows, field) => rows.reduce((total, row) => total + (row[field] ?? 0), 0);

/**
 * How far the solar units' Nettonennleistung (AC: the inverters limit it) stays below their peak (Bruttoleistung, DC) in
 * the scope and the chosen Anlagenart, on average weighted by power: the size classes (path) once in each, summed.
 * Below the Verteilung nach Anlagengröße, in its card.
 */
export default function InverterGap({ path, region, query }) {
  // The page's selection without its Netto/Brutto choice: both are asked for
  const urlOf = (leistung) => {
    const params = new URLSearchParams(query);
    params.set('region', region);
    params.set('leistung', leistung);
    return `${API_BASE_URL}${path}?${params}`;
  };
  const brutto = useStats(urlOf('brutto'));
  const netto = useStats(urlOf('netto'));
  if (brutto.status !== 'ready' || netto.status !== 'ready') return null;

  const dc = sumOf(brutto.data, 'total_power');
  const ac = sumOf(netto.data, 'total_power');
  if (!dc) return null;
  return (
    <section className="inverter-gap" aria-labelledby="inverter-gap-title">
      <h4 id="inverter-gap-title" className="inverter-gap__title">
        Differenz Wechselrichterleistung und Peakproduktion
      </h4>
      <p className="inverter-gap__figure">
        <span className="inverter-gap__value">−{formatPercent((dc - ac) / dc)}</span>
        <span className="inverter-gap__text">Wechselrichterleistung gegenüber der Peakleistung der Module, im Schnitt</span>
      </p>
      <p className="inverter-gap__note">
        Nach Leistung gewichtet: {formatAmount(ac, 'MW')} Nettonennleistung (AC) statt {formatAmount(dc, 'MW')} Bruttoleistung
        (DC) – {formatAmount(dc - ac, 'MW')} weniger.
      </p>
    </section>
  );
}
