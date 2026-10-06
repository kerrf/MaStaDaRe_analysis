// Germany as a plain SVG, for the small maps of the start page: a simple equirectangular projection, scaled by the cosine
// of 51° N so the country keeps its shape. Points (lng, lat) go through the same projection.
const COS_LAT = Math.cos((51 * Math.PI) / 180);

export const project = ([lng, lat]) => [lng * COS_LAT * 100, -lat * 100];

// GeoJSON lines (a LineString or MultiLineString, e.g. the outline of useOutline) -> one SVG path, projected like toSvg
export const linesToPath = (geometry) =>
  (geometry.type === 'LineString' ? [geometry.coordinates] : geometry.coordinates)
    .map((line) => `M${line.map((point) => project(point).map((v) => v.toFixed(1)).join(',')).join('L')}`)
    .join('');

// GeoJSON regions -> SVG paths ({ ags, name, d }) and the viewBox that holds them
export function toSvg(collection) {
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
