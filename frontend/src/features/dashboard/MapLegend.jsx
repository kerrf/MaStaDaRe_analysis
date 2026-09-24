import { formatTick } from '../../lib/format';
import { rampGradient } from '../../lib/colorScale';

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
