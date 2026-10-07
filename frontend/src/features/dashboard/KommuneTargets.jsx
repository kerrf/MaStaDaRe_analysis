import { Flag, Gauge, Sun, Target } from 'lucide-react';
import { FigureBlock, FigureRow } from '../../components/ui/FigureBlock';
import ChartPlaceholder from '../../components/ui/ChartPlaceholder';
import { ChartFoot } from '../../components/ui/CsvLink';
import { API_BASE_URL } from '../../config/site';
import { TARGETS, neededPerYear, yearsLeft } from '../../config/targets';
import { useDatenstand, useJson } from '../../lib/data';
import { fileName, round } from '../../lib/files';
import { formatAmountFine, formatDate, formatNumber, formatPercent } from '../../lib/format';
import AnalysisPanel from './AnalysisPanel';

const SOLAR = TARGETS.solar;
const mw = (value) => formatAmountFine(value, 'MW');
// Shares below 1 % with two decimals: "0,37 %", not "0,4 %"
const pct = (share) => (share < 0.01 ? `${formatNumber(share * 100, 2)} %` : formatPercent(share));
const zubauUrl = (region) => `${API_BASE_URL}/solar/zubau?region=${region}&leistung=brutto`;

// The Bestand at the end of the latest year (both Anlagenarten, and each), and the Zubau of the last full year
function summary(rows) {
  const latest = Math.max(...rows.map((row) => row.year));
  const now = rows.filter((row) => row.year === latest);
  const of = (anlagenart) => now.find((row) => row.anlagenart === anlagenart)?.installed ?? 0;
  const fullYear = latest - 1;
  return {
    installed: now.reduce((sum, row) => sum + row.installed, 0),
    gebaeude: of('gebaeude'),
    freiflaeche: of('freiflaeche'),
    fullYear,
    added: rows.filter((row) => row.year === fullYear).reduce((sum, row) => sum + row.added, 0),
  };
}

// Germany's pace against what the target needs, for its chip
const paceChip = (ratio) => ({
  label: `Deutschland: ${formatPercent(ratio)} des nötigen Tempos`,
  tone: ratio >= 1 ? 'good' : ratio >= 0.6 ? 'fair' : 'poor',
});

/**
 * A Kreis or Gemeinde on the way to the national solar targets: its solar today against the whole it lies in, how far
 * Germany is with the targets for 2030 and 2040 and what the area contributes to them, its Zubau beside Germany's
 * pace. Kreise and Gemeinden have no official targets, and none is made up here (no share of the national target by
 * population). All in Bruttoleistung, as the targets (config/targets.js), whatever the page's Netto/Brutto choice.
 *
 * scope and parent: { key, name } (the Kreis and its Land, or the Gemeinde and its Kreis)
 */
