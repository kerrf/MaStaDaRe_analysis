import ChartPlaceholder from '../../components/ui/ChartPlaceholder';
import { API_BASE_URL } from '../../config/site';
import { RAMPS, inkOn, makeColorScale } from '../../lib/colorScale';
import { useStats } from '../../lib/data';
import { formatAmount, formatCount, formatShare } from '../../lib/format';

// The compass directions clockwise from north, by the keys of mrt.solar_orientation
const DIRECTIONS = [
  { id: 'nord', short: 'N', label: 'Nord' },
  { id: 'nordost', short: 'NO', label: 'Nordost' },
  { id: 'ost', short: 'O', label: 'Ost' },
  { id: 'suedost', short: 'SO', label: 'Südost' },
  { id: 'sued', short: 'S', label: 'Süd' },
  { id: 'suedwest', short: 'SW', label: 'Südwest' },
  { id: 'west', short: 'W', label: 'West' },
  { id: 'nordwest', short: 'NW', label: 'Nordwest' },
];
// No single direction: the two halves of the centre
const CENTRE = [
  { id: 'ost_west', label: 'Ost-West', sign: -1 },
  { id: 'nachgefuehrt', label: 'Nachgeführt', sign: 1 },
];

const OUTER = 150; // radius of the ring
const INNER = 66; // radius of the centre
const MID = (OUTER + INNER) / 2;
const LABEL = OUTER + 17; // radius of the direction letters
const SIZE = LABEL + 14;

const point = (radius, degrees) => {
  const angle = (degrees * Math.PI) / 180;
  return [radius * Math.sin(angle), -radius * Math.cos(angle)];
};

// A 45° sector of the ring, centred on its bearing (0° = north, clockwise)
function sector(bearing) {
  const [[x0, y0], [x1, y1]] = [point(OUTER, bearing - 22.5), point(OUTER, bearing + 22.5)];
  const [[x2, y2], [x3, y3]] = [point(INNER, bearing + 22.5), point(INNER, bearing - 22.5)];
  return `M${x0},${y0}A${OUTER},${OUTER} 0 0 1 ${x1},${y1}L${x2},${y2}A${INNER},${INNER} 0 0 0 ${x3},${y3}Z`;
}

// The upper (sign -1) or lower (1) half of the centre
const half = (sign) => `M${sign * INNER},0A${INNER},${INNER} 0 0 1 ${-sign * INNER},0Z`;

function Values({ x, y, row, share, fill }) {
  const ink = inkOn(fill);
  return (
    <text x={x} y={y} textAnchor="middle" style={{ fill: ink }}>
      <tspan className="rose__power" x={x} dy="-0.15em">
        {formatAmount(row.total_power, 'MW')}
      </tspan>
      <tspan className="rose__share" x={x} dy="1.3em">
        {formatShare(share)}
      </tspan>
    </text>
  );
}

// Solar power by the main orientation of the modules, in the scope (mrt.solar_orientation): the eight compass
// directions around the circle, Ost-West and tracking systems in its centre, unknown ones below it.
export default function OrientationRose({ path, region }) {
  const stats = useStats(`${API_BASE_URL}${path}?region=${region}`);
  if (stats.status === 'error') {
    return <ChartPlaceholder variant="radial" title="Keine Daten" note="Die Ausrichtung konnte nicht geladen werden." />;
  }
  if (stats.status !== 'ready') return <ChartPlaceholder variant="radial" title="Wird geladen …" />;

  const byId = Object.fromEntries(stats.data.map((row) => [row.orientation, row]));
  const rowOf = (id) => byId[id] ?? { orientation: id, total_units: 0, total_power: 0 };
  const total = stats.data.reduce((sum, row) => sum + row.total_power, 0);
  const units = stats.data.reduce((sum, row) => sum + row.total_units, 0);
  if (!units) return <ChartPlaceholder variant="radial" title="Keine Anlagen" note="In diesem Gebiet ist keine Solaranlage in Betrieb." />;

  const shareOf = (id) => rowOf(id).total_power / total;
  // Darker = larger share, on the Erzeuger ramp; the largest known orientation is the darkest
  const colorFor = makeColorScale(RAMPS.orange, Math.max(...[...DIRECTIONS, ...CENTRE].map((o) => shareOf(o.id))));
  const unknown = rowOf('unbekannt');
  const tooltip = (label, id) =>
    `${label}: ${formatAmount(rowOf(id).total_power, 'MW')} (${formatShare(shareOf(id))}) · ${formatCount(rowOf(id).total_units)} Anlagen`;

  return (
    <div className="rose">
      <svg viewBox={`${-SIZE} ${-SIZE} ${2 * SIZE} ${2 * SIZE}`} role="img" aria-label="Solarleistung nach Ausrichtung der Module">
        {DIRECTIONS.map((direction, i) => {
          const bearing = i * 45;
          const fill = colorFor(shareOf(direction.id));
          const [x, y] = point(MID, bearing);
          const [lx, ly] = point(LABEL, bearing);
          return (
            <g key={direction.id} className="rose__part">
              <title>{tooltip(direction.label, direction.id)}</title>
              <path d={sector(bearing)} style={{ fill }} />
              <Values x={x} y={y} row={rowOf(direction.id)} share={shareOf(direction.id)} fill={fill} />
              <text className="rose__direction" x={lx} y={ly} dy="0.35em" textAnchor="middle">
                {direction.short}
              </text>
            </g>
          );
        })}
        {CENTRE.map((part) => {
          const fill = colorFor(shareOf(part.id));
          const y = part.sign * INNER * 0.5;
          return (
            <g key={part.id} className="rose__part">
              <title>{tooltip(part.label, part.id)}</title>
              <path d={half(part.sign)} style={{ fill }} />
              <text className="rose__centre-label" x={0} y={y - 17} textAnchor="middle" style={{ fill: inkOn(fill) }}>
                {part.label}
              </text>
              <Values x={0} y={y + 5} row={rowOf(part.id)} share={shareOf(part.id)} fill={fill} />
            </g>
          );
        })}
      </svg>

      <div className="rose__foot">
        <span title="Keine Ausrichtung im Marktstammdatenregister: meist Balkonkraftwerke, deren vereinfachte Registrierung sie nicht abfragt">
          <span className="rose__swatch" /> Unbekannt <strong>{formatAmount(unknown.total_power, 'MW')}</strong> · {formatShare(shareOf('unbekannt'))}
        </span>
        <span>
          Gesamt <strong>{formatAmount(total, 'MW')}</strong> · {formatCount(units)} Anlagen
        </span>
      </div>
      <p className="rose__note">
        Nach Hauptausrichtung der Module. Unbekannt: keine Angabe im MaStR – meist Balkonkraftwerke, deren vereinfachte
        Registrierung die Ausrichtung nicht abfragt.
      </p>
    </div>
  );
}
