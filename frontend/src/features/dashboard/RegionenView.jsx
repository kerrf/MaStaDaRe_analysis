import { regionTablesOf } from '../../config/dashboards';
import RegionProfile from './RegionProfile';
import RegionTable from './RegionTable';
import ScopeBar from './ScopeBar';
import SelectionBar from './SelectionBar';

// The page "Regionen" of a dashboard: the Steckbrief of the scope (every technology, ranked and compared), and its parts
// side by side (Länder of Germany, Kreise of a Land, Gemeinden of a Kreis) for a technology's analyses
export default function RegionenView({ config, state }) {
  const { region, kreisAgs, kreisOptions, selectScope, technology } = state;
  const withTables = config.technologies.filter((t) => regionTablesOf(t).length);

  return (
    <>
      <ScopeBar region={region} kreis={kreisAgs} kreisOptions={kreisOptions} onSelectScope={selectScope} />
      <RegionProfile config={config} state={state} />
      {withTables.length > 0 && (
        <section className="dashboard-analyses" aria-label="Gebiete im Vergleich">
          <SelectionBar technologies={withTables} state={state} />
          {regionTablesOf(technology).length ? (
            <RegionTable
              technology={technology}
              scopeKey={state.scopeKey}
              scopeName={state.scopeName}
              selectionQuery={state.selectionQuery}
              ramp={config.ramp}
              fileBase={`mastr_${config.id}_${technology.id}`}
              anchor="analyse-gebiete"
            />
          ) : (
            <p className="dashboard-analyses__empty">Für {technology.label} gibt es noch keine Tabellen je Gebiet.</p>
          )}
        </section>
      )}
    </>
  );
}
