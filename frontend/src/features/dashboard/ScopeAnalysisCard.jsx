import { useState } from 'react';
import { X } from 'lucide-react';
import SegmentedControl from '../../components/ui/SegmentedControl';
import { scopeAnalysesOf } from '../../config/dashboards';
import OrientationRose from './OrientationRose';
import SizeDistribution from './SizeDistribution';

const CHARTS = { ausrichtung: OrientationRose, groesse: SizeDistribution };

/**
 * Next to the map's Top 10: the orientation or the size classes of the area the map shows (Deutschland, a Land, a Kreis)
 * or of the area clicked in it (picked: { key, name }, e.g. a Gemeinde of the Kreis), which onClearPick lets go again.
 * query: the technology's selection (Anlagenart, Leistung, Lage), passed on to the API.
 */
export default function ScopeAnalysisCard({ technology, scopeKey, scopeName, picked, onClearPick, query }) {
  const analyses = scopeAnalysesOf(technology);
  const [chosen, setChosen] = useState(analyses[0]?.id);
  const analysis = analyses.find((a) => a.id === chosen) ?? analyses[0];
  if (!analysis) return null;
  const Chart = CHARTS[analysis.id];
  const region = picked?.key ?? scopeKey;
  const name = picked?.name ?? scopeName;

  return (
    <article className="card scope-analysis">
      <header className="card__header">
        <div>
          <h3 className="card__title">
            {analysis.label} · {name}
          </h3>
          <div className="card__subtitle">{analysis.what}</div>
        </div>
        {analyses.length > 1 && (
          <SegmentedControl label="Auswertung" options={analyses.map(({ id, label }) => ({ id, label }))} value={analysis.id} onChange={setChosen} />
        )}
      </header>
      {picked && (
        <div className="scope-analysis__pick">
          Ausgewählt auf der Karte: <strong>{picked.name}</strong>
          <button type="button" className="scope-analysis__clear" onClick={onClearPick}>
            <X size={14} aria-hidden="true" /> zurück zu {scopeName}
          </button>
        </div>
      )}
      <div className="card__body">
        <Chart key={`${analysis.id}-${region}`} path={analysis.path} region={region} query={query} />
      </div>
    </article>
  );
}
