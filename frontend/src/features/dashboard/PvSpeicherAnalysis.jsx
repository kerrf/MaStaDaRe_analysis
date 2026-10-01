import { useMemo } from 'react';
import { BatteryCharging, Gauge, History, Sun } from 'lucide-react';
import StackedChart from '../../components/charts/StackedChart';
import ChartPlaceholder from '../../components/ui/ChartPlaceholder';
import StatTile from '../../components/ui/StatTile';
import { API_BASE_URL } from '../../config/site';
import { useJson } from '../../lib/data';
import { formatCapacity, formatCount, formatNumber, formatPower, formatShare } from '../../lib/format';
import AnalysisPanel from './AnalysisPanel';

const FIRST_YEAR = 2010; // before, hardly any solar unit has a battery
const BALKON = 1; // size class "bis 2 kWp"
const SERIES = [
  { id: 'alle', label: 'Alle Anlagen', color: 'var(--series-solar)' },
  { id: 'ohne-balkon', label: 'ohne Anlagen bis 2 kWp (Balkon-PV)', color: 'var(--topic-speicher)' },
];

const sumOf = (rows, field) => rows.reduce((total, row) => total + row[field], 0);
const share = (part, whole) => (whole ? part / whole : 0);
const percent = (value) => `${formatNumber(value, 1)} %`;

/**
 * Solaranlagen mit Batteriespeicher: solar units and batteries at the same Lokation, Germany-wide (mrt.pv_speicher,
 * mrt.speicher_pv). Sums the rows of the chosen Anlagenarten (subtypes) in Brutto or Netto (leistung) itself.
 */
