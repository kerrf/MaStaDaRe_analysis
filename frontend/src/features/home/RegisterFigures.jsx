import { Link } from 'react-router-dom';
import { ArrowUpRight } from 'lucide-react';
import { OFFSHORE } from '../../config/regions';
import { useStats } from '../../lib/data';
import { formatCount, formatNumber, scaleAmount } from '../../lib/format';
import { URLS, batteryCapacity, sum } from './homeData';

const amount = (value, unit) => {
  const scaled = scaleAmount(value, unit);
  return `${scaled.value} ${scaled.unit}`;
};

// The register today in four large numbers, each leading to its dashboard. While loading, a dash.
export default function RegisterFigures() {
  const solar = useStats(URLS.solar);
  const wind = useStats(URLS.wind);
  const batteries = useStats(URLS.batteries);
  const zubau = useStats(URLS.zubau);
  const storages = useStats(URLS.gasStorages);

  const ready = (...states) => states.every((state) => state.status === 'ready');
  const running = storages.data?.filter((s) => s.status === 'in Betrieb') ?? [];
  const offshore = wind.data?.find((row) => row.bundesland === OFFSHORE.ags);

  const figures = [
    {
      topic: 'erzeuger',
      to: '/erzeuger',
      label: 'Solaranlagen',
      value: ready(solar) && formatCount(sum(solar.data, 'total_units')),
      context: ready(solar) && `${amount(sum(solar.data, 'total_power'), 'MW')} Leistung (netto)`,
    },
    {
      topic: 'erzeuger',
      to: '/erzeuger?technologie=wind',
      label: 'Windenergieanlagen',
      value: ready(wind) && formatNumber(sum(wind.data, 'total_units')),
      context:
        ready(wind) &&
        `${amount(sum(wind.data, 'total_power'), 'MW')}${offshore ? `, davon ${amount(offshore.total_power, 'MW')} auf See` : ''}`,
    },
    {
      topic: 'speicher',
      to: '/speicher',
      label: 'Batteriespeicher',
      value: ready(batteries) && formatCount(sum(batteries.data, 'total_units')),
      context: ready(zubau) && `${amount(batteryCapacity(zubau.data), 'MWh')} nutzbare Kapazität`,
    },
    {
      topic: 'gas',
      to: '/gas?technologie=gasspeicher',
      label: 'Gasspeicher',
      value: ready(storages) && formatNumber(running.length),
      context: ready(storages) && `${amount(sum(running, 'total_capacity'), 'GWh')} Arbeitsgas`,
    },
  ];

  return (
    <div className="figures">
      {figures.map((f) => (
        <Link key={f.label} to={f.to} className="figure" data-topic={f.topic}>
          <span className="figure__label">{f.label}</span>
          <span className="figure__value tabular">{f.value || '—'}</span>
          <span className="figure__context">{f.context || ' '}</span>
          <ArrowUpRight className="figure__arrow" size={18} aria-hidden="true" />
        </Link>
      ))}
    </div>
  );
}
