import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Construction, Download, Maximize2, Minimize2, RefreshCw, TriangleAlert } from 'lucide-react';
import { GRANULARITIES, STATES_TOPOLOGY, footnoteId, hasData, isAvailable } from '../../config/dashboards';
import { GERMANY_BOUNDS, GERMANY_SEA_BOUNDS, findBundeslandByAgs, isKreisKey, withoutOffshore } from '../../config/regions';
import { API_BASE_URL } from '../../config/site';
import { DASHBOARD_MENUS, VIEWS, viewsOf } from '../../config/views';
import { makeColorScale, scaleDomainMax } from '../../lib/colorScale';
import { statsUrl, useDatenstand, useStats, useTopology } from '../../lib/data';
import { escapeHtml, formatDate, formatNumber } from '../../lib/format';
import ChoroplethMap from './ChoroplethMap';
import ControlPanel from './ControlPanel';
import KpiStrip from './KpiStrip';
import MapLegend from './MapLegend';
import RankingPanel from './RankingPanel';
import ScopeBar from './ScopeBar';
import SiteMarkers from './SiteMarkers';
import { boundsAround, groupByLocation, perRegion } from './sites';
import { exportCsv, exportPdf, exportPng } from './exportMap';

const LINE_WEIGHT = { bundesland: 1, landkreis: 0.5, gemeinde: 0.2, plz2: 0.6, plz3: 0.35, plz5: 0.15 };
const LANDKREIS = GRANULARITIES.find((g) => g.id === 'landkreis');
// Length of the Gemeindeschlüssel prefix that keys each region level.
const AGS_LENGTH = { bundesland: 2, landkreis: 5, gemeinde: 8 };

const NO_PLANTS = [];

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

// The other pages of the dashboard, next to the Top 10: what they show, in the scope of the map where they have one
function MorePages({ config, state }) {
  const menu = DASHBOARD_MENUS.find((m) => m.id === config.id);
  const pages = viewsOf(config.id).filter((id) => id !== 'karte');
  if (!pages.length) return null;
  return (
    <article className="card more-pages">
      <header className="card__header">
        <div>
          <h3 className="card__title">Weitere Analysen</h3>
          <div className="card__subtitle">{state.region ? `Zu ${state.scopeName} und im Vergleich` : 'Zu Deutschland und seinen Regionen'}</div>
        </div>
      </header>
      <ul className="more-pages__list">
        {pages.map((id) => {
          const { icon: Icon, label, scoped } = VIEWS[id];
          return (
            <li key={id}>
              <Link to={state.hrefOf(id)} className="more-pages__link">
                <span className="more-pages__icon" aria-hidden="true">
                  <Icon size={18} />
                </span>
                <span className="more-pages__text">
                  <span className="more-pages__label">
                    {label}
                    {!scoped && state.region && <span className="more-pages__scope">Deutschland</span>}
                  </span>
                  <span className="more-pages__description">{menu.views[id]}</span>
                </span>
                <ArrowRight size={16} aria-hidden="true" className="more-pages__arrow" />
              </Link>
            </li>
          );
        })}
      </ul>
    </article>
  );
}

