import { useCallback, useEffect, useState } from 'react';
import { feature } from 'topojson-client';
import { API_BASE_URL } from '../config/site';
import { NUMERIC_FIELDS } from '../config/dashboards';

// Module-level caches: switching views back and forth never refetches.
const topologyCache = new Map();
const statsCache = new Map();

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

export const statsUrl = (statsPath, apiLevel) =>
  statsPath && apiLevel ? `${API_BASE_URL}${statsPath}?level=${encodeURIComponent(apiLevel)}` : null;

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
