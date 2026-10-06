import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import StackedChart from '../../components/charts/StackedChart';
import { ChartFoot } from '../../components/ui/CsvLink';
import { STATES_TOPOLOGY } from '../../config/dashboards';
import { withoutOffshore } from '../../config/regions';
import { useStats, useTopology } from '../../lib/data';
import { round } from '../../lib/files';
import { formatAmount } from '../../lib/format';
import { project, toSvg } from '../../lib/svgMap';
import { ERZEUGER_TIMELINE, SPEICHER_TIMELINE, URLS, sourceOf } from './homeData';

// Zubau per year of a dashboard's timeline, stacked like on the dashboard (the latest year lighter: still running).
// filename: of its CSV
function ZubauChart({ timeline, label, filename }) {
  const zubau = useStats(URLS.zubau);
  const periods = useMemo(() => {
    if (zubau.status !== 'ready') return null;
    const byYear = new Map();
    for (const row of zubau.data) {
      if (!byYear.has(row.year)) byYear.set(row.year, {});
      byYear.get(row.year)[row.technology] = row.added;
    }
    const latest = Math.max(...byYear.keys());
    return Array.from({ length: latest - timeline.since + 1 }, (_, i) => {
      const year = timeline.since + i;
      return {
        key: String(year),
        label: year === latest ? `${year} (laufendes Jahr)` : String(year),
        tick: String(year),
        partial: year === latest,
        values: Object.fromEntries(timeline.series.map((s) => [s.id, byYear.get(year)?.[sourceOf(s)] ?? null])),
      };
    });
  }, [zubau.status, zubau.data, timeline]);

  if (!periods) return <div className="chapter__loading skeleton" />;
  return (
    <>
      <StackedChart periods={periods} series={timeline.series} kind="bars" unit={timeline.unit} label={label} />
      <ChartFoot
        csv={{
          name: 'zubau-start',
          filename,
          rows: () =>
            periods.map((p) => ({
              Jahr: Number(p.key),
              ...Object.fromEntries(
                timeline.series.map((s) => [`Zubau ${s.label}${s.netto ? ' netto' : ''} (${timeline.unit})`, round(p.values[s.id])]),
              ),
            })),
        }}
      >
        <div className="chapter__legend">
          {[...timeline.series].reverse().map((s) => (
            <span key={s.id}>
              <i style={{ background: s.color }} /> {s.label}
            </span>
          ))}
        </div>
      </ChartFoot>
    </>
  );
}

// The gas storages as circles at their location, the area by their working gas; the largest named
function GasStorageMap() {
  const states = useTopology(STATES_TOPOLOGY);
  const storages = useStats(URLS.gasStorages);
  const svg = useMemo(() => (states.data ? toSvg(withoutOffshore(states.data)) : null), [states.data]);
  const bubbles = useMemo(() => {
    const running = (storages.data ?? []).filter((s) => s.status === 'in Betrieb' && s.total_capacity > 0);
    const max = Math.max(1, ...running.map((s) => s.total_capacity));
    return running
      .sort((a, b) => b.total_capacity - a.total_capacity) // the small ones on top
      .map((s) => {
        const [x, y] = project([s.lon, s.lat]);
        return { ...s, x, y, r: Math.max(4, 52 * Math.sqrt(s.total_capacity / max)) }; // map units (Germany: ~570 wide)
      });
  }, [storages.data]);

  if (!svg || storages.status !== 'ready') return <div className="chapter__loading skeleton" />;
  const largest = bubbles[0];
  const csv = {
    name: 'gasspeicher-start',
    filename: 'mastr_gasspeicher_in_betrieb',
    rows: () =>
      bubbles.map((s) => ({
        Name: s.name,
        'Arbeitsgas (GWh)': round(s.total_capacity),
        Breitengrad: s.lat,
        Längengrad: s.lon,
        'MaStR-Nummer': s.mastr_nummer,
      })),
  };
  return (
    <>
      <svg viewBox={svg.viewBox} className="gas-map" role="img" aria-label="Gasspeicher in Deutschland, Kreisfläche nach Arbeitsgas">
        {svg.shapes.map((shape) => (
          <path key={shape.ags} d={shape.d} className="gas-map__land" />
        ))}
        {bubbles.map((s) => (
          <circle key={s.mastr_nummer} cx={s.x} cy={s.y} r={s.r} className="gas-map__bubble">
            <title>
              {s.name}: {formatAmount(s.total_capacity, 'GWh')}
            </title>
          </circle>
        ))}
        {largest && (
          <text className="gas-map__label" x={largest.x + largest.r + 8} y={largest.y} dy="0.35em">
            {largest.name} · {formatAmount(largest.total_capacity, 'GWh')}
          </text>
        )}
      </svg>
      <ChartFoot csv={csv} />
    </>
  );
}

