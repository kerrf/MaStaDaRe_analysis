import { useContext } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, ChevronRight, MapPin } from 'lucide-react';
import { BUNDESLAENDER } from '../../config/regions';
import { ScopeSlot } from './scopeSlot';

const LAENDER = BUNDESLAENDER.map((b) => ({ value: b.code, label: b.name }));

// A step of the path below Deutschland: the list of its level, showing the choice or asking for one. state: 'current'
// – the area the page shows, in the green of chosen buttons; 'parent' – on the way to it; 'open' – not chosen (yet).
// disabled: not before the step above (title: why)
function Step({ name, value, options, placeholder, state, disabled = false, title, onChange }) {
  return (
    <li className={`scope-bar__step is-${state}`}>
      <ChevronRight size={16} aria-hidden="true" className="scope-bar__sep" />
      <span className="scope-bar__field">
        <select
          aria-label={name}
          className="scope-bar__select"
          value={value ?? ''}
          disabled={disabled}
          title={title}
          onChange={(e) => onChange(e.target.value || null)}
        >
          <option value="">{placeholder}</option>
          {options?.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        <ChevronDown size={15} aria-hidden="true" className="scope-bar__chevron" />
      </span>
    </li>
  );
}

// The area of the page as a path, Deutschland › Bundesland › Landkreis (› Gemeinde, where the page has one:
// onSelectGemeinde), in the dashboard's header (ScopeSlot): where every page looks, apart from what it shows. The area
// shown stands out in green, the steps on the way to it are lighter, those still open dashed. kreisOptions and
// gemeindeOptions: the Landkreise of the selected Land, the Gemeinden of the Kreis ({ ags, name }), null while loading.
export default function ScopeBar({ region, kreis, kreisOptions, onSelectScope, gemeinde, gemeindeOptions, onSelectGemeinde }) {
  const slot = useContext(ScopeSlot);
  const current = gemeinde ? 'gemeinde' : kreis ? 'kreis' : region ? 'land' : 'de';
  const stateOf = (level, chosen) => (level === current ? 'current' : chosen ? 'parent' : 'open');
  const bar = (
    <nav className="scope-bar" aria-label="Gebiet">
      <span className="scope-bar__label" aria-hidden="true">
        Gebiet
      </span>
      <ol className="scope-bar__path">
        <li className={`scope-bar__step is-${current === 'de' ? 'current' : 'parent'}`}>
          <button
            type="button"
            className="scope-bar__root"
            aria-current={current === 'de' ? 'location' : undefined}
            title={current === 'de' ? undefined : 'Zurück zu ganz Deutschland'}
            onClick={() => onSelectScope(null)}
          >
            <MapPin size={15} aria-hidden="true" />
            Deutschland
          </button>
        </li>
        <Step
          name="Bundesland"
          value={region?.code}
          options={LAENDER}
          placeholder="Bundesland wählen"
          state={stateOf('land', region)}
          onChange={(code) => onSelectScope(code)}
        />
        <Step
          name="Landkreis"
          value={kreis}
          options={kreisOptions?.map((k) => ({ value: k.ags, label: k.name }))}
          placeholder="Landkreis wählen"
          state={stateOf('kreis', kreis)}
          disabled={!region || !kreisOptions}
          title={region ? undefined : 'Zuerst ein Bundesland wählen'}
          onChange={(ags) => onSelectScope(region.code, ags)}
        />
        {onSelectGemeinde && (
          <Step
            name="Gemeinde"
            value={gemeinde}
            options={gemeindeOptions?.map((g) => ({ value: g.ags, label: g.name }))}
            placeholder={kreis ? 'Ganzer Landkreis' : 'Gemeinde wählen'}
            state={stateOf('gemeinde', gemeinde)}
            disabled={!kreis || !gemeindeOptions}
            title={kreis ? undefined : 'Zuerst einen Landkreis wählen'}
            onChange={onSelectGemeinde}
          />
        )}
      </ol>
    </nav>
  );
  // In the header once it is there (the same render that puts it there, before the page is painted)
  return slot ? createPortal(bar, slot) : null;
}
