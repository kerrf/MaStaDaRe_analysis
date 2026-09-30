import Badge from '../../components/ui/Badge';
import ChartPlaceholder from '../../components/ui/ChartPlaceholder';
import OrientationRose from './OrientationRose';
import SizeDistribution from './SizeDistribution';

// Analyses with data, by `kind`: the chart, where its data comes from, and what the card's subtitle says
const VIEWS = {
  sizes: {
    Chart: SizeDistribution,
    path: (analysis, technology) => technology.sizesPath,
    subtitle: (technology) => `${technology.label}, Anteile je Leistungsklasse`,
  },
  orientation: {
    Chart: OrientationRose,
    path: (analysis) => analysis.path,
    subtitle: () => 'Leistung nach Hauptausrichtung der Module',
  },
};

// One analysis card in the scope (region: "DE", a Land or a Kreis key): its chart, or a placeholder while the active
// technology has no data for it.
export default function AnalysisCard({ analysis, technology, region, scopeName }) {
  const view = VIEWS[analysis.kind];
  const path = view?.path(analysis, technology);
  return (
    <article className="card">
      <header className="card__header">
        <div>
          <h3 className="card__title">{analysis.title}</h3>
          <div className="card__subtitle">{path ? `${scopeName} · ${view.subtitle(technology)}` : analysis.description}</div>
        </div>
        {!path && (
          <Badge tone="soon" size="xs">
            bald
          </Badge>
        )}
      </header>
      <div className="card__body">{path ? <view.Chart path={path} region={region} /> : <ChartPlaceholder variant={analysis.variant} />}</div>
    </article>
  );
}
