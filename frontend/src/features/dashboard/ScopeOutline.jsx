import { useMemo } from 'react';
import { GRANULARITIES, STATES_TOPOLOGY } from '../../config/dashboards';
import { withoutOffshore } from '../../config/regions';
import { useTopology } from '../../lib/data';
import { toSvg } from '../../lib/svgMap';

const KREISE = GRANULARITIES.find((g) => g.id === 'landkreis').topology;

/**
 * The outline of the area a page shows, as a small silhouette: Germany (its Länder, without the sea), a Land, or a
 * Kreis – a Gemeinde shows its Kreis. region: the Land ({ ags }), kreis: the Kreis' key; size: px of its longer side.
 * The boundaries come from the cache the map fills.
 */
export default function ScopeOutline({ region, kreis, size = 32, className = '' }) {
  const laender = useTopology(STATES_TOPOLOGY);
  const kreise = useTopology(kreis ? KREISE : null);
  const svg = useMemo(() => {
    const source = withoutOffshore(kreis ? kreise.data : laender.data);
    if (!source) return null;
    const key = kreis ?? region?.ags;
    const features = key ? source.features.filter((f) => f.properties.ags === key) : source.features;
    return features.length ? toSvg({ ...source, features }) : null;
  }, [laender.data, kreise.data, region, kreis]);
  const classes = `scope-outline ${className}`.trim();
  if (!svg) return <span className={classes} style={{ width: size, height: size }} aria-hidden="true" />;
  return (
    <svg className={classes} width={size} height={size} viewBox={svg.viewBox} preserveAspectRatio="xMidYMid meet" aria-hidden="true">
      {svg.shapes.map((shape) => (
        <path key={shape.ags} d={shape.d} vectorEffect="non-scaling-stroke" />
      ))}
    </svg>
  );
}
