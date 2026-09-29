import { useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { ERZEUGER, STATES_TOPOLOGY } from '../../config/dashboards';
import { findBundeslandByAgs, withoutOffshore } from '../../config/regions';
import { makeColorScale, rampGradient } from '../../lib/colorScale';
import { statsUrl, useStats, useTopology } from '../../lib/data';
import { formatPower } from '../../lib/format';

const COS_LAT = Math.cos((51 * Math.PI) / 180);
const project = ([lng, lat]) => [lng * COS_LAT * 100, -lat * 100];

function toSvg(collection) {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  const shapes = collection.features.map((f) => {
    const { type, coordinates } = f.geometry;
    const polygons = type === 'Polygon' ? [coordinates] : coordinates;
    const d = polygons
      .flatMap((polygon) =>
        polygon.map(
          (ring) =>
            `M${ring
              .map((point) => {
                const [x, y] = project(point);
                minX = Math.min(minX, x);
                minY = Math.min(minY, y);
                maxX = Math.max(maxX, x);
                maxY = Math.max(maxY, y);
                return `${x.toFixed(1)},${y.toFixed(1)}`;
              })
              .join('L')}Z`,
        ),
      )
      .join('');
    return { ags: f.properties.ags, name: f.properties.name, d };
  });
  return { shapes, viewBox: `${minX} ${minY} ${maxX - minX} ${maxY - minY}` };
}

export default function GermanyPreview() {
  const navigate = useNavigate();
  const states = useTopology(STATES_TOPOLOGY);
  const stats = useStats(statsUrl(ERZEUGER.technologies[0].statsPath, 'bundesland'));

  const svg = useMemo(() => (states.data ? toSvg(withoutOffshore(states.data)) : null), [states.data]);
  const byAgs = useMemo(
    () => new Map((stats.status === 'ready' ? stats.data : []).map((row) => [row.bundesland, row.total_power])),
    [stats.status, stats.data],
  );
  const max = Math.max(0, ...byAgs.values());
  const colorFor = makeColorScale(ERZEUGER.ramp, max);
  const live = byAgs.size > 0;

  return (
    <figure className="preview card" data-topic="erzeuger">
      <figcaption className="preview__head">
        <span className="eyebrow">{live ? 'Live-Vorschau' : 'Vorschau'}</span>
        <span className="preview__title">Installierte PV-Leistung je Bundesland</span>
      </figcaption>

      <div className="preview__map">
        {svg ? (
          <svg viewBox={svg.viewBox} role="img" aria-label="Karte der Bundesländer, eingefärbt nach installierter PV-Leistung">
            {svg.shapes.map((shape) => {
              const value = byAgs.get(shape.ags);
              const target = findBundeslandByAgs(shape.ags);
              return (
                <path
                  key={shape.ags}
                  d={shape.d}
                  style={{ fill: value != null ? colorFor(value) : 'var(--map-nodata)' }}
                  className="preview__region"
                  onClick={() => target && navigate(`/erzeuger/${target.code}?ebene=landkreis`)}
                >
                  <title>
                    {shape.name}
                    {value != null ? `: ${formatPower(value).value} ${formatPower(value).unit}` : ''}
                  </title>
                </path>
              );
            })}
          </svg>
        ) : (
          <div className="skeleton preview__skeleton" />
        )}
      </div>

      <div className="preview__foot">
        {live ? (
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
          <span className="preview__note">{stats.status === 'loading' ? 'Lade Daten …' : 'Live-Daten derzeit nicht verfügbar'}</span>
        )}
        <Link to="/erzeuger" className="btn btn--secondary btn--sm">
          Zur Karte <ArrowRight size={14} aria-hidden="true" />
        </Link>
      </div>
    </figure>
  );
}