export default function PvSpeicherAnalysis({ analysis, subtypes, leistung, anchor }) {
  const data = useJson(`${API_BASE_URL}${analysis.path}`);
  const netto = leistung?.id !== 'brutto'; // Netto unless chosen otherwise, like everywhere
  const power = netto ? 'pv_power_net' : 'pv_power';
  const powerWithBattery = netto ? 'with_battery_power_net' : 'with_battery_power';

  const view = useMemo(() => {
    if (!data.data) return null;
    const rows = data.data.pv.filter((row) => !subtypes || subtypes.includes(row.anlagenart));
    const withBattery = sumOf(rows, 'with_battery_units');

    // Share of the solar units with a battery, per year of commissioning: all of them, and without Balkon-PV
    const lastYear = Math.max(...rows.map((row) => row.year));
    const periods = Array.from({ length: lastYear - FIRST_YEAR + 1 }, (_, i) => {
      const year = FIRST_YEAR + i;
      const ofYear = rows.filter((row) => row.year === year);
      const withoutBalkon = ofYear.filter((row) => row.size_class !== BALKON);
      return {
        key: String(year),
        label: year === lastYear ? `In Betrieb seit ${year} (laufendes Jahr)` : `In Betrieb seit ${year}`,
        tick: String(year),
        values: {
          alle: 100 * share(sumOf(ofYear, 'with_battery_units'), sumOf(ofYear, 'pv_units')),
          'ohne-balkon': 100 * share(sumOf(withoutBalkon, 'with_battery_units'), sumOf(withoutBalkon, 'pv_units')),
        },
      };
    });

    // Per size class: share with a battery, and battery capacity per kW of solar at the sites with both
    const classes = [...new Map(rows.map((row) => [row.size_class, row.size_label])).entries()]
      .sort(([a], [b]) => a - b)
      .map(([sizeClass, label]) => {
        const ofClass = rows.filter((row) => row.size_class === sizeClass);
        return {
          label,
          units: sumOf(ofClass, 'pv_units'),
          withBattery: sumOf(ofClass, 'with_battery_units'),
          ratio: share(sumOf(ofClass, 'battery_capacity'), sumOf(ofClass, powerWithBattery)),
        };
      })
      .filter((c) => c.units > 0);

    const alone = data.data.speicher.filter((row) => !row.with_pv);
    const large = alone.find((row) => row.size_class === 'grossspeicher');
    return {
      units: sumOf(rows, 'pv_units'),
      withBattery,
      power: sumOf(rows, power),
      powerWithBattery: sumOf(rows, powerWithBattery),
      ratio: share(sumOf(rows, 'battery_capacity'), sumOf(rows, powerWithBattery)),
      retrofit: share(sumOf(rows, 'retrofit_units'), withBattery),
      flagged: share(sumOf(rows, 'flagged_with_battery_units'), sumOf(rows, 'flagged_units')),
      periods,
      classes,
      alone: {
        units: sumOf(alone, 'units'),
        power: sumOf(alone, 'power'),
        capacity: sumOf(alone, 'capacity'),
        batteries: sumOf(data.data.speicher, 'units'),
        large,
      },
    };
  }, [data.data, subtypes, power, powerWithBattery]);

  const selection = subtypes && subtypes.length === 1 ? ` · nur ${subtypes[0] === 'freiflaeche' ? 'Freifläche' : 'Gebäude'}` : '';
  const perKw = netto ? 'kWh/kW' : 'kWh/kWp';
  const classScale = view ? Math.max(...view.classes.map((c) => share(c.withBattery, c.units))) : 1;

  return (
    <AnalysisPanel
      id={anchor}
      icon={analysis.icon}
      title={analysis.title}
      lead={`Deutschland · Solar- und Batterieeinheiten an derselben Lokation${selection}${leistung ? ` · ${leistung.label}` : ''}`}
      className="pv-speicher"
    >
      {data.status === 'error' ? (
        <ChartPlaceholder title="Keine Daten" note="Die Auswertung konnte nicht geladen werden." />
      ) : !view ? (
        <ChartPlaceholder title="Wird geladen …" />
      ) : (
        <>
          <div className="pv-speicher__kpis">
            <StatTile
              icon={Sun}
              label="Solaranlagen mit Speicher"
              value={formatCount(view.withBattery)}
              sub={`${formatShare(share(view.withBattery, view.units))} von ${formatCount(view.units)} Anlagen`}
            />
            <StatTile
              icon={Gauge}
              label="Solarleistung mit Speicher"
              value={formatPower(view.powerWithBattery).value}
              unit={formatPower(view.powerWithBattery).unit}
              sub={`${formatShare(share(view.powerWithBattery, view.power))} der Leistung`}
            />
            <StatTile
              icon={BatteryCharging}
              label="Speicher je Solarleistung"
              value={formatNumber(view.ratio, 2)}
              unit={perKw}
              sub="Kapazität je Leistung, wo beides steht"
            />
            <StatTile
              icon={History}
              label="Speicher nachgerüstet"
              value={formatShare(view.retrofit)}
              sub="mehr als einen Monat nach der Solaranlage"
            />
          </div>

          <div className="pv-speicher__charts">
            <section>
              <h4 className="pv-speicher__title">Anteil mit Speicher nach Inbetriebnahmejahr</h4>
              <StackedChart
                periods={view.periods}
                series={SERIES}
                kind="lines"
                unit="%"
                formatValue={percent}
                label="Anteil der Solaranlagen mit Batteriespeicher nach Jahr der Inbetriebnahme"
              />
              <div className="pv-speicher__legend">
                {SERIES.map((s) => (
                  <span key={s.id}>
                    <i style={{ background: s.color }} /> {s.label}
                  </span>
                ))}
              </div>
            </section>
            <section>
              <h4 className="pv-speicher__title">Anteil mit Speicher nach Anlagengröße</h4>
              <table className="sizes pv-speicher__classes">
                <thead>
                  <tr>
                    <th scope="col">Leistungsklasse</th>
                    <th scope="col">
                      <span className="sizes__key sizes__fill--power" /> mit Speicher
                    </th>
                    <th scope="col" title="Speicherkapazität je Solarleistung, wo beides steht">
                      {perKw}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {view.classes.map((c) => (
                    <tr key={c.label}>
                      <th scope="row">
                        <span className="sizes__label">{c.label}</span>
                      </th>
                      <td>
                        <div className="sizes__bar">
                          <span
                            className="sizes__fill sizes__fill--power"
                            style={{ width: `${(100 * share(c.withBattery, c.units)) / classScale}%` }}
                          />
                        </div>
                        <div className="sizes__value">
                          <strong>{formatShare(share(c.withBattery, c.units))}</strong> {formatCount(c.withBattery)} von{' '}
                          {formatCount(c.units)}
                        </div>
                      </td>
                      <td className="pv-speicher__ratio">{c.withBattery ? formatNumber(c.ratio, 2) : '–'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          </div>

          <ul className="pv-speicher__facts">
            <li>
              <strong>{formatCount(view.alone.units)}</strong> von {formatCount(view.alone.batteries)} Batteriespeichern
              haben keine Solaranlage an ihrer Lokation ({formatPower(view.alone.power).value} {formatPower(view.alone.power).unit},{' '}
              {formatCapacity(view.alone.capacity).value} {formatCapacity(view.alone.capacity).unit})
              {view.alone.large &&
                ` – darunter ${formatCount(view.alone.large.units)} Großspeicher mit ${formatCapacity(view.alone.large.capacity).value} ${formatCapacity(view.alone.large.capacity).unit}`}
              . Bei Heimspeichern ist die Solaranlage oft unter einer anderen Lokation registriert.
            </li>
            <li>
              Selbstauskunft „Speicher am gleichen Ort“: bei <strong>{formatShare(view.flagged)}</strong> der so markierten
              Solaranlagen findet sich tatsächlich ein Speicher an der Lokation.
            </li>
          </ul>
          <p className="timeline__note">
            Abgleich über die Lokation im Marktstammdatenregister (LokationMaStRNummer): Einheiten am selben Netzanschluss
            teilen sie. Einheiten in Betrieb; Kapazität nur mit plausibler Angabe (wie battery-charts.de).
          </p>
        </>
      )}
    </AnalysisPanel>
  );
}
