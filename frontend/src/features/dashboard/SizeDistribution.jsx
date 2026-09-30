import ChartPlaceholder from '../../components/ui/ChartPlaceholder';
import { API_BASE_URL } from '../../config/site';
import { useStats } from '../../lib/data';
import { formatAmount, formatCount, formatShare } from '../../lib/format';

function Share({ share, scale, amount, kind }) {
  return (
    <div className="sizes__share">
      <div className="sizes__bar">
        <span className={`sizes__fill sizes__fill--${kind}`} style={{ width: `${(share / scale) * 100}%` }} />
      </div>
      <div className="sizes__value">
        <strong>{formatShare(share)}</strong> {amount}
      </div>
    </div>
  );
}

// Share of the power and of the units per size class of the active technology, in the scope (mrt.size_distribution).
export default function SizeDistribution({ path, region }) {
  const stats = useStats(`${API_BASE_URL}${path}?region=${region}`);
  if (stats.status === 'error') {
    return <ChartPlaceholder variant="bars" title="Keine Daten" note="Die Verteilung konnte nicht geladen werden." />;
  }
  if (stats.status !== 'ready') return <ChartPlaceholder variant="bars" title="Wird geladen …" />;

  const rows = stats.data;
  const units = rows.reduce((sum, row) => sum + row.total_units, 0);
  const power = rows.reduce((sum, row) => sum + row.total_power, 0);
  if (!units) return <ChartPlaceholder variant="bars" title="Keine Anlagen" note="In diesem Gebiet ist keine Anlage in Betrieb." />;

  const shares = rows.map((row) => ({ ...row, power: row.total_power / power, units: row.total_units / units }));
  // One scale for both columns: how a class's share of the power compares to its share of the units shows at a glance
  const scale = Math.max(...shares.flatMap((row) => [row.power, row.units]));

  return (
    <table className="sizes">
      <thead>
        <tr>
          <th scope="col">Leistungsklasse</th>
          <th scope="col">
            <span className="sizes__key sizes__fill--power" /> Leistung
          </th>
          <th scope="col">
            <span className="sizes__key sizes__fill--units" /> Anlagen
          </th>
        </tr>
      </thead>
      <tbody>
        {shares.map((row) => (
          <tr key={row.size_class}>
            <th scope="row">
              <span className="sizes__label">{row.label}</span>
              {row.hint && <span className="sizes__hint">{row.hint}</span>}
            </th>
            <td>
              <Share share={row.power} scale={scale} amount={formatAmount(row.total_power, 'MW')} kind="power" />
            </td>
            <td>
              <Share share={row.units} scale={scale} amount={formatCount(row.total_units)} kind="units" />
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
