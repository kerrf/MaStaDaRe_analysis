import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import StackedChart from '../../components/charts/StackedChart';
import ChartExport from '../../components/ui/ChartExport';
import { ERZEUGER, SPEICHER, STATES_TOPOLOGY } from '../../config/dashboards';
import { findBundeslandByAgs, regionName, withoutOffshore } from '../../config/regions';
import { API_BASE_URL } from '../../config/site';
import { RAMPS, makeColorScale, rampGradient } from '../../lib/colorScale';
import { statsUrl, useJson, useOutline, useStats, useTopology } from '../../lib/data';
import { round } from '../../lib/files';
import { formatAmount, formatCount, formatPower, formatShare } from '../../lib/format';
import { linesToPath, toSvg } from '../../lib/svgMap';
import { RoseSvg } from '../dashboard/OrientationRose';

const ROTATE_MS = 8000; // how long a preview shows before the next one, until someone chooses one
const technology = (config, id) => config.technologies.find((t) => t.id === id);
const BATTERY_PARTS = technology(SPEICHER, 'batterie').overview.parts;
const BATTERY_SINCE = 2015;

// The previews of the start page: what each shows, and the page it leads to
const SLIDES = [
  { id: 'solar', tab: 'Solar', title: 'Installierte PV-Leistung je Bundesland', topic: 'erzeuger', to: '/erzeuger', cta: 'Zur Karte' },
  { id: 'wind', tab: 'Wind', title: 'Installierte Windleistung je Bundesland', topic: 'erzeuger', to: '/erzeuger?technologie=wind', cta: 'Zur Karte' },
  { id: 'speicher', tab: 'Batteriespeicher', title: 'Neue Batteriespeicher je Jahr', topic: 'speicher', to: '/speicher/zubau', cta: 'Zum Zubau' },
  { id: 'ausrichtung', tab: 'Ausrichtung', title: 'Wohin die Solarmodule zeigen', topic: 'erzeuger', to: '/erzeuger/anlagen', cta: 'Zu den Anlagen' },
];

// A technology's power per Land on the map of Germany (its stats); a click on a Land opens its map
function MapPreview({ id, label, foot }) {
  const navigate = useNavigate();
  const states = useTopology(STATES_TOPOLOGY);
  const stats = useStats(statsUrl(technology(ERZEUGER, id).statsPath, 'bundesland'));
  const svg = useMemo(() => (states.data ? toSvg(withoutOffshore(states.data)) : null), [states.data]);
  const outline = useOutline(STATES_TOPOLOGY);
  const outlinePath = useMemo(() => (outline.data ? linesToPath(outline.data) : null), [outline.data]);
  const byAgs = useMemo(
    () => new Map((stats.status === 'ready' ? stats.data : []).filter((r) => findBundeslandByAgs(r.bundesland)).map((r) => [r.bundesland, r.total_power])),
    [stats.status, stats.data],
  );
  const max = Math.max(0, ...byAgs.values());
  const colorFor = makeColorScale(ERZEUGER.ramp, max);
  const live = byAgs.size > 0;
  const query = id === 'solar' ? '?ebene=landkreis' : `?technologie=${id}&ebene=landkreis`;
  return (
    <>
      <div className="preview__map">
        {svg ? (
          <svg viewBox={svg.viewBox} role="img" aria-label={`Karte der Bundesländer, eingefärbt nach ${label}`}>
            {svg.shapes.map((shape) => {
              const value = byAgs.get(shape.ags);
              const target = findBundeslandByAgs(shape.ags);
              return (
                <path
                  key={shape.ags}
                  d={shape.d}
                  style={{ fill: value != null ? colorFor(value) : 'var(--map-nodata)' }}
                  className="preview__region"
                  onClick={() => target && navigate(`/erzeuger/${target.code}${query}`)}
                >
                  <title>
                    {shape.name}
                    {value != null ? `: ${formatPower(value).value} ${formatPower(value).unit}` : ''}
                  </title>
                </path>
              );
            })}
            {outlinePath && <path d={outlinePath} className="germany-outline" />}
          </svg>
        ) : (
          <div className="skeleton preview__skeleton" />
        )}
      </div>
      {foot(
        live ? (
          <div className="preview__legend">
            <div className="preview__ramp" style={{ background: rampGradient(ERZEUGER.ramp) }} />
            <div className="preview__ticks tabular">
              <span>0</span>
              <span>
                {formatPower(max).value} {formatPower(max).unit}
              </span>
            </div>
          </div>
        ) : (
          <span className="preview__note">{stats.status === 'error' ? 'Live-Daten derzeit nicht verfügbar' : 'Lade Daten …'}</span>
        ),
        live && {
          name: `vorschau-${id}`,
          filename: `mastr_${id}_bundeslaender`,
          rows: () =>
            [...byAgs]
              .map(([ags, power]) => ({ Bundesland: regionName(ags), 'Installierte Leistung netto (MW)': round(power) }))
              .sort((a, b) => a.Bundesland.localeCompare(b.Bundesland, 'de')),
        },
      )}
    </>
  );
}

