import L from 'leaflet';
import { Marker, Tooltip } from 'react-leaflet';
import { formatNumber, scaleAmount } from '../../lib/format';
import { isActive } from './sites';

// The technology's icon (site.icon, the inner SVG) on a circle in its category's colour, or the topic colour; grey while
// not in operation. Many sites get smaller icons (site.size, px). One Leaflet icon per look, made on first use.
const icons = new Map();
function iconFor(svg, size, color, active) {
  const key = `${svg}|${size}|${color}|${active}`;
  if (!icons.has(key)) {
    const style = [`width:${size}px`, `height:${size}px`, active && color && `background:${color}`].filter(Boolean).join(';');
    icons.set(
      key,
      new L.DivIcon({
        className: `site-marker${active ? '' : ' is-inactive'}`,
        html: `<svg viewBox="0 0 24 24" aria-hidden="true" style="${style}">${svg}</svg>`,
        iconSize: [size, size],
        iconAnchor: [size / 2, size / 2],
      }),
    );
  }
  return icons.get(key);
}

// Power and energy from 1,000 on in the next larger unit (45.806 GWh: 45,8 TWh), anything else as it is
function formatRow(value, row) {
  if (value == null) return { value: '—', unit: row.unit };
  if (/^[kMG]Wh?$/.test(row.unit ?? '')) return scaleAmount(value, row.unit);
  return { value: formatNumber(value, row.digits ?? (value < 10 ? 1 : 0)), unit: row.unit };
}

function PlantInfo({ plant, site, category }) {
  const status = [category?.label, !isActive(plant) && plant.status].filter(Boolean).join(' · ');
  const since = site.since && plant[site.since] ? ` · seit ${plant[site.since].slice(0, 4)}` : '';
  return (
    <div className="site-tooltip__plant">
      <div className="map-tooltip__title">{plant.name}</div>
      {status && (
        <div className="site-tooltip__status">
          {category && <span className="site-tooltip__swatch" style={{ background: category.color }} />}
          {status}
        </div>
      )}
      <table>
        <tbody>
          {site.rows.map((row) => {
            const { value, unit } = formatRow(plant[row.key], row);
            return (
              <tr key={row.key}>
                <th>{row.label}</th>
                <td>{value}</td>
                <td>{unit}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <div className="site-tooltip__place">
        {plant.ort}
        {plant.land !== 'Deutschland' && `, ${plant.land}`}
        {since} · {plant[site.key]}
      </div>
    </div>
  );
}

// sites: plants grouped by location (sites.js). site: how the technology shows its plants (dashboards.js).
// categoryOf: a plant's subtype ({ label, color }), which colours it (Gas: Technologie, Speicherart); none: topic colour.
export default function SiteMarkers({ sites, site, categoryOf = () => null }) {
  const size = site.size ?? 20;
  return sites.map((group) => {
    const lead = group.plants.find(isActive) ?? group.plants[0];
    return (
      <Marker key={group.key} position={[group.lat, group.lon]} icon={iconFor(site.icon, size, categoryOf(lead)?.color, group.active)}>
        <Tooltip direction="top" offset={[0, -size / 2]} opacity={1} className="map-tooltip site-tooltip">
          {group.plants.map((plant) => (
            <PlantInfo key={plant[site.key]} plant={plant} site={site} category={categoryOf(plant)} />
          ))}
        </Tooltip>
      </Marker>
    );
  });
}
