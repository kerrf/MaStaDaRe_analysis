import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Navigate, useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Clock, Construction, Download, Maximize2, Minimize2, RefreshCw, TriangleAlert } from 'lucide-react';
import Badge from '../../components/ui/Badge';
import ChartPlaceholder from '../../components/ui/ChartPlaceholder';
import TodoNote from '../../components/ui/TodoNote';
import { GRANULARITIES, STATES_TOPOLOGY, hasData, isAvailable } from '../../config/dashboards';
import { GERMANY_BOUNDS, GERMANY_SEA_BOUNDS, findBundesland, findBundeslandByAgs, isKreisKey, withoutOffshore } from '../../config/regions';
import { API_BASE_URL, SITE } from '../../config/site';
import { makeColorScale, scaleDomainMax } from '../../lib/colorScale';
import { statsUrl, useStats, useTopology } from '../../lib/data';
import { escapeHtml, formatDate, formatNumber } from '../../lib/format';
import useDocumentTitle from '../../lib/useDocumentTitle';
import ChoroplethMap from './ChoroplethMap';
import ControlPanel from './ControlPanel';
import KpiStrip from './KpiStrip';
import MapLegend from './MapLegend';
import RankingPanel from './RankingPanel';
import ScopeBar from './ScopeBar';
import SiteMarkers from './SiteMarkers';
import TimelineAnalysis from './TimelineAnalysis';
import { boundsAround, groupByLocation, perRegion } from './sites';
import { exportCsv, exportPdf, exportPng } from './exportMap';
import './dashboard.css';

const LINE_WEIGHT = { bundesland: 1, landkreis: 0.5, gemeinde: 0.2, plz2: 0.6, plz3: 0.35, plz5: 0.15 };
const LANDKREIS = GRANULARITIES.find((g) => g.id === 'landkreis');
// Length of the Gemeindeschlüssel prefix that keys each region level.
const AGS_LENGTH = { bundesland: 2, landkreis: 5, gemeinde: 8 };

// The scope levels below Deutschland (URL /<land>/<kreis>). Entering one while the map shows the level above switches
// the shading to its children – Bundesländer to Landkreise when entering a Land, Landkreise to Gemeinden when entering a
// Kreis – so the map never shows a single area. Leaving the level undoes that switch (see selectScope).
const SCOPE_LEVELS = [
  { key: 'land', parent: 'bundesland', child: 'landkreis' },
  { key: 'kreis', parent: 'landkreis', child: 'gemeinde' },
];

// Sites (e.g. the pumped-storage plants) rank as plants within the scope, keyed by their Gemeindeschlüssel.
const PLANTS = { id: 'kraftwerke', label: 'Kraftwerke', featureKey: 'ags' };
const NO_PLANTS = [];

// Sort Kreise by their proper name, so "Landkreis München" comes right after "München".
const properName = (name) => name.replace(/^(Land)?kreis /i, '');

function MapOverlay({ state, technology, onRetry }) {
  if (state === 'loading') {
    return (
      <div className="map-overlay map-overlay--loading" role="status">
        <div className="spinner" />
        <span>Lade Karte …</span>
      </div>
    );
  }
  if (state === 'error') {
    return (
      <div className="map-overlay">
        <div className="state-message state-message--error" role="alert">
          <span className="state-message__icon">
            <TriangleAlert size={20} aria-hidden="true" />
          </span>
          <div className="state-message__title">Daten konnten nicht geladen werden</div>
          <p className="state-message__text">Der Datenserver antwortet gerade nicht. Bitte versuche es in einem Moment erneut.</p>
          <button type="button" className="btn btn--secondary btn--sm" onClick={onRetry}>
            <RefreshCw size={14} aria-hidden="true" /> Erneut versuchen
          </button>
        </div>
      </div>
    );
  }
  if (state === 'unavailable') {
    return (
      <div className="map-overlay">
        <div className="state-message state-message--soon">
          <span className="state-message__icon">
            <Construction size={20} aria-hidden="true" />
          </span>
          <div className="state-message__title">{technology.label}: Daten in Vorbereitung</div>
          <p className="state-message__text">Diese Ansicht wird gerade aufgebaut. Die Karte zeigt vorerst nur die Gebietsgrenzen.</p>
        </div>
      </div>
    );
  }
  return null;
}

