import { useEffect, useState } from 'react';
import { formatTick } from '../../lib/format';
import { rampGradient } from '../../lib/colorScale';
import { positionOf } from '../../lib/heatmap';

export default function MapLegend({ title, unit, ramp, max, clipped }) {
  return (
    <div className="map-legend">
      <div className="map-legend__title">
        {title}
        {unit && <span className="map-legend__unit"> ({unit})</span>}
      </div>
      <div className="map-legend__ramp" style={{ background: rampGradient(ramp) }} />
      <div className="map-legend__ticks tabular">
        <span>0</span>
        <span>{formatTick(max / 2)}</span>
        <span>
          {clipped ? '≥ ' : ''}
          {formatTick(max)}
        </span>
      </div>
      <div className="map-legend__nodata">
        <span className="map-legend__swatch" aria-hidden="true" /> Keine Daten
      </div>
    </div>
  );
}

// Ticks of a logarithmic scale: 1, 2, 5, 10, 20, 50, … between its ends, thinned to the decades where they'd crowd
function ticksOf(scale) {
  const ticks = [];
  for (let e = Math.floor(Math.log10(scale.low)); e <= Math.ceil(Math.log10(scale.high)); e += 1) {
    for (const f of [1, 2, 5]) {
      const tick = f * 10 ** e;
      if (tick >= scale.low && tick <= scale.high) ticks.push(tick);
    }
  }
  return ticks.length > 5 ? ticks.filter((tick) => Number.isInteger(Math.log10(tick)) || ticks.length <= 5) : ticks;
}

/**
 * The legend of the continuous map: its colours on a logarithmic scale (the view's high end and a thousandth of it), the
 * smoothing at this zoom, and the density under the pointer. hoverRef: the map sets it through hoverRef.current(value).
 */
export function HeatmapLegend({ title, unit, ramp, scale, smoothingKm, hoverRef }) {
  const [hover, setHover] = useState(null);
  useEffect(() => {
    const ref = hoverRef;
    ref.current = setHover;
    return () => {
      ref.current = null;
    };
  }, [hoverRef]);
  return (
    <div className="map-legend map-legend--heat">
      <div className="map-legend__title">
        {title}
        <span className="map-legend__unit"> ({unit})</span>
      </div>
      <div className="map-legend__ramp" style={{ background: rampGradient(ramp) }} />
      {scale ? (
        <div className="map-legend__scale tabular" aria-label="Logarithmische Skala">
          {ticksOf(scale).map((tick) => (
            <span key={tick} style={{ left: `${positionOf(tick, scale) * 100}%` }}>
              {formatTick(tick)}
            </span>
          ))}
        </div>
      ) : (
        <div className="map-legend__ticks">Keine Werte im Ausschnitt</div>
      )}
      <div className="map-legend__note">
        Logarithmisch, passt sich dem Ausschnitt an · geglättet über ≈ {formatTick(smoothingKm)} km
      </div>
      <div className="map-legend__hover tabular" aria-live="off">
        {hover != null && scale ? (
          <>
            Am Mauszeiger: <strong>{hover < scale.low / 10 ? `< ${formatTick(scale.low / 10)}` : formatTick(hover)}</strong> {unit}
          </>
        ) : (
          'Mauszeiger auf die Karte: Wert an der Stelle'
        )}
      </div>
    </div>
  );
}
