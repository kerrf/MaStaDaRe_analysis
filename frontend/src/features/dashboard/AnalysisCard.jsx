import Badge from '../../components/ui/Badge';
import ChartPlaceholder from '../../components/ui/ChartPlaceholder';
import KindShares from './KindShares';
import OrientationRose from './OrientationRose';
import SizeDistribution from './SizeDistribution';

// Analyses with data, by `kind`: the chart, where its data comes from, and what the card's subtitle says (an analysis'
// own `what` before the kind's)
const VIEWS = {
  sizes: {
    Chart: SizeDistribution,
    // Its own endpoint (batteries, gas), else the technology's size classes
    path: (analysis, technology) => analysis.path ?? technology.sizesPath,
    subtitle: (technology) => `${technology.label}: Leistung und Anlagen je Leistungsklasse`,
  },
  orientation: {
    Chart: OrientationRose,
    path: (analysis) => analysis.path,
    subtitle: () => 'Leistung nach Hauptausrichtung der Module',
  },
  // A ring per kind of the units (batteries: technology and coupling; gas: technology or Speicherart)
  kinds: {
    Chart: KindShares,
    path: (analysis) => analysis.path,
    subtitle: () => '',
  },
};

// One analysis card in the scope (region: "DE", a Land or a Kreis key): its chart, or a placeholder while the active
// technology has no data for it. query: the technology's selection (Anlagenart, Brutto/Netto), passed on to the API.
// The analysis' measure, unitsLabel, groups and measures go to its chart.
export default function AnalysisCard({ analysis, technology, region, scopeName, query }) {
  const view = VIEWS[analysis.kind];
  const path = view?.path(analysis, technology);
  const { measure, unitsLabel, groups, measures } = analysis;
  return (
    <article className="card">
      <header className="card__header">
        <div>
          <h3 className="card__title">{analysis.title}</h3>
          <div className="card__subtitle">{path ? `${scopeName} · ${analysis.what ?? view.subtitle(technology)}` : analysis.description}</div>
        </div>
        {!path && (
          <Badge tone="soon" size="xs">
            bald
          </Badge>
        )}
      </header>
      <div className="card__body">
        {path ? (
          <view.Chart
            path={path}
            region={region}
            query={query}
            measure={measure}
            unitsLabel={unitsLabel}
            groups={groups}
            measures={measures}
            fileBase={`mastr_${technology.id}`}
          />
        ) : (
          <ChartPlaceholder variant={analysis.variant} />
        )}
      </div>
    </article>
  );
}