// Comma-separated ids from the URL, in option order; missing or invalid means all options.
function parseSubtypes(value, options) {
  const ids = options.map((o) => o.id);
  const picked = value?.split(',') ?? [];
  const selected = ids.filter((id) => picked.includes(id));
  return selected.length ? selected : ids;
}

export default function MapDashboard({ config }) {
  const { land: landParam, kreis: kreisParam } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const location = useLocation();

  const region = landParam ? findBundesland(landParam) : null;
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
  const parentName = kreisAgs ? region.name : 'Deutschland';
  const technology = config.technologies.find((t) => t.id === searchParams.get('technologie')) ?? config.technologies[0];
  // Selection only for now – not yet passed to the data requests.
  const subtypes = technology.subtypes ? parseSubtypes(searchParams.get(technology.subtypes.param), technology.subtypes.options) : null;
  const analyses = technology.analyses ? [...config.analyses, ...technology.analyses] : config.analyses;
  // Charts over time take the full width above the cards (Zubau im Zeitverlauf, Germany-wide)
  const timelines = analyses.filter((a) => a.timeline);
  const cards = analyses.filter((a) => !a.timeline);
  // Some technologies show their plants as icons at their location instead of shaded areas (Pumpspeicher).
  const isSites = Boolean(technology.plantsPath);
  const metrics = technology.metrics ?? config.metrics;
  const metric = metrics.find((m) => m.id === searchParams.get('kennzahl')) ?? metrics[0];
  const defaultGranularity = GRANULARITIES.find((g) => g.id === config.defaultGranularity);
  const requested = GRANULARITIES.find((g) => g.id === searchParams.get('ebene'));
  const granularity = requested && isAvailable(requested, technology) ? requested : defaultGranularity;
  const isHeatmap = granularity.kind === 'heatmap';
  // Layers without an apiLevel show their borders only.
  const bordersOnly = !isHeatmap && !isSites && !granularity.apiLevel;
  // The sea is a region of its own, but only for technologies that are built there (offshore wind).
  const showSea = Boolean(technology.offshore);

  useDocumentTitle(region ? `${config.title} · ${scopeName}` : config.title);

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

      const path = [config.basePath, landCode, kreisCode].filter(Boolean).join('/');
      const query = params.toString();
      navigate(`${path}${query ? `?${query}` : ''}`, { state: Object.keys(drill).length ? { drill } : null });
    },
    [searchParams, location.state, region, kreisAgs, navigate, config.basePath, config.defaultGranularity],
  );
  // One level up: from a Landkreis to its Land, from a Land to Deutschland.
  const exitScope = useCallback(() => (kreisAgs ? selectScope(region.code) : selectScope()), [kreisAgs, region, selectScope]);

  // ------------------------------------------------------------------ data
  const withData = hasData(technology);
  const states = useTopology(STATES_TOPOLOGY);
  const shapes = useTopology(isHeatmap ? null : withData && !isSites ? granularity.topology : STATES_TOPOLOGY);
  const mapStats = useStats(isHeatmap || isSites ? null : statsUrl(technology.statsPath, granularity.apiLevel));
  const kpiStats = useStats(isSites ? null : statsUrl(technology.statsPath, 'bundesland'));
  const kreisStats = useStats(kreisAgs && !isSites ? statsUrl(technology.statsPath, LANDKREIS.apiLevel) : null);
  const plants = useStats(isSites ? `${API_BASE_URL}${technology.plantsPath}` : null);

  // The plants lie on the Bundesländer, which are drawn without values
  const activeGranularity = withData && !isSites ? granularity : GRANULARITIES[0];
  const plantRows = plants.status === 'ready' ? plants.data : NO_PLANTS;
  const sites = useMemo(() => groupByLocation(plantRows), [plantRows]);
  const siteBounds = useMemo(() => boundsAround(plantRows), [plantRows]);
  const plantFeatures = useMemo(
    () => plantRows.filter((p) => p.ags).map((p) => ({ properties: { ...p, _key: p.spe_mastr_nummer, _hasData: true } })),
    [plantRows],
  );

  const focusFeature = useMemo(() => {
    if (kreisAgs) return kreisFeature;
    return region && states.data ? states.data.features.find((f) => f.properties.ags === region.ags) ?? null : null;
  }, [kreisAgs, kreisFeature, region, states.data]);
  // Inside a Landkreis the map waits for its shape, which comes with the Kreis boundaries.
  const focusStatus = kreisAgs ? kreise.status : 'ready';
  const outlines = useMemo(() => (showSea ? states.data : withoutOffshore(states.data)), [showSea, states.data]);

  const merged = useMemo(() => {
    if (!shapes.data) return null;
    const rows = mapStats.status === 'ready' ? mapStats.data : [];
    const byKey = new Map(rows.map((row) => [String(row[activeGranularity.apiLevel]), row]));
    const regions = showSea ? shapes.data : withoutOffshore(shapes.data);
    return {
      ...regions,
      features: regions.features.map((f) => {
        const key = String(f.properties[activeGranularity.featureKey]);
        const row = byKey.get(key);
        return { ...f, properties: { ...f.properties, ...row, _key: key, _hasData: Boolean(row) } };
      }),
    };
  }, [shapes.data, mapStats.status, mapStats.data, activeGranularity, showSea]);

  const scale = useMemo(() => {
    const values = merged ? merged.features.filter((f) => f.properties._hasData).map((f) => f.properties[metric.id] ?? 0) : [];
    const max = scaleDomainMax(values);
    const trueMax = values.reduce((m, v) => Math.max(m, v), 0);
    return { colorFor: makeColorScale(config.ramp, max), max, clipped: trueMax > max };
  }, [merged, metric.id, config.ramp]);

  const mapData = isSites ? plants : mapStats;
  let mapState = 'ready';
  if (!withData) mapState = shapes.status === 'ready' ? 'unavailable' : 'loading';
  else if (isHeatmap) mapState = 'ready';
  else if (shapes.status === 'error' || mapData.status === 'error' || focusStatus === 'error') mapState = 'error';
  else if (shapes.status !== 'ready' || (!bordersOnly && mapData.status !== 'ready') || focusStatus !== 'ready') mapState = 'loading';

  const retry = () => {
    shapes.retry();
    mapStats.retry();
    plants.retry();
    kpiStats.retry();
    kreise.retry();
    kreisStats.retry();
  };

  // ------------------------------------------------------------- map glue
  const labelFor = useCallback(
    (f) => (activeGranularity.labelKey ? f.properties[activeGranularity.labelKey] : `${activeGranularity.regionPrefix}${f.properties._key}`),
    [activeGranularity],
  );

  // Clicking an area (map or ranking) zooms into it: a Land from the Bundesländer, a Kreis from the Landkreise of the Land
  // in scope. Gemeinden are the deepest level. On the map, everything outside the scope is covered by the mask, whose
  // click leads one level up instead (see ChoroplethMap).
  const canDrill = withData && (activeGranularity.id === 'bundesland' || (activeGranularity.id === 'landkreis' && Boolean(region)));
  const drillTarget = useCallback(
    (f) => {
      const { ags } = f.properties;
      if (!canDrill) return null;
      if (activeGranularity.id === 'bundesland') {
        const land = findBundeslandByAgs(ags);
        return land && land !== region ? { land: land.code } : null;
      }
      return isKreisKey(ags) && ags.startsWith(region.ags) && ags !== kreisAgs ? { land: region.code, kreis: ags } : null;
    },
    [canDrill, activeGranularity.id, region, kreisAgs],
  );
  const onRegionClick = useCallback(
    (f) => {
      const target = drillTarget(f);
      if (target) selectScope(target.land, target.kreis);
    },
    [drillTarget, selectScope],
  );

  const mapCardRef = useRef(null);
  const onRankingRowClick = (f) => {
    onRegionClick(f);
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    mapCardRef.current?.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'start' });
  };

  // The ranking compares areas within the deepest scope that contains them (Kreise within their Land, Gemeinden within
  // their Kreis) and highlights the area in scope itself.
  const scopeUnits = [region && { key: region.ags, name: region.name }, kreisAgs && { key: kreisAgs, name: scopeName }].filter(Boolean);
  const levelLength = AGS_LENGTH[activeGranularity.id] ?? Infinity;
  // Plants rank within the deepest scope.
  const rankingWithin = (isSites ? scopeUnits : scopeUnits.filter((unit) => unit.key.length < levelLength)).pop() ?? null;
  const rankingFocus = isSites ? null : scopeUnits.find((unit) => unit.key.length === levelLength)?.key ?? null;

  // KPIs describe the scope: Deutschland or a Land among the Bundesländer, a Landkreis among the Kreise of its Land.
  // Plants are summed per Land and per Kreis first, so they read like the stats of the other technologies.
  const bundeslandRows = isSites ? { data: perRegion(plantRows, 'bundesland'), status: plants.status } : kpiStats;
  const landkreisRows = isSites ? { data: perRegion(plantRows, 'landkreis'), status: plants.status } : kreisStats;
  const kpiScope = kreisAgs
    ? {
        level: 'landkreis',
        rows: landkreisRows.data?.filter((row) => String(row.landkreis).startsWith(region.ags)),
        status: landkreisRows.status,
        selected: { key: kreisAgs, name: scopeName },
      }
    : {
        level: 'bundesland',
        rows: bundeslandRows.data,
        status: bundeslandRows.status,
        selected: region && { key: region.ags, name: region.name },
      };

  const mapHints = ['Strg/⌘ + Mausrad zum Zoomen'];
  if (canDrill && !kreisAgs && activeGranularity.id === (region ? 'landkreis' : 'bundesland')) {
    mapHints.push(region ? 'Klick auf einen Landkreis zum Hineinzoomen' : 'Klick auf ein Land zum Hineinzoomen');
  }
  if (region) mapHints.push(`Klick außerhalb von ${scopeName}: zurück zu ${parentName}`);

  const tooltipFor = useCallback(
    (f) => {
      const p = f.properties;
      // Behind the plants, the Länder only show their name
      const rows = isSites
        ? ''
        : p._hasData
        ? config.tooltipRows
            .map(
              (r) =>
                `<tr${r.key === metric.id ? ' class="is-active"' : ''}><th>${r.label}</th><td>${formatNumber(p[r.key], r.digits)}</td><td>${r.unit ?? ''}</td></tr>`,
            )
            .join('')
        : '<tr><td class="map-tooltip__empty" colspan="3">Keine Daten</td></tr>';
      const target = drillTarget(f);
      const hint = target ? `<div class="map-tooltip__hint">Klicken für ${target.kreis ? 'Landkreis' : 'Bundesland'}-Ansicht</div>` : '';
      return `<div class="map-tooltip__title">${escapeHtml(labelFor(f))}</div>${rows && `<table>${rows}</table>`}${hint}`;
    },
    [isSites, config.tooltipRows, metric.id, labelFor, drillTarget],
  );

  // ----------------------------------------------------- fullscreen, hints
  const [fullscreen, setFullscreen] = useState(false);
  useEffect(() => {
    if (!fullscreen) return undefined;
    const onKey = (e) => e.key === 'Escape' && setFullscreen(false);
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [fullscreen]);

  const [wheelHint, setWheelHint] = useState(false);
  const hintTimer = useRef(null);
  const onPlainWheel = useCallback(() => {
    setWheelHint(true);
    clearTimeout(hintTimer.current);
    hintTimer.current = setTimeout(() => setWheelHint(false), 1200);
  }, []);
  useEffect(() => () => clearTimeout(hintTimer.current), []);

  // --------------------------------------------------------------- export
  const frameRef = useRef(null);
  const [exporting, setExporting] = useState(null);
  const scopeLabel = scopeName;
  const mapTitle = isSites ? 'Standorte' : isHeatmap ? 'Anlagendichte' : metric.legend;
  const layerLabel = isSites ? PLANTS.label : granularity.label;
  const exportRows = mapData.data;
  const fileBase = `mastr_${config.id}_${technology.id}_${kreisAgs ?? region?.code ?? 'de'}_${isSites ? PLANTS.id : granularity.id}`;
  const handleExport = async (kind) => {
    setExporting(kind);
    try {
      if (kind === 'png') await exportPng(frameRef.current, fileBase);
      if (kind === 'pdf') await exportPdf(frameRef.current, fileBase, `${technology.label}: ${mapTitle} – ${scopeLabel} (${layerLabel})`);
      if (kind === 'csv') exportCsv(exportRows, fileBase);
    } finally {
      setExporting(null);
    }
  };

  if (landParam && !region) return <Navigate to={config.basePath} replace />;
  // An unknown Landkreis (malformed, of another Land, or not in the boundaries) falls back to its Land.
  if (kreisParam && (!kreisAgs || (kreise.status === 'ready' && !kreisFeature))) {
    return <Navigate to={`${config.basePath}/${region.code}${location.search}`} replace />;
  }

  const heatmapUrl = technology.heatmapPath ? `${API_BASE_URL}${technology.heatmapPath}` : null;
  const focusColor = config.ramp[config.ramp.length - 1];

  return (
    <div className="dashboard" data-topic={config.id}>
      <header className="dashboard-header">
        <div className="container dashboard-header__inner">
          <div className="dashboard-header__text">
            <span className="eyebrow">{config.eyebrow}</span>
            <h1 className="dashboard-header__title">
              {config.title}
              {region && <span className="dashboard-header__scope">{scopeName}</span>}
            </h1>
            <p className="dashboard-header__lead">{config.description}</p>
          </div>
          <div className="dashboard-header__meta">
            <Badge icon={Clock}>Datenstand {formatDate(SITE.dataStand)}</Badge>
            {withData ? <Badge tone="live">Live-Daten</Badge> : <Badge tone="soon">In Vorbereitung</Badge>}
          </div>
        </div>
      </header>

      <div className="container dashboard-body">
        <ScopeBar region={region} kreis={kreisAgs} kreisOptions={kreisOptions} onSelectScope={selectScope} />

        <KpiStrip kpis={technology.kpis ?? config.kpis} {...kpiScope} status={withData ? kpiScope.status : 'idle'} parentName={parentName} />

        <div className="dashboard-main">
          <section ref={mapCardRef} className={`card map-card${fullscreen ? ' is-fullscreen' : ''}`} aria-label="Karte">
            <header className="card__header map-card__header">
              <div>
                <h2 className="card__title">
                  {technology.label}: {mapTitle}
                </h2>
                <div className="card__subtitle">
                  {scopeLabel} · {layerLabel}
                </div>
              </div>
              <div className="map-card__tools">
                <div className="export-group" role="group" aria-label="Exportieren">
                  <Download size={15} aria-hidden="true" className="export-group__icon" />
                  {['png', 'pdf', 'csv'].map((kind) => (
                    <button
                      key={kind}
                      type="button"
                      className="export-group__btn"
                      disabled={Boolean(exporting) || mapState !== 'ready' || (kind === 'csv' && !exportRows)}
                      onClick={() => handleExport(kind)}
                    >
                      {exporting === kind ? '…' : kind.toUpperCase()}
                    </button>
                  ))}
                </div>
                <button
                  type="button"
                  className="icon-btn"
                  onClick={() => setFullscreen((v) => !v)}
                  aria-label={fullscreen ? 'Vollbild beenden' : 'Vollbild'}
                  title={fullscreen ? 'Vollbild beenden (Esc)' : 'Vollbild'}
                >
                  {fullscreen ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
                </button>
              </div>
            </header>

            <div className="map-frame" ref={frameRef}>
              <ChoroplethMap
                mode={isHeatmap ? 'heatmap' : 'choropleth'}
                geo={merged}
                layerKey={`${activeGranularity.id}-${metric.id}-${technology.id}-${mapState}`}
                valueKey={metric.id}
                colorFor={scale.colorFor}
                neutral={isSites || bordersOnly || !withData}
                lineWeight={LINE_WEIGHT[activeGranularity.id] ?? 0.5}
                tooltipFor={tooltipFor}
                outlines={outlines}
                showOutlines={activeGranularity.id !== 'bundesland'}
                focusFeature={focusFeature}
                homeBounds={isSites ? siteBounds : showSea ? GERMANY_SEA_BOUNDS : GERMANY_BOUNDS}
                focusColor={focusColor}
                onExitFocus={exitScope}
                exitHint={`Klicken für ${parentName}-Ansicht`}
                onRegionClick={onRegionClick}
                heatmapUrl={heatmapUrl}
                onPlainWheel={onPlainWheel}
              >
                {isSites && <SiteMarkers sites={sites} />}
              </ChoroplethMap>
              {mapState === 'ready' && !isHeatmap && !bordersOnly && !isSites && (
                <MapLegend title={metric.legend} unit={metric.unit} ramp={config.ramp} max={scale.max} clipped={scale.clipped} />
              )}
              {isHeatmap && <div className="map-chip">Gauß-geglättete Anlagendichte</div>}
              {isSites && mapState === 'ready' && (
                <div className="map-chip site-legend">
                  <span className="site-legend__dot" /> in Betrieb
                  <span className="site-legend__dot is-inactive" /> in Planung / stillgelegt
                </div>
              )}
              {bordersOnly && mapState === 'ready' && <div className="map-chip">Nur Grenzen · Werte folgen</div>}
              <MapOverlay state={mapState} technology={technology} onRetry={retry} />
              <div className={`map-hint${wheelHint ? ' is-visible' : ''}`} aria-hidden="true">
                Strg + Scrollen zum Zoomen
              </div>
            </div>

            <footer className="map-card__footer">
              <span>Quelle: Marktstammdatenregister (BNetzA) · Datenstand {formatDate(SITE.dataStand)}</span>
              <span className="map-card__footer-hint">{mapHints.join(' · ')}</span>
            </footer>
          </section>

          <ControlPanel
            config={config}
            technology={technology}
            onTechnology={(id) => setParam('technologie', id, config.technologies[0].id)}
            subtypes={subtypes}
            onSubtypes={(ids) => setParam(technology.subtypes.param, ids.join(','), technology.subtypes.options.map((o) => o.id).join(','))}
            metrics={metrics}
            metric={metric}
            onMetric={(id) => setParam('kennzahl', id, metrics[0].id)}
            granularity={granularity}
            onGranularity={(id) => setParam('ebene', id, config.defaultGranularity)}
          />
        </div>

        <section className="dashboard-analyses" aria-labelledby="analysen-title">
          <div className="section-head">
            <div>
              <h2 id="analysen-title" className="section-head__title">
                Analysen
              </h2>
              <p className="section-head__lead">Vertiefende Auswertungen für {scopeLabel}. Weitere Ansichten folgen.</p>
            </div>
          </div>
          {timelines.map((a) => (
            <TimelineAnalysis key={a.id} analysis={a} />
          ))}
          {/* Top 10 + analyses: an even number of cards goes in pairs, so no row is left half empty. */}
          <div className={`analyses-grid${cards.length % 2 ? ' analyses-grid--pairs' : ''}`}>
            <article className="card">
              <header className="card__header">
                <div>
                  <h3 className="card__title">Top 10 · {isSites ? PLANTS.label : activeGranularity.label}</h3>
                  <div className="card__subtitle">
                    {metric.legend} ({metric.unit})
                  </div>
                </div>
              </header>
              <div className="card__body">
                <RankingPanel
                  features={isSites ? plantFeatures : merged?.features}
                  metric={metric}
                  granularity={isSites ? PLANTS : activeGranularity}
                  within={rankingWithin}
                  focusKey={rankingFocus}
                  status={!withData || bordersOnly ? 'unavailable' : isHeatmap ? 'heatmap' : mapState}
                  labelFor={isSites ? (f) => f.properties.name : labelFor}
                  onRowClick={canDrill && !isSites ? onRankingRowClick : undefined}
                />
              </div>
            </article>
            {cards.map((a) => (
              <article className="card" key={a.id}>
                <header className="card__header">
                  <div>
                    <h3 className="card__title">{a.title}</h3>
                    <div className="card__subtitle">{a.description}</div>
                  </div>
                  <Badge tone="soon" size="xs">
                    bald
                  </Badge>
                </header>
                <div className="card__body">
                  <ChartPlaceholder variant={a.variant} />
                </div>
              </article>
            ))}
          </div>
        </section>

        {config.todos?.map((todo) => (
          <TodoNote key={todo}>{todo}</TodoNote>
        ))}
      </div>
    </div>
  );
}
