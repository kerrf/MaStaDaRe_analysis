import { useCallback, useMemo } from 'react';
import { useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { GRANULARITIES } from '../../config/dashboards';
import { findBundesland, isKreisKey } from '../../config/regions';
import { VIEWS, viewPath } from '../../config/views';
import { trackEvent } from '../../lib/analytics';
import { useTopology } from '../../lib/data';

const LANDKREIS = GRANULARITIES.find((g) => g.id === 'landkreis');

// The scope levels below Deutschland (URL /<land>/<kreis>). Entering one while the map shows the level above switches
// the shading to its children – Bundesländer to Landkreise when entering a Land, Landkreise to Gemeinden when entering a
// Kreis – so the map never shows a single area. Leaving the level undoes that switch (see selectScope).
const SCOPE_LEVELS = [
  { key: 'land', parent: 'bundesland', child: 'landkreis' },
  { key: 'kreis', parent: 'landkreis', child: 'gemeinde' },
];

// Sort Kreise by their proper name, so "Landkreis München" comes right after "München".
const properName = (name) => name.replace(/^(Land)?kreis /i, '');

// Comma-separated ids from the URL, in option order; missing or invalid means all options.
function parseSubtypes(value, options) {
  const ids = options.map((o) => o.id);
  const picked = value?.split(',') ?? [];
  const selected = ids.filter((id) => picked.includes(id));
  return selected.length ? selected : ids;
}

/**
 * What the URL chooses of a technology: its subtypes (Solar: Anlagenart, Wind: Lage; all by default) and its Leistung
 * (Solar: Netto or Brutto, the first option by default). Each technology has its own parameters, so the choices of one
 * stay while another is shown. query: the choice as query of its requests, only what differs from the default; note:
 * " · nur Freifläche" while narrowed.
 */
export function selectionOf(technology, searchParams) {
  const subtypes = technology.subtypes ? parseSubtypes(searchParams.get(technology.subtypes.param), technology.subtypes.options) : null;
  const leistung = technology.leistung
    ? technology.leistung.options.find((o) => o.id === searchParams.get(technology.leistung.param)) ?? technology.leistung.options[0]
    : null;
  const narrowed = subtypes && subtypes.length < technology.subtypes.options.length;
  const query = new URLSearchParams([
    ...(narrowed ? subtypes.map((id) => [technology.subtypes.param, id]) : []),
    ...(leistung && leistung !== technology.leistung.options[0] ? [[technology.leistung.param, leistung.id]] : []),
  ]).toString();
  const note = narrowed ? ` · nur ${subtypes.map((id) => technology.subtypes.options.find((o) => o.id === id).label).join(', ')}` : '';
  return { subtypes, leistung, query, note };
}

/**
 * The state of a dashboard page in its URL: the scope (path /<view>/<land>/<kreis>) and the technology with its
 * selection (query). Shared by all pages of a dashboard, so switching pages keeps both.
 */
export default function useDashboardState(config, view) {
  const { land: landParam, kreis: kreisParam } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const location = useLocation();
  const scoped = VIEWS[view].scoped;

  const region = scoped && landParam ? findBundesland(landParam) : null;
  // A Landkreis of that Land, by its 5-digit key; its name and shape come with the Kreis boundaries.
  const kreisAgs = region && isKreisKey(kreisParam) && kreisParam.startsWith(region.ags) ? kreisParam : null;
  const kreise = useTopology(region ? LANDKREIS.topology : null);
  const kreisOptions = useMemo(
    () =>
      region && kreise.data
        ? kreise.data.features
            .map((f) => f.properties)
            .filter((p) => isKreisKey(p.ags) && p.ags.startsWith(region.ags))
            .sort((a, b) => properName(a.name).localeCompare(properName(b.name), 'de'))
        : null,
    [region, kreise.data],
  );
  const kreisFeature = useMemo(
    () => (kreisAgs && kreise.data ? kreise.data.features.find((f) => f.properties.ags === kreisAgs) ?? null : null),
    [kreisAgs, kreise.data],
  );
  const scopeName = kreisAgs ? kreisFeature?.properties.name ?? `Kreis ${kreisAgs}` : region?.name ?? 'Deutschland';
  // The scope as the analyses' API knows it: "DE", or the key of the Land or Kreis
  const scopeKey = kreisAgs ?? region?.ags ?? 'DE';
  const parentName = kreisAgs ? region.name : 'Deutschland';

  const technology = config.technologies.find((t) => t.id === searchParams.get('technologie')) ?? config.technologies[0];
  const selection = selectionOf(technology, searchParams);

  // An unknown Land, or a Landkreis that is malformed, of another Land, or not in the boundaries: where to go instead
  let redirect = null;
  if (scoped && landParam && !region) redirect = viewPath(config.basePath, view);
  else if (scoped && kreisParam && (!kreisAgs || (kreise.status === 'ready' && !kreisFeature))) {
    redirect = `${viewPath(config.basePath, view, region.code)}${location.search}`;
  }

  const setParam = useCallback(
    (key, value, defaultValue) =>
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          if (value === defaultValue) next.delete(key);
          else next.set(key, value);
          return next;
        },
        { replace: true, state: location.state },
      ),
    [setSearchParams, location.state],
  );

  // Moves to Deutschland (no arguments), a Land or a Landkreis of a Land. The history entry remembers the resolution
  // switch made when entering each level ({ land, kreis }: { from, to }), so leaving the level – by the map, the scope
  // bar or several levels at once – restores the resolution the user came from, unless they changed it meanwhile.
  const selectScope = useCallback(
    (landCode = null, kreisCode = null) => {
      const params = new URLSearchParams(searchParams);
      const ebene = () => params.get('ebene') ?? config.defaultGranularity;
      const drill = {};
      for (const { key } of SCOPE_LEVELS) if (location.state?.drill?.[key]) drill[key] = location.state.drill[key];

      const depthNow = kreisAgs ? 2 : region ? 1 : 0;
      const depthNext = kreisCode ? 2 : landCode ? 1 : 0;
      for (let depth = depthNow; depth > depthNext; depth -= 1) {
        const { key } = SCOPE_LEVELS[depth - 1];
        const switched = drill[key];
        if (switched && ebene() === switched.to) {
          if (switched.from == null) params.delete('ebene');
          else params.set('ebene', switched.from);
        }
        delete drill[key];
      }
      for (let depth = depthNow + 1; depth <= depthNext; depth += 1) {
        const { key, parent, child } = SCOPE_LEVELS[depth - 1];
        if (ebene() === parent) {
          drill[key] = { from: params.get('ebene'), to: child };
          params.set('ebene', child);
        }
      }

      const query = params.toString();
      navigate(`${viewPath(config.basePath, view, landCode, kreisCode)}${query ? `?${query}` : ''}`, {
        state: Object.keys(drill).length ? { drill } : null,
      });
    },
    [searchParams, location.state, region, kreisAgs, navigate, config.basePath, config.defaultGranularity, view],
  );
  // One level up: from a Landkreis to its Land, from a Land to Deutschland.
  const exitScope = useCallback(() => (kreisAgs ? selectScope(region.code) : selectScope()), [kreisAgs, region, selectScope]);

  // The address of another page of the dashboard, in the same scope where it has one, with the same choices
  const hrefOf = useCallback(
    (viewId) => `${viewPath(config.basePath, viewId, region?.code, kreisAgs)}${location.search}`,
    [config.basePath, region, kreisAgs, location.search],
  );

  const setTechnology = useCallback(
    (id) => {
      trackEvent('Technologie', { dashboard: config.id, technologie: id });
      setParam('technologie', id, config.technologies[0].id);
    },
    [setParam, config.id, config.technologies],
  );
  const setSubtypes = useCallback(
    (ids) => {
      trackEvent('Filter', { filter: technology.subtypes.param, auswahl: ids.join(',') });
      setParam(technology.subtypes.param, ids.join(','), technology.subtypes.options.map((o) => o.id).join(','));
    },
    [setParam, technology],
  );
  const setLeistung = useCallback(
    (id) => {
      trackEvent('Filter', { filter: technology.leistung.param, auswahl: id });
      setParam(technology.leistung.param, id, technology.leistung.options[0].id);
    },
    [setParam, technology],
  );

  return {
    view,
    searchParams,
    region,
    kreisAgs,
    kreise,
    kreisOptions,
    kreisFeature,
    scopeName,
    scopeKey,
    parentName,
    technology,
    ...selection,
    selectionQuery: selection.query,
    selectionNote: selection.note,
    redirect,
    setParam,
    setTechnology,
    setSubtypes,
    setLeistung,
    selectScope,
    exitScope,
    hrefOf,
  };
}
