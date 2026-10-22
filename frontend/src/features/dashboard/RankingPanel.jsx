import ChartPlaceholder from '../../components/ui/ChartPlaceholder';
import { ChartFoot } from '../../components/ui/ChartExport';
import { round } from '../../lib/files';
import { formatFixed } from '../../lib/format';

// How many areas the Rangliste lists: every Land (16, offshore wind the 17th), of the other levels the first 12
const TOP_N = 12;
const listsAll = (granularity) => granularity.id === 'bundesland';

// The areas of the Rangliste: those with data within the scope, the largest first
function rankedOf(features, metric, within) {
  return (features ?? [])
    .filter((f) => f.properties._hasData && (!within || f.properties.ags.startsWith(within.key)))
    .sort((a, b) => (b.properties[metric.id] ?? 0) - (a.properties[metric.id] ?? 0));
}

// The Rangliste's title: "Alle Bundesländer", "Top 12 · Landkreise" (fewer than 12: all of them)
export function rankingTitle(features, metric, granularity, within) {
  const count = rankedOf(features, metric, within).length;
  if (listsAll(granularity) || (count > 0 && count <= TOP_N)) return `Alle ${granularity.label}`;
  return `Top ${TOP_N} · ${granularity.label}`;
}

// within: the scope the areas compete in ({ key, name }, e.g. the Land for its Landkreise), null for all of Deutschland.
// focusKey: the area in scope itself (highlighted, not clickable). color: of the bars (the map's ramp). fileBase: of the
// CSV, which ranks all of them. Each row: rank, name and value on a line, the bar below them across the whole width –
// the narrow rail beside the map has room for both.
export default function RankingPanel({ features, metric, granularity, within, focusKey, status, labelFor, onRowClick, color, fileBase }) {
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

  const all = rankedOf(features, metric, within);
  const ranked = listsAll(granularity) ? all : all.slice(0, TOP_N);
  const top = ranked[0]?.properties[metric.id] || 1;
  const csv = {
    name: 'rangliste',
    filename: fileBase,
    rows: () =>
      all.map((f, i) => ({
        Rang: i + 1,
        Name: labelFor(f),
        Schlüssel: f.properties._key,
        [`${metric.legend} (${metric.unit})`]: round(f.properties[metric.id] ?? 0),
      })),
  };

  return (
    <>
      <ol className="ranking" aria-label={`Rangliste nach ${metric.legend} (${metric.unit})`} style={color ? { '--ranking-color': color } : undefined}>
        {ranked.map((f, i) => {
          const value = f.properties[metric.id] ?? 0;
          const isFocus = focusKey != null && f.properties.ags === focusKey;
          const clickable = Boolean(onRowClick) && !isFocus;
          const Row = clickable ? 'button' : 'div';
          return (
            <li key={f.properties._key} className={isFocus ? 'is-focus' : undefined}>
              <Row
                className={`ranking__row${clickable ? ' is-clickable' : ''}`}
                {...(clickable ? { type: 'button', onClick: () => onRowClick(f) } : {})}
              >
                <span className="ranking__rank tabular">{i + 1}</span>
                <span className="ranking__name">{labelFor(f)}</span>
                <span className="ranking__value tabular">
                  {formatFixed(value, metric.digits)} <span className="ranking__unit">{metric.unit}</span>
                </span>
                <span className="ranking__bar" aria-hidden="true">
                  <span style={{ width: `${Math.max(1.5, (value / top) * 100)}%` }} />
                </span>
              </Row>
            </li>
          );
        })}
      </ol>
      {all.length > 0 && <ChartFoot csv={csv} />}
    </>
  );
}
