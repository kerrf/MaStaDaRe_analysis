import { useCallback, useEffect, useState } from 'react';
import { feature, mesh } from 'topojson-client';
import { API_BASE_URL, SITE } from '../config/site';
import { NUMERIC_FIELDS } from '../config/dashboards';
import { OFFSHORE } from '../config/regions';

// Module-level caches: switching views back and forth never refetches.
const topologyCache = new Map();
const statsCache = new Map();
const metaCache = new Map();

function cached(cache, key, load) {
  if (!cache.has(key)) {
    const promise = load();
    promise.catch(() => cache.delete(key));
    cache.set(key, promise);
  }
  return cache.get(key);
}

async function fetchJson(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return res.json();
}

export const loadTopology = (url) =>
  cached(topologyCache, url, async () => {
    const topology = await fetchJson(url);
    return feature(topology, Object.keys(topology.objects)[0]);
  });

// Every object of a topology as GeoJSON, by name (the background map: { land, borders, labels })
const layersCache = new Map();
const loadLayers = (url) =>
  cached(layersCache, url, async () => {
    const topology = await fetchJson(url);
    return Object.fromEntries(Object.keys(topology.objects).map((name) => [name, feature(topology, topology.objects[name])]));
  });

// The edges of one area of a topology that it shares with no other area, as lines: for the sea, its border out at sea
// without the coast. key: "<url>#<ags>".
const edgeCache = new Map();
const loadOpenEdge = (key) =>
  cached(edgeCache, key, async () => {
    const [url, ags] = key.split('#');
    const topology = await fetchJson(url);
    const object = topology.objects[Object.keys(topology.objects)[0]];
    return mesh(topology, object, (a, b) => a === b && a.properties.ags === ags);
  });

// The outline of a topology's areas together, the sea left out: Germany's border and coast, as lines
const outlineCache = new Map();
const loadOutline = (url) =>
  cached(outlineCache, url, async () => {
    const topology = await fetchJson(url);
    const object = topology.objects[Object.keys(topology.objects)[0]];
    const land = { ...object, geometries: object.geometries.filter((g) => g.properties.ags !== OFFSHORE.ags) };
    return mesh(topology, land, (a, b) => a === b);
  });

const toNumber = (v) => (v == null || v === '' ? null : Number(v));

export const loadStats = (url) =>
  cached(statsCache, url, async () => {
    const rows = await fetchJson(url);
    if (!Array.isArray(rows)) throw new Error('Unerwartetes Antwortformat');
    return rows.map((row) => {
      const out = { ...row };
      for (const key of NUMERIC_FIELDS) if (key in out) out[key] = toNumber(out[key]);
      return out;
    });
  });

// query: further parameters of the technology's selection (e.g. "anlagenart=freiflaeche&leistung=netto")
export const statsUrl = (statsPath, apiLevel, query = '') =>
  statsPath && apiLevel ? `${API_BASE_URL}${statsPath}?level=${encodeURIComponent(apiLevel)}${query && `&${query}`}` : null;

// status: 'idle' (nothing to load) | 'loading' | 'ready' | 'error'
function useAsync(key, load) {
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState({ key: null, data: null, error: null });

  useEffect(() => {
    if (!key) return undefined;
    let cancelled = false;
    load(key).then(
      (data) => !cancelled && setState({ key, data, error: null }),
      (error) => !cancelled && setState({ key, data: null, error }),
    );
    return () => {
      cancelled = true;
    };
  }, [key, load, attempt]);

  const retry = useCallback(() => {
    setState({ key: null, data: null, error: null });
    setAttempt((n) => n + 1);
  }, []);

  if (!key) return { status: 'idle', data: null, error: null, retry };
  if (state.key !== key) return { status: 'loading', data: null, error: null, retry };
  return { status: state.error ? 'error' : 'ready', data: state.data, error: state.error, retry };
}

export const useTopology = (url) => useAsync(url, loadTopology);
export const useLayers = (url) => useAsync(url, loadLayers);
export const useOpenEdge = (url, ags) => useAsync(url && `${url}#${ags}`, loadOpenEdge);
export const useOutline = (url) => useAsync(url, loadOutline);
export const useStats = (url) => useAsync(url, loadStats);

// The day up to which the data includes every change of the register, noted by the last complete nightly update
// (backend app.etl.update). Until one is noted, or while the API is unreachable, the date in site.js.
const DATENSTAND_URL = `${API_BASE_URL}/meta/datenstand`;
const loadDatenstand = (url) => cached(metaCache, url, async () => (await fetchJson(url)).datenstand);
export function useDatenstand() {
  return useAsync(DATENSTAND_URL, loadDatenstand).data ?? SITE.dataStand;
}

// Other JSON of the API as it comes, e.g. the tables of the analyses ({ columns, rows })
const jsonCache = new Map();
export const loadJson = (url) => cached(jsonCache, url, () => fetchJson(url));
export const useJson = (url) => useAsync(url, loadJson);
