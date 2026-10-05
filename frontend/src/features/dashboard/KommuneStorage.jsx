import { BatteryCharging, Scale, Sun, TrendingUp, Users } from 'lucide-react';
import { FigureBlock, FigureRow } from '../../components/ui/FigureBlock';
import ChartPlaceholder from '../../components/ui/ChartPlaceholder';
import { API_BASE_URL } from '../../config/site';
import { useJson } from '../../lib/data';
import { formatAmountFine, formatFixed, formatNumber, formatPercent } from '../../lib/format';
import AnalysisPanel from './AnalysisPanel';

const CLASSES = [
  { id: 'heimspeicher', label: 'Heimspeicher' },
  { id: 'gewerbespeicher', label: 'Gewerbespeicher' },
  { id: 'grossspeicher', label: 'Großspeicher' },
];
const mw = (v) => formatAmountFine(v, 'MW');
const mwh = (v) => formatAmountFine(v, 'MWh');
// Shares below 1 % with two decimals: "0,37 %", not "0,4 %"
const pct = (share) => (share < 0.01 ? `${formatNumber(share * 100, 2)} %` : formatPercent(share));
const times = (ratio) => `${ratio >= 10 ? formatNumber(ratio, 0) : formatFixed(ratio, 1)}×`;
// Against Germany: at least its average is good, three quarters of it fair
const toneOf = (ratio) => (ratio >= 1 ? 'good' : ratio >= 0.75 ? 'fair' : 'poor');

// The batteries of a region (mrt.battery_zubau_regions): the Bestand at the end of the latest year, in total and per
// class, and the Zubau of the last full year, the year before and the year so far
function batteries(rows) {
  const latest = Math.max(...rows.map((row) => row.year));
  const inYear = (year, field) => rows.filter((row) => row.year === year).reduce((total, row) => total + row[field], 0);
  return {
    latest,
    fullYear: latest - 1,
    capacity: inYear(latest, 'installed_capacity'),
    power: inYear(latest, 'installed_power'),
    perClass: Object.fromEntries(CLASSES.map((c) => [c.id, rows.find((row) => row.year === latest && row.size_class === c.id)?.installed_capacity ?? 0])),
    added: inYear(latest - 1, 'added_capacity'),
    addedBefore: inYear(latest - 2, 'added_capacity'),
    addedSoFar: inYear(latest, 'added_capacity'),
    // The Bestand before the last full year: what its Zubau grew
    before: inYear(latest - 2, 'installed_capacity'),
  };
}

// The solar power of a region (Bruttoleistung) at the end of the latest year (mrt.solar_zubau_regions)
function solarPower(rows) {
  const latest = Math.max(...rows.map((row) => row.year));
  return rows.filter((row) => row.year === latest).reduce((total, row) => total + row.installed, 0);
}

/**
 * The batteries of a Kreis or Gemeinde compared – there is no statutory target for batteries: their capacity against
 * the whole they lie in and its classes, against the solar power beside them, their Zubau, and per inhabitant against
 * the whole and Germany. Only batteries with a plausible capacity (battery-charts.de), like the timelines.
 *
 * scope and parent: { key, name, einwohner } (the Kreis and its Land, or the Gemeinde and its Kreis); einwohnerDE
 */
