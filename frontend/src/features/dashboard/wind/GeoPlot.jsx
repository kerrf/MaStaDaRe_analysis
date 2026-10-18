import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { withoutOffshore } from '../../../config/regions';
import { useTopology } from '../../../lib/data';
import { project, toSvg } from '../../../lib/svgMap';

function useWidth(ref) {
  const [width, setWidth] = useState(0);
  useLayoutEffect(() => {
    setWidth(ref.current.clientWidth);
    const observer = new ResizeObserver(([entry]) => setWidth(Math.floor(entry.contentRect.width)));
    observer.observe(ref.current);
    return () => observer.disconnect();
  }, [ref]);
  return width;
}

/**
 * A plain map for analyses (no tiles): the areas of a topology (only those under `within`, a key prefix), filled by
 * fillOf(ags) (null: no data), their name and value in describe(ags, name); optionally dots on a canvas over them (dots:
 * { lon, lat, color } arrays of the same length, drawn in their order). Keeps Germany's shape (svgMap's projection).
 * onLayout({ height, latToY }): once laid out and on every change – where a latitude lies on the plot, in px from its
 * top (the projection keeps parallels straight and level), so a chart beside it can line up with the map.
 */
export default function GeoPlot({ topology, within = null, fillOf, describe, dots = null, maxHeight = 620, label, onLayout }) {
  const frame = useRef(null);
  const canvas = useRef(null);
  const width = useWidth(frame);
  const areas = useTopology(topology);
  const [hover, setHover] = useState(null);

  const svg = useMemo(() => {
    if (!areas.data) return null;
    const land = withoutOffshore(areas.data);
    const features = within ? land.features.filter((f) => String(f.properties.ags).startsWith(within)) : land.features;
    return toSvg({ ...land, features });
  }, [areas.data, within]);

  // The viewBox and how it lands on the element (preserveAspectRatio meet, centred)
  const box = useMemo(() => {
    if (!svg) return null;
    const [vx, vy, vw, vh] = svg.viewBox.split(' ').map(Number);
    const height = Math.min(maxHeight, width * (vh / vw));
    const scale = Math.min(width / vw, height / vh);
    return { vx, vy, vw, vh, height, scale, ox: (width - vw * scale) / 2, oy: (height - vh * scale) / 2 };
  }, [svg, width, maxHeight]);

  useEffect(() => {
    if (!box || !width || !onLayout) return;
    onLayout({ height: box.height, latToY: (lat) => box.oy + (project([0, lat])[1] - box.vy) * box.scale });
  }, [box, width, onLayout]);

  useEffect(() => {
    const element = canvas.current;
    if (!element || !box || !width) return;
    const ratio = window.devicePixelRatio || 1;
    element.width = width * ratio;
    element.height = box.height * ratio;
    const ctx = element.getContext('2d');
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.clearRect(0, 0, width, box.height);
    if (!dots) return;
    ctx.globalAlpha = 0.85;
    const r = dots.lon.length > 15000 ? 1.5 : 2.2;
    for (let k = 0; k < dots.lon.length; k += 1) {
      if (Number.isNaN(dots.lon[k]) || Number.isNaN(dots.lat[k])) continue;
      const [x, y] = project([dots.lon[k], dots.lat[k]]);
      const [px, py] = [box.ox + (x - box.vx) * box.scale, box.oy + (y - box.vy) * box.scale];
      ctx.fillStyle = dots.color[k];
      ctx.beginPath();
      ctx.arc(px, py, r, 0, 2 * Math.PI);
      ctx.fill();
    }
  }, [dots, box, width]);

  const tip = hover ? describe?.(hover.ags, hover.name) : null;
  return (
    <div className="geo-plot" ref={frame} style={{ height: box?.height }}>
      {svg && box && (
        <>
          <svg
            className="geo-plot__svg"
            width={width}
            height={box.height}
            viewBox={svg.viewBox}
            role="img"
            aria-label={label}
            onPointerLeave={() => setHover(null)}
          >
            {svg.shapes.map((shape) => {
              const fill = fillOf?.(shape.ags);
              return (
                <path
                  key={shape.ags}
                  d={shape.d}
                  className={`geo-plot__area${fill ? '' : ' is-empty'}${dots ? ' is-under-dots' : ''}${hover?.ags === shape.ags ? ' is-hover' : ''}`}
                  style={fill ? { fill } : undefined}
                  vectorEffect="non-scaling-stroke"
                  onPointerMove={(e) => {
                    const rect = frame.current.getBoundingClientRect();
                    setHover({ ags: shape.ags, name: shape.name, x: e.clientX - rect.left, y: e.clientY - rect.top });
                  }}
                />
              );
            })}
          </svg>
          <canvas ref={canvas} className="geo-plot__dots" style={{ width, height: box.height }} />
        </>
      )}
      {tip && (
        <div className="scatter__tooltip" style={{ left: hover.x, top: hover.y, transform: `translate(${hover.x > width / 2 ? 'calc(-100% - 14px)' : '14px'}, -50%)` }}>
          <div className="scatter__tooltip-title">{tip.title}</div>
          {tip.rows.map(([name, value]) => (
            <div key={name} className="scatter__tooltip-row">
              <span>{name}</span>
              <b>{value}</b>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
