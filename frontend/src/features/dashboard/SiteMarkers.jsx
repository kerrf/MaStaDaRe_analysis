import L from 'leaflet';
import { Marker, Tooltip } from 'react-leaflet';
import { formatNumber } from '../../lib/format';
import { isActive } from './sites';

// A small mountain (the Pumpspeicher icon) in the topic colour; grey while not in operation.
const icon = (active) =>
  new L.DivIcon({
    className: `site-marker${active ? '' : ' is-inactive'}`,
    html: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m8 3 4 8 5-5 5 15H2L8 3z"/></svg>',
    iconSize: [20, 20],
    iconAnchor: [10, 10],
  });
const ICONS = { active: icon(true), inactive: icon(false) };

// Small plants (a few MW) keep a decimal
const formatAmount = (value) => formatNumber(value, value != null && value < 10 ? 1 : 0);

function PlantInfo({ plant }) {
  return (
    <div className="site-tooltip__plant">
      <div className="map-tooltip__title">{plant.name}</div>
      {!isActive(plant) && <div className="site-tooltip__status">{plant.status}</div>}
      <table>
        <tbody>
          <tr>
            <th>Speicherkapazität</th>
            <td>{formatAmount(plant.total_capacity)}</td>
            <td>MWh</td>
          </tr>
          <tr>
            <th>Turbinenleistung</th>
            <td>{formatAmount(plant.total_power)}</td>
            <td>MW</td>
          </tr>
          <tr>
            <th>Pumpleistung</th>
            <td>{formatAmount(plant.pump_power)}</td>
            <td>MW</td>
          </tr>
          <tr>
            <th>Maschinen</th>
            <td>{plant.total_units}</td>
            <td />
          </tr>
        </tbody>
      </table>
      <div className="site-tooltip__place">
        {plant.ort}
        {plant.land !== 'Deutschland' && `, ${plant.land}`} · {plant.spe_mastr_nummer}
      </div>
    </div>
  );
}

export default function SiteMarkers({ sites }) {
  return sites.map((site) => (
    <Marker key={site.key} position={[site.lat, site.lon]} icon={site.active ? ICONS.active : ICONS.inactive}>
      <Tooltip direction="top" offset={[0, -10]} opacity={1} className="map-tooltip site-tooltip">
        {site.plants.map((plant) => (
          <PlantInfo key={plant.spe_mastr_nummer} plant={plant} />
        ))}
      </Tooltip>
    </Marker>
  ));
}
