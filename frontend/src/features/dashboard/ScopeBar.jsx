import { useContext, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { ChevronRight, MapPin, X } from 'lucide-react';
import ListSelect from '../../components/ui/ListSelect';
import Setting, { SettingsRow } from '../../components/ui/Setting';
import { GRANULARITIES } from '../../config/dashboards';
import { BUNDESLAENDER, findBundeslandByAgs, isKreisKey } from '../../config/regions';
import { useTopology } from '../../lib/data';
import ScopeOutline from './ScopeOutline';
import { ScopeSlot } from './scopeSlot';

const LAENDER = BUNDESLAENDER.map((b) => ({ value: b.code, label: b.name }));
const KREISE_TOPOLOGY = GRANULARITIES.find((g) => g.id === 'landkreis').topology;

// A step of the path below Deutschland: the list of its level, showing the choice or, while none is chosen, all of the
// level ("Alle Landkreise": the whole of the step above). state: 'current' – the area the page shows, in the green of
// chosen buttons; 'parent' – on the way to it; 'open' – none chosen. disabled: not before the step above (title: why)
function Step({ name, value, options, placeholder, state, disabled = false, title, onChange }) {
  return (
    <li className={`scope-bar__step is-${state}`}>
      <ChevronRight size={16} aria-hidden="true" className="scope-bar__sep" />
      <ListSelect
        label={name}
        className="scope-bar__select"
        value={value ?? ''}
        disabled={disabled}
        title={title}
        onChange={(v) => onChange(v || null)}
        options={[{ value: '', label: placeholder }, ...(options ?? [])]}
      />
    </li>
  );
}

// The area of the page as a path, Deutschland › Bundesland › Landkreis (› Gemeinde, where the page has one:
// onSelectGemeinde), in the dashboard's header (ScopeSlot): where every page looks, apart from what it shows. One box
// like every setting, the area shown filled in green; on the right its outline and, in words, what every page shows,
// and the way back to Deutschland. kreisOptions and gemeindeOptions: the Landkreise of the selected Land, the Gemeinden of the Kreis
// ({ ags, name }), null while loading.
export default function ScopeBar({ region, kreis, kreisOptions, onSelectScope, gemeinde, gemeindeOptions, onSelectGemeinde }) {
  const slot = useContext(ScopeSlot);
  // Without a Land: every Kreis of Germany to choose from, its Land in brackets; choosing one chooses its Land too
  const allKreise = useTopology(region ? null : KREISE_TOPOLOGY);
  const kreisChoices = useMemo(() => {
    if (region) return kreisOptions?.map((k) => ({ value: k.ags, label: k.name })) ?? null;
    if (!allKreise.data) return null;
    return allKreise.data.features
      .map((f) => f.properties)
      .filter((p) => isKreisKey(p.ags) && findBundeslandByAgs(p.ags.slice(0, 2)))
      .map((p) => ({ value: p.ags, label: `${p.name} (${findBundeslandByAgs(p.ags.slice(0, 2)).name})` }))
      .sort((a, b) => a.label.localeCompare(b.label, 'de'));
  }, [region, kreisOptions, allKreise.data]);
  const current = gemeinde ? 'gemeinde' : kreis ? 'kreis' : region ? 'land' : 'de';
  const stateOf = (level, chosen) => (level === current ? 'current' : chosen ? 'parent' : 'open');
  const name = gemeinde
    ? gemeindeOptions?.find((g) => g.ags === gemeinde)?.name
    : kreis
      ? kreisOptions?.find((k) => k.ags === kreis)?.name
      : region?.name;
  const aside =
    current === 'de' ? (
      <span className="scope-bar__shown">
        <ScopeOutline size={26} />
        <span>
          Alle Seiten zeigen <strong>ganz Deutschland</strong>
        </span>
      </span>
    ) : (
      <>
        {name && (
          <span className="scope-bar__shown">
            <ScopeOutline region={region} kreis={kreis} size={26} />
            <span>
              Alle Seiten zeigen nur <strong>{name}</strong>
            </span>
          </span>
        )}
        <button type="button" className="settings-reset" onClick={() => onSelectScope(null)}>
          <X size={14} aria-hidden="true" />
          Ganz Deutschland
        </button>
      </>
    );
  const bar = (
    <nav className={`scope-bar settings-band${current === 'de' ? '' : ' is-scoped'}`} aria-label="Gebiet">
      <SettingsRow aside={aside}>
        <Setting label="Gebiet" size="large" className="scope-bar__setting">
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
              placeholder="Alle Bundesländer"
              state={stateOf('land', region)}
              onChange={(code) => onSelectScope(code)}
            />
            <Step
              name="Landkreis"
              value={kreis}
              options={kreisChoices}
              placeholder="Alle Landkreise"
              state={stateOf('kreis', kreis)}
              disabled={!kreisChoices}
              onChange={(ags) => (ags ? onSelectScope(region?.code ?? findBundeslandByAgs(ags.slice(0, 2)).code, ags) : onSelectScope(region.code))}
            />
            {onSelectGemeinde && (
              <Step
                name="Gemeinde"
                value={gemeinde}
                options={gemeindeOptions?.map((g) => ({ value: g.ags, label: g.name }))}
                placeholder="Alle Gemeinden"
                state={stateOf('gemeinde', gemeinde)}
                disabled={!kreis || !gemeindeOptions}
                title={kreis ? undefined : 'Zuerst einen Landkreis wählen'}
                onChange={onSelectGemeinde}
              />
            )}
          </ol>
        </Setting>
      </SettingsRow>
    </nav>
  );
  // In the header once it is there (the same render that puts it there, before the page is painted)
  return slot ? createPortal(bar, slot) : null;
}
