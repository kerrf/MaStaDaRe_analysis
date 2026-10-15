import RegistrationDelayAnalysis from './RegistrationDelayAnalysis';
import ScopeBar from './ScopeBar';
import RegistrationsAnalysis from './RegistrationsAnalysis';
import TimelineAnalysis from './TimelineAnalysis';
import { selectionOf } from './useDashboardState';

// The page "Zubau & Registrierungen" of a dashboard, in Deutschland, a Land or a Kreis (the Gebiet in the header, like the
// other pages; no Gemeinde): Ausbau im Zeitverlauf, Registrierungen im MaStR and Abstand zwischen Inbetriebnahmen und
// Registierung, one below the other
export default function ZubauView({ config, state }) {
  const { region, kreisAgs, kreisOptions, selectScope, scopeKey, scopeName } = state;
  const analyses = config.analyses.filter((a) => a.view === 'zubau');
  // The solar Leistung (Netto or Brutto) of the timeline: solar's choice in the URL, switchable on the timeline itself
  const solar = config.technologies.find((t) => t.leistung);
  const leistung = solar ? selectionOf(solar, state.searchParams).leistung : null;
  const onLeistung = solar ? (id) => state.setParam(solar.leistung.param, id, solar.leistung.options[0].id) : undefined;

  return (
    <div className="dashboard-page">
      <ScopeBar region={region} kreis={kreisAgs} kreisOptions={kreisOptions} onSelectScope={selectScope} />
      {analyses.map((a) => {
        const anchor = `analyse-${a.id}`;
        if (a.timeline) {
          return (
            <TimelineAnalysis
              key={a.id}
              analysis={a}
              leistung={leistung}
              leistungOption={solar?.leistung}
              onLeistung={onLeistung}
              region={scopeKey}
              scopeName={scopeName}
              anchor={anchor}
              fileBase={`mastr_${config.id}`}
            />
          );
        }
        if (a.kind === 'registrations') {
          return <RegistrationsAnalysis key={a.id} analysis={a} region={scopeKey} scopeName={scopeName} anchor={anchor} />;
        }
        if (a.kind === 'registration-delay') {
          return (
            <RegistrationDelayAnalysis key={a.id} analysis={a} region={scopeKey} scopeName={scopeName} anchor={anchor} />
          );
        }
        return null;
      })}
    </div>
  );
}
