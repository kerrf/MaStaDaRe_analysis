import { ChevronRight, MapPin } from 'lucide-react';
import { BUNDESLAENDER } from '../../config/regions';

// Deutschland › Bundesland › Landkreis. kreisOptions: the Landkreise of the selected Land ({ ags, name }), null while loading.
export default function ScopeBar({ region, kreis, kreisOptions, onSelectScope }) {
  return (
    <nav className="scope-bar" aria-label="Gebietsauswahl">
      <span className="scope-bar__label">
        <MapPin size={15} aria-hidden="true" /> Gebiet
      </span>
      <ol className="scope-bar__trail">
        <li>
          <button
            type="button"
            className={`scope-bar__crumb${region ? '' : ' is-current'}`}
            aria-current={region ? undefined : 'page'}
            onClick={() => onSelectScope(null)}
          >
            Deutschland
          </button>
        </li>
        <li className="scope-bar__sep" aria-hidden="true">
          <ChevronRight size={14} />
        </li>
        <li>
          <label className="visually-hidden" htmlFor="scope-bundesland">
            Bundesland
          </label>
          <select
            id="scope-bundesland"
            className={`scope-bar__select${region ? ' is-set' : ''}`}
            value={region?.code ?? ''}
            onChange={(e) => onSelectScope(e.target.value || null)}
          >
            <option value="">Bundesland wählen</option>
            {BUNDESLAENDER.map((b) => (
              <option key={b.code} value={b.code}>
                {b.name}
              </option>
            ))}
          </select>
        </li>
        <li className="scope-bar__sep" aria-hidden="true">
          <ChevronRight size={14} />
        </li>
        <li>
          <label className="visually-hidden" htmlFor="scope-landkreis">
            Landkreis
          </label>
          <select
            id="scope-landkreis"
            className={`scope-bar__select${kreis ? ' is-set' : ''}`}
            value={kreis ?? ''}
            disabled={!region || !kreisOptions}
            title={region ? undefined : 'Zuerst ein Bundesland wählen'}
            onChange={(e) => onSelectScope(region.code, e.target.value || null)}
          >
            <option value="">Landkreis wählen</option>
            {kreisOptions?.map((k) => (
              <option key={k.ags} value={k.ags}>
                {k.name}
              </option>
            ))}
          </select>
        </li>
      </ol>
    </nav>
  );
}