// The batteries' capacity added per year in Germany, by size class (/battery/zubau)
function BatteryPreview({ foot }) {
  const zubau = useJson(`${API_BASE_URL}/battery/zubau?region=DE`);
  const periods = useMemo(() => {
    if (!zubau.data?.length) return null;
    const latest = Math.max(...zubau.data.map((r) => r.year));
    return Array.from({ length: latest - BATTERY_SINCE + 1 }, (_, i) => BATTERY_SINCE + i).map((year) => ({
      key: String(year),
      label: year === latest ? `${year} (bis heute)` : String(year),
      tick: String(year),
      partial: year === latest,
      values: Object.fromEntries(BATTERY_PARTS.map((p) => [p.id, zubau.data.find((r) => r.year === year && r.size_class === p.id)?.added_capacity ?? 0])),
    }));
  }, [zubau.data]);
  return (
    <>
      <div className="preview__map preview__chart">
        {periods ? (
          <StackedChart periods={periods} series={BATTERY_PARTS} kind="bars" unit="MWh" label="Neue Batteriespeicher je Jahr, Kapazität" />
        ) : (
          <div className="skeleton preview__skeleton" />
        )}
      </div>
      {foot(
        <div className="preview__key">
          {BATTERY_PARTS.map((p) => (
            <span key={p.id}>
              <i style={{ background: p.color }} aria-hidden="true" /> {p.label}
            </span>
          ))}
        </div>,
        periods && {
          name: 'vorschau-speicher',
          filename: 'mastr_batteriespeicher_zubau',
          rows: () => periods.map((p) => ({ Jahr: Number(p.key), ...Object.fromEntries(BATTERY_PARTS.map((s) => [`${s.label} (MWh)`, round(p.values[s.id])])) })),
        },
      )}
    </>
  );
}

// The solar power by the main orientation of the modules in Germany: the rose of the page Anlagen
function RosePreview({ foot }) {
  const stats = useStats(`${API_BASE_URL}/solar/orientation?region=DE`);
  const rows = stats.status === 'ready' ? stats.data : null;
  const byId = useMemo(() => Object.fromEntries((rows ?? []).map((r) => [r.orientation, r])), [rows]);
  const total = (rows ?? []).reduce((t, r) => t + r.total_power, 0);
  const rowOf = (id) => byId[id] ?? { orientation: id, total_units: 0, total_power: 0 };
  const shareOf = (id) => (total ? rowOf(id).total_power / total : 0);
  const known = (rows ?? []).filter((r) => r.orientation !== 'unbekannt').map((r) => shareOf(r.orientation));
  const colorFor = makeColorScale(RAMPS.orange, Math.max(0.01, ...known));
  return (
    <>
      <div className="preview__map preview__rose rose">
        {rows ? (
          <RoseSvg rowOf={rowOf} shareOf={shareOf} colorFor={colorFor} label="Solarleistung nach Ausrichtung der Module" />
        ) : (
          <div className="skeleton preview__skeleton" />
        )}
      </div>
      {foot(
        <span className="preview__note">
          {rows ? `${formatShare(shareOf('sued'))} nach Süden · ${formatAmount(total, 'MW')} aus ${formatCount(rows.reduce((t, r) => t + r.total_units, 0))} Anlagen` : 'Lade Daten …'}
        </span>,
        rows && {
          name: 'vorschau-ausrichtung',
          filename: 'mastr_solar_ausrichtung',
          rows: () => rows.map((r) => ({ Ausrichtung: r.orientation, 'Leistung (MW)': round(r.total_power), 'Anteil (%)': round(100 * shareOf(r.orientation), 2), Anlagen: r.total_units })),
        },
      )}
    </>
  );
}

/**
 * The previews beside the start page's title: Solar and Wind per Land on the map, the batteries added per year, the
 * orientation of the solar modules – one at a time, in tabs; they turn on by themselves until someone chooses one, the
 * pointer or the keyboard rests on them, or the visitor prefers less motion. Each leads to its page and has its data
 * and picture as downloads.
 */
export default function HeroPreviews() {
  const [index, setIndex] = useState(0);
  const [chosen, setChosen] = useState(false);
  const [resting, setResting] = useState(false);
  const reduced = useRef(typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches);
  const rotating = !chosen && !resting && !reduced.current;
  useEffect(() => {
    if (!rotating) return undefined;
    const timer = setTimeout(() => setIndex((i) => (i + 1) % SLIDES.length), ROTATE_MS);
    return () => clearTimeout(timer);
  }, [rotating, index]);

  const slide = SLIDES[index];
  // The foot of every preview: what it needs to be read on the left, its downloads and its page on the right
  const foot = (left, csv) => (
    <div className="preview__foot">
      {left}
      <div className="preview__actions">
        {csv && <ChartExport {...csv} />}
        <Link to={slide.to} className="btn btn--secondary btn--sm">
          {slide.cta} <ArrowRight size={14} aria-hidden="true" />
        </Link>
      </div>
    </div>
  );
  return (
    <figure
      className="preview card"
      data-topic={slide.topic}
      onPointerEnter={() => setResting(true)}
      onPointerLeave={() => setResting(false)}
      onFocus={() => setResting(true)}
      onBlur={() => setResting(false)}
    >
      <div className="preview__tabs" role="tablist" aria-label="Vorschauen">
        {SLIDES.map((s, i) => (
          <button
            key={s.id}
            type="button"
            role="tab"
            aria-selected={i === index}
            aria-controls="preview-panel"
            className={`preview__tab${i === index ? ' is-active' : ''}`}
            onClick={() => {
              setIndex(i);
              setChosen(true);
            }}
          >
            {s.tab}
            {/* How long until the next one, while they turn */}
            {i === index && rotating && <span key={index} className="preview__timer" style={{ animationDuration: `${ROTATE_MS}ms` }} />}
          </button>
        ))}
      </div>
      <figcaption className="preview__head">
        <span className="eyebrow">Live-Vorschau</span>
        <span className="preview__title">{slide.title}</span>
      </figcaption>
      <div id="preview-panel" role="tabpanel" className="preview__panel">
        {slide.id === 'solar' || slide.id === 'wind' ? (
          <MapPreview key={slide.id} id={slide.id} label={slide.title} foot={foot} />
        ) : slide.id === 'speicher' ? (
          <BatteryPreview foot={foot} />
        ) : (
          <RosePreview foot={foot} />
        )}
      </div>
    </figure>
  );
}
