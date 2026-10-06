import RegistrationDelayAnalysis from './RegistrationDelayAnalysis';
import RegistrationsAnalysis from './RegistrationsAnalysis';
import TimelineAnalysis from './TimelineAnalysis';
import AnalysesNav from './AnalysesNav';
import { selectionOf } from './useDashboardState';

// The page "Zubau & Registrierungen" of a dashboard, Germany-wide: Zubau im Zeitverlauf, Registrierungen im MaStR and
// Zeit bis zur Registrierung, one below the other
export default function ZubauView({ config, state }) {
  const analyses = config.analyses.filter((a) => a.view === 'zubau');
  // The solar Leistung (Netto or Brutto) of the timeline: solar's choice in the URL, switchable on the timeline itself
  const solar = config.technologies.find((t) => t.leistung);
  const leistung = solar ? selectionOf(solar, state.searchParams).leistung : null;
  const onLeistung = solar ? (id) => state.setParam(solar.leistung.param, id, solar.leistung.options[0].id) : undefined;

  return (
    <div className="dashboard-page">
      <AnalysesNav links={analyses.map((a) => ({ id: `analyse-${a.id}`, title: a.title, icon: a.icon }))} />
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
              anchor={anchor}
              fileBase={`mastr_${config.id}`}
            />
          );
        }
        if (a.kind === 'registrations') return <RegistrationsAnalysis key={a.id} analysis={a} initial={state.technology.id} anchor={anchor} />;
        if (a.kind === 'registration-delay') {
          return <RegistrationDelayAnalysis key={a.id} analysis={a} initial={state.technology.id} anchor={anchor} />;
        }
        return null;
      })}
    </div>
  );
}