// The map page of a dashboard: KPIs of the scope, the map with its controls, and the Top 10 of its areas
export default function MapView({ config, state }) {
  const datenstand = useDatenstand();
  const { region, kreisAgs, kreise, kreisOptions, kreisFeature, scopeName, parentName, technology, subtypes, leistung } = state;
  const { selectionQuery, selectionNote, setParam, selectScope, exitScope } = state;
  const { searchParams } = state;

  // Some technologies show their plants as icons at their location instead of shaded areas (Pumpspeicher, Gas). They rank
  // as plants within the scope, keyed by their Gemeindeschlüssel.
  const isSites = Boolean(technology.plantsPath);
  const plantsLevel = isSites ? { id: 'standorte', label: technology.site.label, featureKey: 'ags' } : null;
  const metrics = technology.metrics ?? config.metrics;
  const metric = metrics.find((m) => m.id === searchParams.get('kennzahl')) ?? metrics[0];
  const defaultGranularity = GRANULARITIES.find((g) => g.id === config.defaultGranularity);
  const requested = GRANULARITIES.find((g) => g.id === searchParams.get('ebene'));
  const granularity = requested && isAvailable(requested, technology) ? requested : defaultGranularity;
  const isHeatmap = granularity.kind === 'heatmap';
  // Layers without an apiLevel show their borders only.
  const bordersOnly = !isHeatmap && !isSites && !granularity.apiLevel;
  // The sea is a region of its own, but only for technologies that are built there (offshore wind), while chosen
  const showSea = Boolean(technology.offshore && subtypes?.includes(technology.offshore));

  // ------------------------------------------------------------------ data
  const withData = hasData(technology);
  const states = useTopology(STATES_TOPOLOGY);
  const shapes = useTopology(isHeatmap ? null : withData && !isSites ? granularity.topology : STATES_TOPOLOGY);
  const mapStats = useStats(isHeatmap || isSites ? null : statsUrl(technology.statsPath, granularity.apiLevel, selectionQuery));
  const kpiStats = useStats(isSites ? null : statsUrl(technology.statsPath, 'bundesland', selectionQuery));
  const kreisStats = useStats(kreisAgs && !isSites ? statsUrl(technology.statsPath, LANDKREIS.apiLevel, selectionQuery) : null);
  const plants = useStats(isSites ? `${API_BASE_URL}${technology.plantsPath}` : null);

  // The plants lie on the Bundesländer, which are drawn without values. Their subtypes (Gas: Technologie, Speicherart)
  // filter them here and colour them.
  const activeGranularity = withData && !isSites ? granularity : GRANULARITIES[0];
  const subtypeField = isSites ? technology.subtypes?.field : null;
  const subtypeKey = subtypes?.join(',');
  const plantRows = useMemo(() => {
    if (plants.status !== 'ready') return NO_PLANTS;
    const chosen = subtypeKey?.split(',');
    return subtypeField ? plants.data.filter((p) => chosen.includes(p[subtypeField])) : plants.data;
  }, [plants.status, plants.data, subtypeField, subtypeKey]);
  const categoryOf = useMemo(() => {
    if (!subtypeField) return undefined;
    const byId = new Map(technology.subtypes.options.map((o) => [o.id, o]));
    return (plant) => byId.get(plant[subtypeField]);
  }, [subtypeField, technology.subtypes]);
  const sites = useMemo(() => groupByLocation(plantRows), [plantRows]);
  const siteBounds = useMemo(() => boundsAround(plants.status === 'ready' ? plants.data : NO_PLANTS), [plants.status, plants.data]);
  const plantKey = technology.site?.key;
  const plantFeatures = useMemo(
    () => plantRows.filter((p) => p.ags).map((p) => ({ properties: { ...p, _key: p[plantKey], _hasData: true } })),
    [plantRows, plantKey],
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
  const kpis = technology.kpis ?? config.kpis;
  const plantFields = kpis.map((kpi) => kpi.field).filter((field) => field !== 'plants' && field !== 'planned');
  const bundeslandRows = isSites ? { data: perRegion(plantRows, 'bundesland', plantFields), status: plants.status } : kpiStats;
  const landkreisRows = isSites ? { data: perRegion(plantRows, 'landkreis', plantFields), status: plants.status } : kreisStats;
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
  // Solar values say which power they are; the map title points to the footnote that explains it
  const metricLegend = leistung ? `${metric.legend} · ${leistung.label}` : metric.legend;
  const mapTitle = isSites ? 'Standorte' : isHeatmap ? 'Anlagendichte' : metricLegend;
  const leistungNote = technology.leistung?.note;
  const layerLabel = isSites ? `${plantsLevel.label}${selectionNote}` : `${granularity.label}${isHeatmap ? '' : selectionNote}`;
  const exportRows = mapData.data;
  const fileBase = `mastr_${config.id}_${technology.id}_${kreisAgs ?? region?.code ?? 'de'}_${isSites ? plantsLevel.id : granularity.id}`;
  const handleExport = async (kind) => {
    setExporting(kind);
    try {
      if (kind === 'png') await exportPng(frameRef.current, fileBase);
      if (kind === 'pdf') await exportPdf(frameRef.current, fileBase, `${technology.label}: ${mapTitle} – ${scopeLabel} (${layerLabel})`, datenstand);
      if (kind === 'csv') exportCsv(exportRows, fileBase);
    } finally {
      setExporting(null);
    }
  };

  const heatmapUrl = technology.heatmapPath ? `${API_BASE_URL}${technology.heatmapPath}` : null;
  const focusColor = config.ramp[config.ramp.length - 1];

  return (
    <>
      <ScopeBar region={region} kreis={kreisAgs} kreisOptions={kreisOptions} onSelectScope={selectScope} />

      <KpiStrip kpis={kpis} {...kpiScope} status={withData ? kpiScope.status : 'idle'} parentName={parentName} />

      <div className="dashboard-main">
        <section ref={mapCardRef} className={`card map-card${fullscreen ? ' is-fullscreen' : ''}`} aria-label="Karte">
          <header className="card__header map-card__header">
            <div>
              <h2 className="card__title">
                {technology.label}: {mapTitle}
                {leistungNote && !isSites && !isHeatmap && (
                  <sup className="footnote-ref" aria-hidden="true">
                    1
                  </sup>
                )}
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
              {isSites && <SiteMarkers sites={sites} site={technology.site} categoryOf={categoryOf} />}
            </ChoroplethMap>
            {mapState === 'ready' && !isHeatmap && !bordersOnly && !isSites && (
              <MapLegend title={metricLegend} unit={metric.unit} ramp={config.ramp} max={scale.max} clipped={scale.clipped} />
            )}
            {isHeatmap && <div className="map-chip">Gauß-geglättete Anlagendichte</div>}
            {isSites && mapState === 'ready' && (
              <div className="map-chip site-legend">
                {categoryOf ? (
                  technology.subtypes.options
                    .filter((o) => subtypes.includes(o.id))
                    .map((o) => (
                      <span key={o.id} className="site-legend__item">
                        <span className="site-legend__dot" style={{ background: o.color }} /> {o.label}
                      </span>
                    ))
                ) : (
                  <span className="site-legend__item">
                    <span className="site-legend__dot" /> in Betrieb
                  </span>
                )}
                <span className="site-legend__item">
                  <span className="site-legend__dot is-inactive" /> in Planung / stillgelegt
                </span>
              </div>
            )}
            {bordersOnly && mapState === 'ready' && <div className="map-chip">Nur Grenzen · Werte folgen</div>}
            <MapOverlay state={mapState} technology={technology} onRetry={retry} />
            <div className={`map-hint${wheelHint ? ' is-visible' : ''}`} aria-hidden="true">
              Strg + Scrollen zum Zoomen
            </div>
          </div>

          <footer className="map-card__footer">
            <span>Quelle: Marktstammdatenregister (BNetzA) · Datenstand {formatDate(datenstand)}</span>
            <span className="map-card__footer-hint">{mapHints.join(' · ')}</span>
            {/* Boundaries, Gemeinden and place names (VG250, GN250): the BKG asks for this line, linked, wherever its data is shown */}
            <span className="map-card__credit">
              Karte: ©{' '}
              <a href="https://www.bkg.bund.de" target="_blank" rel="noopener noreferrer">
                BKG
              </a>{' '}
              (2026){' '}
              <a href="https://www.govdata.de/dl-de/by-2-0" target="_blank" rel="noopener noreferrer">
                dl-de/by-2-0
              </a>
              , Daten verändert ·{' '}
              <a href="https://sgx.geodatenzentrum.de/web_public/gdz/datenquellen/datenquellen_gn250.pdf" target="_blank" rel="noopener noreferrer">
                Datenquellen
              </a>{' '}
              · Marine Regions · Natural Earth
            </span>
            {leistungNote && (
              <p id={footnoteId(technology.leistung)} className="map-card__footnote">
                <sup className="footnote-ref">1</sup> {leistungNote}
              </p>
            )}
            {technology.note && <p className="map-card__footnote">{technology.note}</p>}
          </footer>
        </section>

        <ControlPanel
          config={config}
          technology={technology}
          onTechnology={state.setTechnology}
          subtypes={subtypes}
          onSubtypes={state.setSubtypes}
          leistung={leistung}
          onLeistung={state.setLeistung}
          metrics={metrics}
          metric={metric}
          onMetric={(id) => setParam('kennzahl', id, metrics[0].id)}
          granularity={granularity}
          onGranularity={(id) => setParam('ebene', id, config.defaultGranularity)}
        />
      </div>

      {/* Right below the map, for its scope: the Top 10 of its areas, and where the analyses are */}
      <div className="analyses-grid analyses-grid--pairs">
        <article className="card">
          <header className="card__header">
            <div>
              <h3 className="card__title">Top 10 · {isSites ? plantsLevel.label : activeGranularity.label}</h3>
              <div className="card__subtitle">
                {metricLegend} ({metric.unit})
              </div>
            </div>
          </header>
          <div className="card__body">
            <RankingPanel
              features={isSites ? plantFeatures : merged?.features}
              metric={metric}
              granularity={isSites ? plantsLevel : activeGranularity}
              within={rankingWithin}
              focusKey={rankingFocus}
              status={!withData || bordersOnly ? 'unavailable' : isHeatmap ? 'heatmap' : mapState}
              labelFor={isSites ? (f) => f.properties.name : labelFor}
              onRowClick={canDrill && !isSites ? onRankingRowClick : undefined}
            />
          </div>
        </article>
        <MorePages config={config} state={state} />
      </div>
    </>
  );
}
