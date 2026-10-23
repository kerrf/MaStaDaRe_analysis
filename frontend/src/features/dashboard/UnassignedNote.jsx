import { Info } from 'lucide-react';
import { formatCapacity, formatNumber, formatPower } from '../../lib/format';

// Why something isn't on the map (backend: /karte/<technik>/ohne-ort, /netz/ohne-ort)
const REASONS = {
  ohne_ort: 'ohne Ort im Register',
  nur_land: 'nur mit dem Bundesland veröffentlicht (große Anlagen): auf der Länderkarte, nicht in Kreis oder Gemeinde',
  unbekannt: 'mit einem Gemeindeschlüssel, den die Karte nicht kennt (Gemeinde seither fusioniert, oder ein falscher)',
};

// What it counts, one or several ("1 Anlage", "3 Anlagen")
const SINGULAR = { Einheiten: 'Einheit', Anlagen: 'Anlage', Punkte: 'Punkt' };
const counted = (n, label) => `${formatNumber(n)} ${n === 1 ? (SINGULAR[label] ?? label) : label}`;

// Below 1 MW (MWh) in kW (kWh): a small plant isn't "0 MW"
const small = (amount, unit, format) => (amount > 0 && amount < 1 ? { value: formatNumber(Math.round(amount * 1000)), unit } : format(amount));

// The amount of the metric's quantity: power and heat in MW, capacity in MWh, otherwise a count
function amountOf(values, quantity, unitsLabel) {
  if (quantity === 'kapazitaet') return small(values.total_capacity ?? 0, 'kWh', formatCapacity);
  if (quantity === 'waerme') return small(values.total_heat ?? 0, 'kW', formatPower);
  if (quantity === 'anzahl') return { value: formatNumber(values.total_units ?? 0), unit: unitsLabel };
  return small(values.total_power ?? 0, 'kW', formatPower);
}

const valueOf = (values, quantity) =>
  ({ kapazitaet: values.total_capacity, waerme: values.total_heat, anzahl: values.total_units })[quantity] ?? values.total_power ?? 0;

/**
 * A small note at the bottom left of the map: how much of what the map shows isn't on it, for want of a place in the
 * register – in the unit of the Kennzahl (MW, MWh, points); on hover or focus, why. Nothing missing: no note.
 * data: the answer of the API; quantity: the metric's (leistung, kapazitaet, waerme, anzahl); unitsLabel: what it
 * counts ("Einheiten", "Anlagen", "Punkte").
 */
export default function UnassignedNote({ data, quantity, unitsLabel }) {
  if (!data?.nicht_zugeordnet) return null;
  const missing = data.nicht_zugeordnet;
  if (!(valueOf(missing, quantity) > 0)) return null;
  const amount = amountOf(missing, quantity, unitsLabel);
  const reasons = Object.entries(data.gruende ?? {}).filter(([, values]) => valueOf(values, quantity) > 0);
  return (
    <div className="map-unassigned" tabIndex={0} aria-describedby="map-unassigned-details">
      <Info size={13} aria-hidden="true" />
      <span>
        Nicht auf der Karte:{' '}
        <strong className="tabular">
          {amount.value} {amount.unit}
        </strong>
      </span>
      <div className="map-unassigned__details" id="map-unassigned-details" role="tooltip">
        <p>Diese Mengen fehlen auf der Karte, weil das Register sie keiner Fläche dieser Ebene zuordnet:</p>
        <ul>
          {reasons.map(([reason, values]) => {
            const part = amountOf(values, quantity, unitsLabel);
            return (
              <li key={reason}>
                <strong className="tabular">
                  {part.value} {part.unit}
                </strong>
                {quantity !== 'anzahl' && ` · ${counted(values.total_units, unitsLabel)}`} {REASONS[reason]}
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
