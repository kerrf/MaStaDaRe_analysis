import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Navigate, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Clock, Construction, Download, Info, Maximize2, Minimize2, RefreshCw, TriangleAlert } from 'lucide-react';
import Badge from '../../components/ui/Badge';
import ChartPlaceholder from '../../components/ui/ChartPlaceholder';
import TodoNote from '../../components/ui/TodoNote';
import { GRANULARITIES, STATES_TOPOLOGY } from '../../config/dashboards';
import { findBundesland, findBundeslandByMapId } from '../../config/regions';
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
import { exportCsv, exportPdf, exportPng } from './exportMap';
import './dashboard.css';

const LINE_WEIGHT = { bundesland: 1, plz2: 0.6, plz3: 0.35, plz5: 0.15 };

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

export default function MapDashboard({ config }) {
  const { land: landParam, kreis: kreisParam } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();

  const region = landParam ? findBundesland(landParam) : null;
  const technology = config.technologies.find((t) => t.id === searchParams.get('technologie')) ?? config.technologies[0];
  const metric = config.metrics.find((m) => m.id === searchParams.get('kennzahl')) ?? config.metrics[0];
  const defaultGranularity = GRANULARITIES.find((g) => g.id === config.defaultGranularity);
  let granularity = GRANULARITIES.find((g) => g.id === searchParams.get('ebene') && g.available !== false) ?? defaultGranularity;
  if (granularity.kind === 'heatmap' && !technology.heatmapPath) granularity = defaultGranularity;
  const isHeatmap = granularity.kind === 'heatmap';

  useDocumentTitle(region ? `${config.title} · ${region.name}` : config.title);

  const setParam = useCallback(
    (key, value, defaultValue) =>
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          if (value === defaultValue) next.delete(key);
          else next.set(key, value);
          return next;
        },
        { replace: true },
      ),
    [setSearchParams],
  );

  // Drilling into a Bundesland refines the shading, otherwise the map would show a single region.
  const selectRegion = useCallback(
    (code) => {
      const params = new URLSearchParams(searchParams);
      if (code && (params.get('ebene') ?? config.defaultGranularity) === 'bundesland') params.set('ebene', 'plz3');
      const query = params.toString();
      navigate(`${config.basePath}${code ? `/${code}` : ''}${query ? `?${query}` : ''}`);
    },
    [searchParams, navigate, config.basePath, config.defaultGranularity],
  );

  // ------------------------------------------------------------------ data
  const hasData = Boolean(technology.statsPath);
  const states = useTopology(STATES_TOPOLOGY);
  const shapes = useTopology(isHeatmap ? null : hasData ? granularity.topology : STATES_TOPOLOGY);
  const mapStats = useStats(isHeatmap ? null : statsUrl(technology.statsPath, granularity.apiLevel));
  const kpiStats = useStats(statsUrl(technology.statsPath, 'Bundesland'));

  const activeGranularity = hasData ? granularity : GRANULARITIES[0];

  const focusFeature = useMemo(
    () => (region && states.data ? states.data.features.find((f) => f.properties.id === region.mapId) ?? null : null),
    [region, states.data],
  );

  const merged = useMemo(() => {
    if (!shapes.data) return null;
    const rows = mapStats.status === 'ready' ? mapStats.data : [];
    const byKey = new Map(rows.map((row) => [String(row[activeGranularity.apiLevel]), row]));
    return {
      ...shapes.data,
      features: shapes.data.features.map((f) => {
        const key = String(f.properties[activeGranularity.featureKey]);
        const row = byKey.get(key);
        return { ...f, properties: { ...f.properties, ...row, _key: key, _hasData: Boolean(row) } };
      }),
    };
  }, [shapes.data, mapStats.status, mapStats.data, activeGranularity]);

  const scale = useMemo(() => {
    const values = merged ? merged.features.filter((f) => f.properties._hasData).map((f) => f.properties[metric.id] ?? 0) : [];
    const max = scaleDomainMax(values);
    const trueMax = values.reduce((m, v) => Math.max(m, v), 0);
    return { colorFor: makeColorScale(config.ramp, max), max, clipped: trueMax > max };
  }, [merged, metric.id, config.ramp]);

  let mapState = 'ready';
  if (!hasData) mapState = shapes.status === 'ready' ? 'unavailable' : 'loading';
  else if (isHeatmap) mapState = 'ready';
  else if (shapes.status === 'error' || mapStats.status === 'error') mapState = 'error';
  else if (shapes.status !== 'ready' || mapStats.status !== 'ready') mapState = 'loading';

  const retry = () => {
    shapes.retry();
    mapStats.retry();
    kpiStats.retry();
  };

  // ------------------------------------------------------------- map glue
  const labelFor = useCallback(
    (f) => (activeGranularity.id === 'bundesland' ? f.properties.name : `${activeGranularity.regionPrefix}${f.properties._key}`),
    [activeGranularity],
  );

  const canDrill = hasData && activeGranularity.id === 'bundesland';
  const onRegionClick = useCallback(
    (f) => {
      const target = findBundeslandByMapId(f.properties.id);
      if (target) selectRegion(target.code);
    },
    [selectRegion],
  );

  const mapCardRef = useRef(null);
  const onRankingRowClick = (f) => {
    onRegionClick(f);
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    mapCardRef.current?.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'start' });
  };

  const tooltipFor = useCallback(
    (f) => {
      const p = f.properties;
      const rows = p._hasData
        ? config.tooltipRows
            .map(
              (r) =>
                `<tr${r.key === metric.id ? ' class="is-active"' : ''}><th>${r.label}</th><td>${formatNumber(p[r.key], r.digits)}</td><td>${r.unit ?? ''}</td></tr>`,
            )
            .join('')
        : '<tr><td class="map-tooltip__empty" colspan="3">Keine Daten</td></tr>';
      const hint = canDrill ? '<div class="map-tooltip__hint">Klicken für Bundesland-Ansicht</div>' : '';
      return `<div class="map-tooltip__title">${escapeHtml(labelFor(f))}</div><table>${rows}</table>${hint}`;
    },
    [config.tooltipRows, metric.id, labelFor, canDrill],
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
  const scopeLabel = region?.name ?? 'Deutschland';
  const fileBase = `mastr_${config.id}_${technology.id}_${region?.code ?? 'de'}_${granularity.id}`;
  const handleExport = async (kind) => {
    setExporting(kind);
    try {
      if (kind === 'png') await exportPng(frameRef.current, fileBase);
      if (kind === 'pdf') await exportPdf(frameRef.current, fileBase, `${technology.label}: ${metric.legend} – ${scopeLabel} (${granularity.label})`);
      if (kind === 'csv') exportCsv(mapStats.data, fileBase);
    } finally {
      setExporting(null);
    }
  };

  if (landParam && !region) return <Navigate to={config.basePath} replace />;

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
              {region && <span className="dashboard-header__scope">{region.name}</span>}
            </h1>
            <p className="dashboard-header__lead">{config.description}</p>
          </div>
          <div className="dashboard-header__meta">
            <Badge icon={Clock}>Datenstand {formatDate(SITE.dataStand)}</Badge>
            {hasData ? <Badge tone="live">Live-Daten</Badge> : <Badge tone="soon">In Vorbereitung</Badge>}
          </div>
        </div>
      </header>

      <div className="container dashboard-body">
        <ScopeBar region={region} kreisCode={kreisParam} onSelectRegion={selectRegion} />

        {kreisParam && (
          <div className="notice" role="status">
            <Info size={16} aria-hidden="true" />
            <span>
              Die Landkreis-Ansicht ist in Vorbereitung. Angezeigt wird vorerst <strong>{region?.name}</strong>.
            </span>
          </div>
        )}

        <KpiStrip kpis={config.kpis} rows={kpiStats.data} status={hasData ? kpiStats.status : 'idle'} region={region} />

        <div className="dashboard-main">
          <section ref={mapCardRef} className={`card map-card${fullscreen ? ' is-fullscreen' : ''}`} aria-label="Karte">
            <header className="card__header map-card__header">
              <div>
                <h2 className="card__title">
                  {technology.label}: {isHeatmap ? 'Anlagendichte' : metric.legend}
                </h2>
                <div className="card__subtitle">
                  {scopeLabel} · {granularity.label}
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
                      disabled={Boolean(exporting) || mapState !== 'ready' || (kind === 'csv' && !mapStats.data)}
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
                lineWeight={LINE_WEIGHT[activeGranularity.id] ?? 0.5}
                tooltipFor={tooltipFor}
                outlines={states.data}
                showOutlines={activeGranularity.id !== 'bundesland'}
                focusFeature={focusFeature}
                focusColor={focusColor}
                onRegionClick={canDrill ? onRegionClick : undefined}
                heatmapUrl={heatmapUrl}
                onPlainWheel={onPlainWheel}
              />
              {mapState === 'ready' && !isHeatmap && (
                <MapLegend title={metric.legend} unit={metric.unit} ramp={config.ramp} max={scale.max} clipped={scale.clipped} />
              )}
              {isHeatmap && <div className="map-chip">Gauß-geglättete Anlagendichte</div>}
              <MapOverlay state={mapState} technology={technology} onRetry={retry} />
              <div className={`map-hint${wheelHint ? ' is-visible' : ''}`} aria-hidden="true">
                Strg + Scrollen zum Zoomen
              </div>
            </div>

            <footer className="map-card__footer">
              <span>Quelle: Marktstammdatenregister (BNetzA) · Datenstand {formatDate(SITE.dataStand)}</span>
              <span className="map-card__footer-hint">Strg/⌘ + Mausrad zum Zoomen{canDrill ? ' · Klick auf ein Land zum Hineinzoomen' : ''}</span>
            </footer>
          </section>

          <ControlPanel
            config={config}
            technology={technology}
            onTechnology={(id) => setParam('technologie', id, config.technologies[0].id)}
            metric={metric}
            onMetric={(id) => setParam('kennzahl', id, config.metrics[0].id)}
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
          <div className="analyses-grid">
            <article className="card">
              <header className="card__header">
                <div>
                  <h3 className="card__title">Top 10 · {activeGranularity.label}</h3>
                  <div className="card__subtitle">
                    {metric.legend} ({metric.unit})
                  </div>
                </div>
              </header>
              <div className="card__body">
                <RankingPanel
                  features={merged?.features}
                  metric={metric}
                  granularity={activeGranularity}
                  region={region}
                  status={!hasData ? 'unavailable' : isHeatmap ? 'heatmap' : mapState}
                  labelFor={labelFor}
                  onRowClick={canDrill ? onRankingRowClick : undefined}
                />
              </div>
            </article>
            {config.analyses.map((a) => (
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
