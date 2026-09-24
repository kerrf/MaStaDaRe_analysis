import ChartPlaceholder from '../../components/ui/ChartPlaceholder';
import { formatNumber } from '../../lib/format';

const TOP_N = 10;

export default function RankingPanel({ features, metric, granularity, region, status, labelFor, onRowClick }) {
  if (status === 'unavailable') return <ChartPlaceholder variant="rows" note="Sobald Daten vorliegen, erscheint hier die Rangliste." />;
  if (status === 'error') return <ChartPlaceholder variant="rows" title="Keine Daten" note="Die Rangliste konnte nicht geladen werden." />;
  if (status === 'heatmap') {
    return <ChartPlaceholder variant="rows" title="Keine Regionen" note="Für eine Rangliste bitte eine flächige Auflösung wählen." />;
  }
  if (status !== 'ready' || !features) return <ChartPlaceholder variant="rows" title="Wird geladen …" />;
  if (region && granularity.id !== 'bundesland') {
    return (
      <ChartPlaceholder
        variant="rows"
        title="Regionsfilter folgt"
        note={`${granularity.label} lassen sich noch nicht ${region.name} zuordnen.`}
      />
    );
  }

  const ranked = features
    .filter((f) => f.properties._hasData)
    .sort((a, b) => (b.properties[metric.id] ?? 0) - (a.properties[metric.id] ?? 0))
    .slice(0, TOP_N);
  const top = ranked[0]?.properties[metric.id] || 1;

  return (
    <table className="ranking">
      <caption className="visually-hidden">
        Top {TOP_N} nach {metric.legend} ({metric.unit})
      </caption>
      <thead className="visually-hidden">
        <tr>
          <th scope="col">Rang</th>
          <th scope="col">Region</th>
          <th scope="col">{metric.legend}</th>
        </tr>
      </thead>
      <tbody>
        {ranked.map((f, i) => {
          const value = f.properties[metric.id] ?? 0;
          const isFocus = region && f.properties.id === region.mapId;
          return (
            <tr
              key={f.properties._key}
              className={`${onRowClick ? 'is-clickable' : ''}${isFocus ? ' is-focus' : ''}`}
              onClick={onRowClick ? () => onRowClick(f) : undefined}
            >
              <td className="ranking__rank tabular">{i + 1}</td>
              <th scope="row" className="ranking__name">
                {labelFor(f)}
              </th>
              <td className="ranking__value">
                <div className="ranking__bar" aria-hidden="true">
                  <span style={{ width: `${Math.max(2, (value / top) * 100)}%` }} />
                </div>
                <span className="tabular">
                  {formatNumber(value, metric.digits)} <span className="ranking__unit">{metric.unit}</span>
                </span>
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
