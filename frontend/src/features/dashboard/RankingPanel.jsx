import ChartPlaceholder from '../../components/ui/ChartPlaceholder';
import { formatFixed } from '../../lib/format';

const TOP_N = 10;

// within: the scope the areas compete in ({ key, name }, e.g. the Land for its Landkreise), null for all of Deutschland.
// focusKey: the area in scope itself (highlighted, not clickable).
export default function RankingPanel({ features, metric, granularity, within, focusKey, status, labelFor, onRowClick }) {
  if (status === 'unavailable') return <ChartPlaceholder variant="rows" note="Sobald Daten vorliegen, erscheint hier die Rangliste." />;
  if (status === 'error') return <ChartPlaceholder variant="rows" title="Keine Daten" note="Die Rangliste konnte nicht geladen werden." />;
  if (status !== 'ready' || !features) return <ChartPlaceholder variant="rows" title="Wird geladen …" />;
  // Kreise and Gemeinden lie within a scope when their key starts with the scope's.
  if (within && granularity.featureKey !== 'ags') {
    return (
      <ChartPlaceholder
        variant="rows"
        title="Regionsfilter folgt"
        note={`${granularity.label} lassen sich noch nicht ${within.name} zuordnen.`}
      />
    );
  }

  const ranked = features
    .filter((f) => f.properties._hasData && (!within || f.properties.ags.startsWith(within.key)))
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
          const isFocus = focusKey != null && f.properties.ags === focusKey;
          const clickable = onRowClick && !isFocus;
          return (
            <tr
              key={f.properties._key}
              className={`${clickable ? 'is-clickable' : ''}${isFocus ? ' is-focus' : ''}`}
              onClick={clickable ? () => onRowClick(f) : undefined}
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
                  {formatFixed(value, metric.digits)} <span className="ranking__unit">{metric.unit}</span>
                </span>
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
