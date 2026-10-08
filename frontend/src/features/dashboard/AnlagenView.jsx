import AnalysisCard from './AnalysisCard';
import AnalysesNav from './AnalysesNav';
import OrientationTiltAnalysis from './OrientationTiltAnalysis';
import PvSpeicherAnalysis from './PvSpeicherAnalysis';
import ScopeBar from './ScopeBar';
import SelectionBar from './SelectionBar';
import { selectionOf } from './useDashboardState';

const ofPage = (analyses) => (analyses ?? []).filter((a) => a.view === 'anlagen');
// Analyses of a single technology in the scope: as cards, two side by side
const isCard = (a) => a.kind === 'sizes' || a.kind === 'orientation' || a.kind === 'kinds';

// The page "Anlagen" of a dashboard: what the plants are like – of the active technology in the scope, as cards: size
// classes and orientation (solar), size classes and kinds (batteries: technology and coupling; gas: technology or
// Speicherart); then as wide panels the orientation per tilt (solar, in the scope) and the batteries at solar units
// (Germany-wide), in the order of the config
export default function AnlagenView({ config, state }) {
  const { region, kreisAgs, kreisOptions, selectScope, gemeindeAgs, gemeindeOptions, selectGemeinde } = state;
  // Technologies to choose from: those with cards of their own here (batteries, gas), and with the dashboard's cards
  // (Erzeuger: the size classes) every one that isn't shown as sites
  const forAll = ofPage(config.analyses).some(isCard);
  const technologies = config.technologies.filter((t) => ofPage(t.analyses).some(isCard) || (forAll && !t.plantsPath));
  // The active one, or the first that has something here (Speicher: batteries while the map shows Pumpspeicher)
  const technology = technologies.find((t) => t.id === state.technology.id) ?? technologies[0] ?? state.technology;
  const query = technology === state.technology ? state.selectionQuery : '';
  const analyses = [...ofPage(config.analyses), ...ofPage(technology.analyses)];
  const cards = analyses.filter(isCard);
  const panels = analyses.filter((a) => a.kind === 'orientation-tilt' || a.kind === 'pv-speicher');
  // The choice only where there is one: more than one technology, or one with filters
  const choice = technologies.length > 1 || technologies.some((t) => t.subtypes || t.leistung);
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
      {choice && <SelectionBar technologies={technologies} state={state} />}
      <AnalysesNav
        links={[...(cards.length ? [{ id: 'analyse-anlagen', title: cards.map((a) => a.title).join(' · '), icon: technology.icon }] : []), ...panels.map((a) => ({ id: `analyse-${a.id}`, title: a.title, icon: a.icon }))]}
      />
      {cards.length > 0 && (
        <div id="analyse-anlagen" className={`analyses-grid${cards.length > 1 ? ' analyses-grid--pairs' : ' analyses-grid--single'}`}>
          {cards.map((a) => (
            <AnalysisCard key={a.id} analysis={a} technology={technology} region={state.scopeKey} scopeName={state.scopeName} query={query} />
          ))}
        </div>
      )}
      {panels.map((a) =>
        a.kind === 'orientation-tilt' ? (
          <OrientationTiltAnalysis
            key={a.id}
            analysis={a}
            region={state.scopeKey}
            scopeName={state.scopeName}
            query={query}
            fileBase={`mastr_${technology.id}`}
            anchor={`analyse-${a.id}`}
          />
        ) : (
          <PvSpeicherAnalysis key={a.id} analysis={a} subtypes={pv.subtypes} leistung={pv.leistung} ramp={config.ramp} anchor={`analyse-${a.id}`} />
        ),
      )}
    </>
  );
}
