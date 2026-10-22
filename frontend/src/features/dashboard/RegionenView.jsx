import { regionTablesOf } from '../../config/dashboards';
import RegionTable from './RegionTable';
import ScopeBar from './ScopeBar';
import SelectionBar from './SelectionBar';
import { selectionOf } from './useDashboardState';

// The page "Regionen im Vergleich" of a dashboard: the parts of the scope side by side (Länder of Germany, Kreise of a
// Land, Gemeinden of a Kreis) for a technology's analyses. The scope itself, a technology at a time: Überblick.
export default function RegionenView({ config, state }) {
  const { region, kreisAgs, kreisOptions, selectScope } = state;
  const withTables = config.technologies.filter((t) => regionTablesOf(t).length);
  // The active technology, or the first with tables (Speicher: the batteries while the map shows Pumpspeicher), so the
  // table is always there, with its own selection (Anlagenart, Leistung)
  const technology = withTables.find((t) => t.id === state.technology.id) ?? withTables[0];
  const selectionQuery = selectionOf(technology, state.searchParams).query;

  return (
    <>
      <ScopeBar region={region} kreis={kreisAgs} kreisOptions={kreisOptions} onSelectScope={selectScope} />
      {withTables.length > 0 && (
        <section className="dashboard-page" aria-label="Gebiete im Vergleich">
          <SelectionBar technologies={withTables} state={state} active={technology} />
          <RegionTable
            technology={technology}
            scopeKey={state.scopeKey}
            scopeName={state.scopeName}
            selectionQuery={selectionQuery}
            ramp={technology.ramp ?? config.ramp}
            fileBase={`mastr_${config.id}_${technology.id}`}
            anchor="analyse-gebiete"
          />
        </section>
      )}
    </>
  );
}