export default function KommuneStorage({ scope, parent, einwohnerDE }) {
  const here = useJson(`${API_BASE_URL}/battery/zubau?region=${scope.key}`);
  const whole = useJson(`${API_BASE_URL}/battery/zubau?region=${parent.key}`);
  const germany = useJson(`${API_BASE_URL}/battery/zubau?region=DE`);
  const solarHere = useJson(`${API_BASE_URL}/solar/zubau?region=${scope.key}&leistung=brutto`);
  const solarDE = useJson(`${API_BASE_URL}/solar/zubau?region=DE&leistung=brutto`);
  const requests = [here, whole, germany, solarHere, solarDE];

  const title = `Speicher im Vergleich · ${scope.name}`;
  const lead = 'Batteriespeicher, nutzbare Kapazität · neben Solar, im Land und in Deutschland';
  if (requests.some((r) => r.status === 'error')) {
    return (
      <AnalysisPanel id="analyse-ziele" icon={Scale} title={title} lead={lead}>
        <ChartPlaceholder title="Keine Daten" note="Die Werte konnten nicht geladen werden." />
      </AnalysisPanel>
    );
  }
  if (!requests.every((r) => r.status === 'ready') || !scope.einwohner || !parent.einwohner || !einwohnerDE) {
    return (
      <AnalysisPanel id="analyse-ziele" icon={Scale} title={title} lead={lead}>
        <ChartPlaceholder title="Wird geladen …" />
      </AnalysisPanel>
    );
  }

  const h = batteries(here.data);
  const p = batteries(whole.data);
  const de = batteries(germany.data);
  // kWh of storage per kW of solar beside it (MWh per MW), and the power of the storage per power of the solar
  const solar = solarPower(solarHere.data);
  const solarGermany = solarPower(solarDE.data);
  const perSolar = solar ? h.capacity / solar : 0;
  const perSolarDE = solarGermany ? de.capacity / solarGermany : 0;
  const perSolarMax = Math.max(perSolar, perSolarDE) || 1;
  // kWh per inhabitant
  const perHead = (b, einwohner) => (1000 * b.capacity) / einwohner;
  const heads = [
    { label: scope.name, value: perHead(h, scope.einwohner) },
    { label: parent.name, value: perHead(p, parent.einwohner), muted: true },
    { label: 'Deutschland', value: perHead(de, einwohnerDE), muted: true },
  ];
  const headMax = Math.max(...heads.map((x) => x.value)) || 1;
  const growth = h.before ? h.added / h.before : 0;
  const growthDE = de.before ? de.added / de.before : 0;

  return (
    <AnalysisPanel id="analyse-ziele" icon={Scale} title={title} lead={lead} className="targets">
      <div className="targets__grid">
        <FigureBlock
          icon={BatteryCharging}
          title="Speicher heute"
          color="var(--accent)"
          chip={{ label: `${pct(h.capacity / p.capacity)} von ${parent.name}`, tone: 'neutral' }}
          info="Nutzbare Speicherkapazität in Betrieb am Ende des Datenstands, nach den Größenklassen von battery-charts.de: Heimspeicher unter 30 kWh und 30 kW, Großspeicher ab 1 MWh oder 1 MW."
        >
          <FigureRow label={`Kapazität ${parent.name}`} value={mwh(p.capacity)} share={1} />
          <FigureRow label={`Anteil ${scope.name}`} value={mwh(h.capacity)} share={h.capacity / p.capacity} shareLabel={pct(h.capacity / p.capacity)} />
          {CLASSES.map((c) => (
            <FigureRow
              key={c.id}
              label={`– davon ${c.label}`}
              value={mwh(h.perClass[c.id])}
              share={h.capacity ? h.perClass[c.id] / h.capacity : 0}
              indent
            />
          ))}
        </FigureBlock>

        <FigureBlock
          icon={Sun}
          title="Speicher und Solar"
          color="var(--series-solar)"
          chip={{ label: `${times(perSolarDE ? perSolar / perSolarDE : 0)} Bundesschnitt`, tone: toneOf(perSolarDE ? perSolar / perSolarDE : 0) }}
          info="Wie viel Speicher neben der Solarleistung steht: nutzbare Kapazität in kWh je kW installierter Solarleistung (brutto). Die meisten Heimspeicher gehören zu einer Solaranlage."
        >
          <FigureRow label={`Solarleistung ${scope.name}`} value={mw(solar)} />
          <FigureRow label={`Speicherleistung ${scope.name}`} value={mw(h.power)} share={solar ? h.power / solar : 0} shareLabel={`${pct(solar ? h.power / solar : 0)} der Solarleistung`} />
          <FigureRow
            label={`${scope.name}: kWh Speicher je kW Solar`}
            value={`${formatFixed(perSolar, 2)} kWh`}
            share={perSolar / perSolarMax}
            shareLabel={`${times(perSolarDE ? perSolar / perSolarDE : 0)} Bundesschnitt`}
          />
          <FigureRow label="Deutschland: kWh Speicher je kW Solar" value={`${formatFixed(perSolarDE, 2)} kWh`} share={perSolarDE / perSolarMax} shareLabel="Bundesschnitt" muted />
        </FigureBlock>

        <FigureBlock
          icon={TrendingUp}
          title={`Zubau ${h.fullYear}`}
          color="var(--accent)"
          chip={{ label: `+${pct(growth)} Kapazität`, tone: toneOf(growthDE ? growth / growthDE : 0) }}
          info={`Neu in Betrieb genommene Kapazität im letzten vollen Jahr, und wie stark sie den Bestand davor wachsen ließ. Grün: mindestens so schnell wie Deutschland (+${pct(growthDE)}).`}
        >
          <FigureRow label={`Zubau ${h.fullYear}`} value={mwh(h.added)} share={growth} shareLabel={`+${pct(growth)} zum Bestand`} />
          <FigureRow label={`Zubau ${h.fullYear - 1}`} value={mwh(h.addedBefore)} muted />
          <FigureRow label={`Zubau ${h.latest} bisher`} value={mwh(h.addedSoFar)} muted />
          <FigureRow label={`Deutschland: Zubau ${de.fullYear}`} value={mwh(de.added)} share={growthDE} shareLabel={`+${pct(growthDE)} zum Bestand`} muted />
        </FigureBlock>

        <FigureBlock
          icon={Users}
          title="Je Einwohner"
          color="var(--accent)"
          chip={{ label: `${times(heads[0].value / heads[2].value)} Bundesschnitt`, tone: toneOf(heads[0].value / heads[2].value) }}
          info="Nutzbare Speicherkapazität je Einwohner, im Vergleich mit dem Land (Kreis) und Deutschland."
        >
          {heads.map((x) => (
            <FigureRow key={x.label} label={x.label} value={`${formatFixed(x.value, 2)} kWh`} share={x.value / headMax} shareLabel={times(x.value / heads[2].value)} muted={x.muted} />
          ))}
        </FigureBlock>
      </div>
      <p className="timeline__note">
        Für Batteriespeicher gibt es kein gesetzliches Ausbauziel; die Blöcke vergleichen deshalb mit Solar, dem Land und
        Deutschland. Speicher mit unplausibler Kapazität (unter 6 Minuten oder über 12 Stunden Volllast) sind nicht enthalten.
      </p>
    </AnalysisPanel>
  );
}
