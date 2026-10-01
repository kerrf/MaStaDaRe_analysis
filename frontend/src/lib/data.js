import { useCallback, useEffect, useState } from 'react';
import { feature } from 'topojson-client';
import { API_BASE_URL, SITE } from '../config/site';
import { NUMERIC_FIELDS } from '../config/dashboards';

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
const loadJson = (url) => cached(jsonCache, url, () => fetchJson(url));
export const useJson = (url) => useAsync(url, loadJson);