export default function KommuneTargets({ scope, parent }) {
  const datenstand = useDatenstand();
  const here = useJson(zubauUrl(scope.key));
  const whole = useJson(zubauUrl(parent.key));
  const germany = useJson(zubauUrl('DE'));
  const requests = [here, whole, germany];

  const lead = 'Solar in Bruttoleistung · Bundesziele nach EEG 2023';
  if (requests.some((r) => r.status === 'error')) {
    return (
      <AnalysisPanel id="analyse-ziele" icon={Target} title={`Auf dem Weg zum Ausbauziel · ${scope.name}`} lead={lead}>
        <ChartPlaceholder title="Keine Daten" note="Die Werte konnten nicht geladen werden." />
      </AnalysisPanel>
    );
  }
  if (!requests.every((r) => r.status === 'ready')) {
    return (
      <AnalysisPanel id="analyse-ziele" icon={Target} title={`Auf dem Weg zum Ausbauziel · ${scope.name}`} lead={lead}>
        <ChartPlaceholder title="Wird geladen …" />
      </AnalysisPanel>
    );
  }

  const h = summary(here.data);
  const p = summary(whole.data);
  const de = summary(germany.data);
  // A national target: how far Germany is, what it needs per year from now, what the area's solar is of it
  const goal = (year) => {
    const target = SOLAR.goals[year];
    return {
      target,
      reachedDE: de.installed / target,
      neededDE: neededPerYear(de.installed, target, yearsLeft(datenstand, year)),
      contribution: h.installed / target,
    };
  };
  const g2030 = goal(2030);
  const g2040 = goal(2040);
  const paceDE = g2030.neededDE ? de.added / g2030.neededDE : 1;
  // The CSV: every figure of the blocks, as a number with its unit
  const csv = {
    name: 'ausbauziel',
    filename: fileName('mastr_solar_ausbauziel', scope.key),
    rows: () =>
      [
        ['Installierte Leistung', parent.name, p.installed, 'MW'],
        ['Installierte Leistung', scope.name, h.installed, 'MW'],
        ['davon Gebäude', scope.name, h.gebaeude, 'MW'],
        ['davon Freifläche', scope.name, h.freiflaeche, 'MW'],
        [`Anteil an ${parent.name}`, scope.name, (100 * h.installed) / p.installed, '%'],
        ['Bundesziel 2030 (EEG)', 'Deutschland', g2030.target, 'MW'],
        ['Bundesziel 2030 erreicht', 'Deutschland', 100 * g2030.reachedDE, '%'],
        ['Beitrag zum Bundesziel 2030', scope.name, 100 * g2030.contribution, '%'],
        [`Zubau ${h.fullYear}`, scope.name, h.added, 'MW'],
        [`Zubau ${de.fullYear}`, 'Deutschland', de.added, 'MW'],
        ['Nötig je Jahr bis Ende 2030', 'Deutschland', g2030.neededDE, 'MW/Jahr'],
        ['Tempo: Zubau gegenüber dem nötigen', 'Deutschland', 100 * paceDE, '%'],
        ['Bundesziel 2040 (EEG)', 'Deutschland', g2040.target, 'MW'],
        ['Bundesziel 2040 erreicht', 'Deutschland', 100 * g2040.reachedDE, '%'],
        ['Beitrag zum Bundesziel 2040', scope.name, 100 * g2040.contribution, '%'],
      ].map(([kennzahl, gebiet, wert, einheit]) => ({
        Kennzahl: kennzahl,
        Gebiet: gebiet,
        Wert: round(wert, einheit === '%' ? 2 : 3),
        Einheit: einheit,
      })),
  };

  return (
    <AnalysisPanel id="analyse-ziele" icon={Target} title={`Auf dem Weg zum Ausbauziel · ${scope.name}`} lead={lead} className="targets">
      <div className="targets__grid">
        <FigureBlock
          icon={Sun}
          title="Solar heute"
          color="var(--series-solar)"
          chip={{ label: `${pct(h.installed / p.installed)} von ${parent.name}`, tone: 'neutral' }}
          info={`Bruttoleistung (DC) der Solaranlagen am Ende des Datenstands, wie sie das EEG für seinen Ausbaupfad zählt. Stand ${formatDate(datenstand)}.`}
        >
          <FigureRow label={`Installierte Leistung ${parent.name}`} value={mw(p.installed)} share={1} />
          <FigureRow label={`Anteil ${scope.name}`} value={mw(h.installed)} share={h.installed / p.installed} />
          <FigureRow label="– davon Gebäude" value={mw(h.gebaeude)} share={h.installed ? h.gebaeude / h.installed : 0} indent />
          <FigureRow label="– davon Freifläche" value={mw(h.freiflaeche)} share={h.installed ? h.freiflaeche / h.installed : 0} indent />
        </FigureBlock>

        <FigureBlock
          icon={Target}
          title="Ausbauziel 2030"
          color="var(--accent)"
          chip={{ label: `Deutschland: ${formatPercent(g2030.reachedDE)} erreicht`, tone: 'neutral' }}
          info={`Bundesziel für Solar Ende 2030: ${mw(g2030.target)} (${SOLAR.source}). Für Landkreise und Gemeinden gibt es kein amtliches Ziel; der Beitrag ist der Teil des Bundesziels, den die Solarleistung von ${scope.name} heute ausmacht.`}
        >
          <FigureRow label="Ziel Deutschland (EEG)" value={mw(g2030.target)} share={g2030.reachedDE} shareLabel={`${formatPercent(g2030.reachedDE)} erreicht`} />
          <FigureRow label={`${scope.name} heute`} value={mw(h.installed)} />
          <FigureRow
            label="Beitrag zum Bundesziel"
            value={`${pct(g2030.contribution)} von ${mw(g2030.target)}`}
            share={g2030.contribution}
            shareLabel={pct(g2030.contribution)}
            muted
          />
        </FigureBlock>

        <FigureBlock
          icon={Gauge}
          title="Tempo bis 2030"
          color="var(--accent)"
          chip={paceChip(paceDE)}
          info={`Zubau im letzten vollen Jahr (${h.fullYear}) in ${scope.name}; daneben Deutschland: sein Zubau gegenüber dem, was ab jetzt jedes Jahr dazukommen muss, um das Bundesziel bis Ende 2030 zu erreichen.`}
        >
          <FigureRow label={`Zubau ${h.fullYear}`} value={mw(h.added)} />
          <FigureRow label={`Deutschland: Zubau ${de.fullYear}`} value={mw(de.added)} share={paceDE} shareLabel={formatPercent(paceDE)} muted />
          <FigureRow label="Deutschland: nötig je Jahr" value={`${mw(g2030.neededDE)} / Jahr`} muted />
        </FigureBlock>

        <FigureBlock
          icon={Flag}
          title="Ausbauziel 2040"
          color="var(--accent)"
          chip={{ label: `Deutschland: ${formatPercent(g2040.reachedDE)} erreicht`, tone: 'neutral' }}
          info={`Bundesziel für Solar Ende 2040: ${mw(g2040.target)} (${SOLAR.source}).`}
        >
          <FigureRow label="Ziel Deutschland (EEG)" value={mw(g2040.target)} share={g2040.reachedDE} shareLabel={`${formatPercent(g2040.reachedDE)} erreicht`} />
          <FigureRow label={`${scope.name} heute`} value={mw(h.installed)} />
          <FigureRow
            label="Beitrag zum Bundesziel"
            value={`${pct(g2040.contribution)} von ${mw(g2040.target)}`}
            share={g2040.contribution}
            shareLabel={pct(g2040.contribution)}
            muted
          />
        </FigureBlock>
      </div>
      <ChartFoot csv={csv}>
        <p className="timeline__note">
          Für Landkreise und Gemeinden gibt es keine amtlichen Ausbauziele: die Blöcke zeigen die Bundesziele, wie weit
          Deutschland ist und was {scope.name} dazu beiträgt. Die Länder setzen teils eigene Ziele.
        </p>
      </ChartFoot>
    </AnalysisPanel>
  );
}
