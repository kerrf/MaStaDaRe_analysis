import { useContext } from 'react';
import { createPortal } from 'react-dom';
import { MapPin } from 'lucide-react';
import { BUNDESLAENDER } from '../../config/regions';
import { ScopeSlot } from './scopeSlot';

// One field of the bar: its name above the choice, the whole field opens the list; chosen: in the green of chosen buttons
function Field({ id, name, set, children }) {
  return (
    <div className={`scope-bar__field${set ? ' is-set' : ''}`}>
      <label className="scope-bar__name" htmlFor={id}>
        {name}
      </label>
      {children}
    </div>
  );
}

// Deutschland › Bundesland › Landkreis (› Gemeinde, where the page has one: onSelectGemeinde), as one control in the
// dashboard's header (ScopeSlot): where the page looks, not part of what it shows. kreisOptions and gemeindeOptions: the
// Landkreise of the selected Land, the Gemeinden of the Kreis ({ ags, name }), null while loading.
export default function ScopeBar({ region, kreis, kreisOptions, onSelectScope, gemeinde, gemeindeOptions, onSelectGemeinde }) {
  const slot = useContext(ScopeSlot);
  const bar = (
    <nav className="scope-bar" aria-label="Gebietsauswahl">
      <div className={`scope-bar__field scope-bar__field--root${region ? '' : ' is-set'}`}>
        <span className="scope-bar__name">Gebiet</span>
        <button
          type="button"
          className="scope-bar__root"
          aria-current={region ? undefined : 'page'}
          title={region ? 'Zurück zu ganz Deutschland' : undefined}
          onClick={() => onSelectScope(null)}
        >
          <MapPin size={15} aria-hidden="true" />
          Deutschland
        </button>
      </div>
      <Field id="scope-bundesland" name="Bundesland" set={Boolean(region)}>
        <select id="scope-bundesland" className="scope-bar__select" value={region?.code ?? ''} onChange={(e) => onSelectScope(e.target.value || null)}>
          <option value="">Bundesland wählen</option>
          {BUNDESLAENDER.map((b) => (
            <option key={b.code} value={b.code}>
              {b.name}
            </option>
          ))}
        </select>
      </Field>
      <Field id="scope-landkreis" name="Landkreis" set={Boolean(kreis)}>
        <select
          id="scope-landkreis"
          className="scope-bar__select"
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
      </Field>
      {onSelectGemeinde && (
        <Field id="scope-gemeinde" name="Gemeinde" set={Boolean(gemeinde)}>
          <select
            id="scope-gemeinde"
            className="scope-bar__select"
            value={gemeinde ?? ''}
            disabled={!kreis || !gemeindeOptions}
            title={kreis ? undefined : 'Zuerst einen Landkreis wählen'}
            onChange={(e) => onSelectGemeinde(e.target.value || null)}
          >
            <option value="">{kreis ? 'Ganzer Landkreis' : 'Gemeinde wählen'}</option>
            {gemeindeOptions?.map((g) => (
              <option key={g.ags} value={g.ags}>
                {g.name}
              </option>
            ))}
          </select>
        </Field>
      )}
    </nav>
  );
  // In the header once it is there (the same render that puts it there, before the page is painted)
  return slot ? createPortal(bar, slot) : null;
}
