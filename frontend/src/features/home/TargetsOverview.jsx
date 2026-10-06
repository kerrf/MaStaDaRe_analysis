import { Link } from 'react-router-dom';
import { ArrowRight, Gauge, Target } from 'lucide-react';
import { ChartFoot } from '../../components/ui/CsvLink';
import { FigureBlock, FigureRow } from '../../components/ui/FigureBlock';
import { API_BASE_URL } from '../../config/site';
import { TARGETS, neededPerYear, yearsLeft } from '../../config/targets';
import { useDatenstand, useStats } from '../../lib/data';
import { round } from '../../lib/files';
import { formatAmount, formatDate, formatNumber, formatPercent } from '../../lib/format';

// The series of the targets, as Bruttoleistung (solar: 'solar', not 'solar_netto'), and their colours
const SERIES = [
  { id: 'solar', color: 'var(--series-solar)' },
  { id: 'wind_an_land', color: 'var(--series-wind-land)' },
  { id: 'wind_auf_see', color: 'var(--series-wind-sea)' },
];
const ZUBAU_URL = `${API_BASE_URL}/zubau/zeitverlauf?yearly=true&${SERIES.map((s) => `technology=${s.id}`).join('&')}`;
const YEAR = 2030;
const gw = (mw) => formatAmount(mw, 'MW');

/**
 * Germany on the way to its expansion targets for 2030 (config/targets.js): how far each technology is, and whether
 * last year's Zubau keeps the pace the rest needs. In Bruttoleistung, as the targets.
 */
export default function TargetsOverview() {
  const datenstand = useDatenstand();
  const zubau = useStats(ZUBAU_URL);
  const years = yearsLeft(datenstand, YEAR);

  const rows = SERIES.map((s) => {
    const own = zubau.data?.filter((row) => row.technology === s.id) ?? [];
    if (!own.length) return { ...s, ready: false };
    const latest = Math.max(...own.map((row) => row.year));
    const installed = own.find((row) => row.year === latest).installed;
    const added = own.find((row) => row.year === latest - 1)?.added ?? 0;
    const target = TARGETS[s.id].goals[YEAR];
    const needed = neededPerYear(installed, target, years);
    return { ...s, ready: true, label: TARGETS[s.id].label, installed, added, lastYear: latest - 1, target, needed, pace: needed ? added / needed : 1 };
  });
  const ready = rows.every((r) => r.ready);
  const lastYear = rows[0].lastYear;
  // The CSV: a row per technology, every figure of the two blocks
  const csv = ready
    ? {
        name: 'ausbauziele',
        filename: `mastr_ausbauziele_${YEAR}`,
        rows: () =>
          rows.map((r) => ({
            Technologie: r.label,
            'Installiert brutto (MW)': round(r.installed),
            [`Ziel ${YEAR} (MW)`]: r.target,
            'Erreicht (%)': round((100 * r.installed) / r.target, 2),
            [`Zubau ${r.lastYear} (MW)`]: round(r.added),
            [`Nötig je Jahr bis Ende ${YEAR} (MW)`]: round(r.needed),
            'Tempo: Zubau gegenüber dem nötigen (%)': round(100 * r.pace, 2),
          })),
      }
    : null;

  return (
    <div className="targets-overview">
      <FigureBlock
        icon={Target}
        title={`Stand gegenüber dem Ziel ${YEAR}`}
        chip={{ label: `noch ${formatNumber(years, 1)} Jahre`, tone: 'neutral' }}
        info={`Installierte Bruttoleistung am ${formatDate(datenstand)} gegenüber den Bundeszielen für Ende ${YEAR}: Solar und Wind an Land nach ${TARGETS.solar.source}, Wind auf See nach ${TARGETS.wind_auf_see.source}.`}
      >
        {rows.map((r) =>
          r.ready ? (
            <FigureRow
              key={r.id}
              label={r.label}
              value={`${gw(r.installed)} von ${gw(r.target)}`}
              share={r.installed / r.target}
              shareLabel={`${formatPercent(r.installed / r.target)} erreicht`}
              color={r.color}
            />
          ) : (
            <FigureRow key={r.id} label={TARGETS[r.id].label} value="—" />
          ),
        )}
      </FigureBlock>

      <FigureBlock
        icon={Gauge}
        title={ready ? `Tempo: Zubau ${lastYear} gegenüber dem nötigen` : 'Tempo'}
        info={`Zubau im letzten vollen Jahr gegenüber dem, was ab jetzt jedes Jahr dazukommen muss, um das Ziel bis Ende ${YEAR} zu erreichen.`}
      >
        {rows.map((r) =>
          r.ready ? (
            <FigureRow
              key={r.id}
              label={`${r.label} · nötig ${gw(r.needed)}/Jahr`}
              value={gw(r.added)}
              share={r.pace}
              shareLabel={`${formatPercent(r.pace)} des Tempos`}
              color={r.color}
            />
          ) : (
            <FigureRow key={r.id} label={TARGETS[r.id].label} value="—" />
          ),
        )}
      </FigureBlock>

      <ChartFoot csv={csv} className="targets-overview__foot">
        <p className="targets-overview__more">
          Wie weit ist Ihr Landkreis, Ihre Gemeinde?{' '}
          <Link to="/erzeuger/kommune" className="home-link">
            Landkreis/Gemeinde ansehen <ArrowRight size={14} aria-hidden="true" />
          </Link>
        </p>
      </ChartFoot>
    </div>
  );
}