const CHAPTERS = [
  {
    topic: 'erzeuger',
    number: '01',
    eyebrow: 'Stromerzeugung',
    title: 'Erzeuger',
    to: '/erzeuger',
    cta: 'Karte der Erzeuger',
    text:
      'Wo in Deutschland Strom aus Sonne, Wind und Wasser entsteht – je Bundesland, Landkreis, Gemeinde und Postleitzahl, ' +
      'absolut, je km² oder je Einwohner. Dazu der Zubau seit 2000, die Ausrichtung der Module und die Größe der Anlagen.',
    caption: 'Neu in Betrieb genommene Leistung je Jahr',
    visual: (
      <ZubauChart timeline={ERZEUGER_TIMELINE} label="Zubau von Solar- und Windleistung je Jahr seit 2000" filename="mastr_erzeuger_zubau_jaehrlich" />
    ),
  },
  {
    topic: 'speicher',
    number: '02',
    eyebrow: 'Stromspeicher',
    title: 'Speicher',
    to: '/speicher',
    cta: 'Karte der Speicher',
    text:
      'Batteriespeicher vom Heimspeicher im Keller bis zum Großspeicher am Umspannwerk, dazu jedes Pumpspeicherkraftwerk ' +
      'mit Turbinen- und Pumpleistung – und wie viele Solaranlagen ihren Strom schon selbst speichern.',
    caption: 'Neue Batteriekapazität je Jahr, nach Größenklasse',
    visual: (
      <ZubauChart timeline={SPEICHER_TIMELINE} label="Zubau von Batteriekapazität je Jahr seit 2013" filename="mastr_speicher_zubau_jaehrlich" />
    ),
  },
  {
    topic: 'gas',
    number: '03',
    eyebrow: 'Gasinfrastruktur',
    title: 'Gas',
    to: '/gas',
    cta: 'Karte der Gasanlagen',
    text:
      'Biomethananlagen, Erdgasförderung, LNG-Terminals und Elektrolyseure, dazu die großen Untertagespeicher in Salzkavernen ' +
      'und alten Lagerstätten – jede Anlage an ihrem Standort.',
    caption: 'Gasspeicher, die Kreisfläche nach Arbeitsgas',
    visual: <GasStorageMap />,
  },
];

// One chapter per dashboard: what it answers on the left, a live chart of its data on the right
export default function Chapters() {
  return (
    <div className="chapters">
      {CHAPTERS.map((c) => (
        <article key={c.topic} className="chapter" data-topic={c.topic} aria-labelledby={`kapitel-${c.topic}`}>
          <div className="chapter__text">
            <span className="chapter__eyebrow">
              <span className="tabular">{c.number}</span> {c.eyebrow}
            </span>
            <h3 id={`kapitel-${c.topic}`} className="chapter__title">
              {c.title}
            </h3>
            <p className="chapter__lead">{c.text}</p>
            <Link to={c.to} className="chapter__cta">
              {c.cta} <ArrowRight size={16} aria-hidden="true" />
            </Link>
          </div>
          <figure className="chapter__visual">
            <figcaption className="chapter__caption">{c.caption}</figcaption>
            {c.visual}
          </figure>
        </article>
      ))}
    </div>
  );
}
