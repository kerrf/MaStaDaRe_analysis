import AnalysisCard from './AnalysisCard';
import AnalysesNav from './AnalysesNav';
import PvSpeicherAnalysis from './PvSpeicherAnalysis';
import ScopeBar from './ScopeBar';
import SelectionBar from './SelectionBar';
import { selectionOf } from './useDashboardState';

const ofPage = (analyses) => (analyses ?? []).filter((a) => a.view === 'anlagen');
// Analyses of a single technology in the scope: as cards, two side by side
const isCard = (a) => a.kind === 'sizes' || a.kind === 'orientation';

// The page "Anlagen" of a dashboard: what the plants are like – size classes and orientation of the active technology in
// the scope, and the batteries at solar units (Germany-wide)
export default function AnlagenView({ config, state }) {
  const { technology, region, kreisAgs, kreisOptions, selectScope, gemeindeAgs, gemeindeOptions, selectGemeinde } = state;
  const analyses = [...ofPage(config.analyses), ...ofPage(technology.analyses)];
  const cards = analyses.filter(isCard);
  const panels = analyses.filter((a) => a.kind === 'pv-speicher');
  // Technologies to choose from: those with analyses of their own here (Erzeuger: size classes, Ausrichtung)
  const perTechnology = ofPage(config.analyses).some(isCard) || config.technologies.some((t) => ofPage(t.analyses).length);
  const technologies = perTechnology ? config.technologies.filter((t) => !t.plantsPath) : [];
  // The batteries at solar units follow solar's choice (Anlagenart, Leistung) where the dashboard has solar
  const solar = config.technologies.find((t) => t.id === 'solar');
  const pv = solar ? selectionOf(solar, state.searchParams) : { subtypes: null, leistung: null };

  return (
    <>
      {cards.length > 0 && (
        <ScopeBar
          region={region}
          kreis={kreisAgs}
          kreisOptions={kreisOptions}
          onSelectScope={selectScope}
          gemeinde={gemeindeAgs}
          gemeindeOptions={gemeindeOptions}
          onSelectGemeinde={selectGemeinde}
        />
      )}
      {technologies.length > 0 && <SelectionBar technologies={technologies} state={state} />}
      <AnalysesNav
        links={[...(cards.length ? [{ id: 'analyse-anlagen', title: cards.map((a) => a.title).join(' · '), icon: technology.icon }] : []), ...panels.map((a) => ({ id: `analyse-${a.id}`, title: a.title, icon: a.icon }))]}
      />
      {cards.length > 0 && (
        <div id="analyse-anlagen" className={`analyses-grid${cards.length > 1 ? ' analyses-grid--pairs' : ' analyses-grid--single'}`}>
          {cards.map((a) => (
            <AnalysisCard
              key={a.id}
              analysis={a}
              technology={technology}
              region={state.scopeKey}
              scopeName={state.scopeName}
              query={state.selectionQuery}
            />
          ))}
        </div>
      )}
      {panels.map((a) => (
        <PvSpeicherAnalysis key={a.id} analysis={a} subtypes={pv.subtypes} leistung={pv.leistung} ramp={config.ramp} anchor={`analyse-${a.id}`} />
      ))}
    </>
  );
}
