import { useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import CsvLink from '../../components/ui/CsvLink';
import { ERZEUGER, STATES_TOPOLOGY } from '../../config/dashboards';
import { findBundeslandByAgs, regionName, withoutOffshore } from '../../config/regions';
import { makeColorScale, rampGradient } from '../../lib/colorScale';
import { statsUrl, useStats, useTopology } from '../../lib/data';
import { round } from '../../lib/files';
import { formatPower } from '../../lib/format';
import { toSvg } from '../../lib/svgMap';

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
        <div className="preview__actions">
          {live && (
            <CsvLink
              name="vorschau"
              filename="mastr_solar_bundeslaender"
              rows={() =>
                [...byAgs]
                  .filter(([ags]) => findBundeslandByAgs(ags))
                  .map(([ags, power]) => ({ Bundesland: regionName(ags), 'Installierte Leistung netto (MW)': round(power) }))
                  .sort((a, b) => a.Bundesland.localeCompare(b.Bundesland, 'de'))
              }
            />
          )}
          <Link to="/erzeuger" className="btn btn--secondary btn--sm">
            Zur Karte <ArrowRight size={14} aria-hidden="true" />
          </Link>
        </div>
      </div>
    </figure>
  );
}
