import { X } from 'lucide-react';
import OrientationRose from './OrientationRose';
import SizeDistribution from './SizeDistribution';

const CHARTS = { ausrichtung: OrientationRose, groesse: SizeDistribution };
const RANKING = 'rangliste';

/**
 * Right of the map, as high as the map: what it shows in words and numbers, in tabs – the Rangliste of its areas, and the
 * technology's analyses of one area (config scopeAnalysesOf: Ausrichtung, Anlagengröße) of the area in view, or of the
 * one clicked on the map (picked: { key, name }, let go by onClearPick).
 *
 * ranking: the Rangliste (RankingPanel), with its title and subtitle; query: the technology's selection for the API
 */
export default function MapRail({ analyses, tab, onTab, ranking, rankingTitle, rankingSubtitle, scopeKey, scopeName, picked, onClearPick, query }) {
  const tabs = [{ id: RANKING, label: 'Rangliste' }, ...analyses.map(({ id, label }) => ({ id, label }))];
  const current = tabs.find((t) => t.id === tab) ?? tabs[0];
  const analysis = analyses.find((a) => a.id === current.id);
  const region = picked?.key ?? scopeKey;
  const name = picked?.name ?? scopeName;
  const Chart = analysis && CHARTS[analysis.id];

  return (
    <aside className="map-rail" aria-label="Auswertungen zur Karte">
      {tabs.length > 1 && (
        <div className="map-rail__tabs" role="tablist" aria-label="Auswertung">
          {tabs.map((t) => {
            const active = t.id === current.id;
            return (
              <button
                key={t.id}
                type="button"
                role="tab"
                id={`map-rail-tab-${t.id}`}
                aria-selected={active}
                aria-controls="map-rail-panel"
                className={`map-rail__tab${active ? ' is-active' : ''}`}
                onClick={() => onTab(t.id)}
              >
                {t.label}
              </button>
            );
          })}
        </div>
      )}
      <div className="map-rail__body" id="map-rail-panel" role={tabs.length > 1 ? 'tabpanel' : undefined} aria-labelledby={tabs.length > 1 ? `map-rail-tab-${current.id}` : undefined}>
        <header className="map-rail__head">
          <h3 className="map-rail__title">{analysis ? `${analysis.label} · ${name}` : rankingTitle}</h3>
          <p className="map-rail__subtitle">{analysis ? analysis.what : rankingSubtitle}</p>
        </header>
        {analysis && picked && (
          <div className="map-rail__pick">
            <span>
              Auf der Karte gewählt: <strong>{picked.name}</strong>
            </span>
            <button type="button" className="map-rail__clear" onClick={onClearPick}>
              <X size={13} aria-hidden="true" /> {scopeName}
            </button>
          </div>
        )}
        {analysis ? <Chart key={`${analysis.id}-${region}`} path={analysis.path} region={region} query={query} /> : ranking}
      </div>
    </aside>
  );
}
