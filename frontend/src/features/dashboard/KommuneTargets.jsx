import { Flag, Gauge, Sun, Target } from 'lucide-react';
import { FigureBlock, FigureRow } from '../../components/ui/FigureBlock';
import ChartPlaceholder from '../../components/ui/ChartPlaceholder';
import { API_BASE_URL } from '../../config/site';
import { TARGETS, neededPerYear, yearsLeft } from '../../config/targets';
import { useDatenstand, useJson } from '../../lib/data';
import { formatAmount, formatDate, formatNumber, formatPercent } from '../../lib/format';
import AnalysisPanel from './AnalysisPanel';

const SOLAR = TARGETS.solar;
const mw = (value) => formatAmount(value, 'MW');
// Small shares with two decimals: "0,37 %", not "0,4 %"
const pct = (share) => (share < 0.1 ? `${formatNumber(share * 100, 2)} %` : formatPercent(share));
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

// The gist of a progress for its chip: how far, and whether it keeps up with Germany's
const progressChip = (reached, benchmark) => ({
  label: `${formatPercent(reached)} erreicht`,
  tone: reached >= benchmark ? 'good' : reached >= 0.75 * benchmark ? 'fair' : 'poor',
});
const paceChip = (ratio) => ({
  label: `${formatPercent(ratio)} des nötigen Tempos`,
  tone: ratio >= 1 ? 'good' : ratio >= 0.6 ? 'fair' : 'poor',
});

/**
 * How far a Kreis or Gemeinde is on the way to the national solar targets: its solar today against the whole it lies in,
 * its share of the targets for 2030 and 2040 by its population, and whether its Zubau keeps the pace that share needs.
 * All in Bruttoleistung, as the targets (config/targets.js), whatever the page's Netto/Brutto choice.
 *
 * scope and parent: { key, name, einwohner } (the Kreis and its Land, or the Gemeinde and its Kreis); einwohnerDE
 */
export default function KommuneTargets({ scope, parent, einwohnerDE }) {
  const datenstand = useDatenstand();
  const here = useJson(zubauUrl(scope.key));
  const whole = useJson(zubauUrl(parent.key));
  const germany = useJson(zubauUrl('DE'));
  const loaded = [here, whole, germany].every((r) => r.status === 'ready') && scope.einwohner && einwohnerDE;

  const lead = 'Solar in Bruttoleistung · Bundesziele nach EEG 2023 · Anteil am Ziel nach Einwohnern';
  if ([here, whole, germany].some((r) => r.status === 'error')) {
    return (
      <AnalysisPanel id="analyse-ziele" icon={Target} title={`Auf dem Weg zum Ausbauziel · ${scope.name}`} lead={lead}>
        <ChartPlaceholder title="Keine Daten" note="Die Werte konnten nicht geladen werden." />
      </AnalysisPanel>
    );
  }
  if (!loaded) {
    return (
      <AnalysisPanel id="analyse-ziele" icon={Target} title={`Auf dem Weg zum Ausbauziel · ${scope.name}`} lead={lead}>
        <ChartPlaceholder title="Wird geladen …" />
      </AnalysisPanel>
    );
  }

  const h = summary(here.data);
  const p = summary(whole.data);
  const de = summary(germany.data);
  const populationShare = scope.einwohner / einwohnerDE;
  const goal = (year) => {
    const target = SOLAR.goals[year];
    const fair = target * populationShare;
    const years = yearsLeft(datenstand, year);
    return {
      target,
      fair,
      reached: h.installed / fair,
      reachedDE: de.installed / target,
      needed: neededPerYear(h.installed, fair, years),
      neededDE: neededPerYear(de.installed, target, years),
    };
  };
  const g2030 = goal(2030);
  const g2040 = goal(2040);
  const pace = g2030.needed ? h.added / g2030.needed : 1;
  const paceDE = g2030.neededDE ? de.added / g2030.neededDE : 1;

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
          chip={progressChip(g2030.reached, g2030.reachedDE)}
          info={`Bundesziel für Solar Ende 2030: ${mw(g2030.target)} (${SOLAR.source}). Der Anteil von ${scope.name} folgt rechnerisch aus seinem Anteil an den Einwohnern Deutschlands (${pct(populationShare)}) – ein Vergleichsmaß, kein amtliches Ziel. Grün: weiter als Deutschland insgesamt.`}
        >
          <FigureRow label="Ziel Deutschland (EEG)" value={mw(g2030.target)} share={g2030.reachedDE} shareLabel={`${formatPercent(g2030.reachedDE)} erreicht`} />
          <FigureRow label={`Anteil ${scope.name} nach Einwohnern (${pct(populationShare)})`} value={mw(g2030.fair)} />
          <FigureRow label={`${scope.name} heute`} value={mw(h.installed)} share={g2030.reached} shareLabel={`${formatPercent(g2030.reached)} erreicht`} />
          <FigureRow
            label="Beitrag zum Bundesziel"
            value={`${pct(h.installed / g2030.target)} von ${mw(g2030.target)}`}
            share={h.installed / g2030.target}
            shareLabel={pct(h.installed / g2030.target)}
            muted
          />
        </FigureBlock>

        <FigureBlock
          icon={Gauge}
          title="Tempo bis 2030"
          color="var(--accent)"
          chip={paceChip(pace)}
          info={`Zubau im letzten vollen Jahr (${h.fullYear}) gegenüber dem, was ab jetzt jedes Jahr dazukommen muss, um den Anteil am Ziel 2030 bis Ende 2030 zu erreichen.`}
        >
          <FigureRow label={`Zubau ${h.fullYear}`} value={mw(h.added)} share={pace} shareLabel={formatPercent(pace)} />
          <FigureRow label="Nötig je Jahr bis Ende 2030" value={`${mw(g2030.needed)} / Jahr`} />
          <FigureRow label={`Deutschland: Zubau ${de.fullYear}`} value={mw(de.added)} share={paceDE} shareLabel={formatPercent(paceDE)} muted />
          <FigureRow label="Deutschland: nötig je Jahr" value={`${mw(g2030.neededDE)} / Jahr`} muted />
        </FigureBlock>

        <FigureBlock
          icon={Flag}
          title="Ausbauziel 2040"
          color="var(--accent)"
          chip={progressChip(g2040.reached, g2040.reachedDE)}
          info={`Bundesziel für Solar Ende 2040: ${mw(g2040.target)} (${SOLAR.source}), der Anteil wieder nach Einwohnern.`}
        >
          <FigureRow label="Ziel Deutschland (EEG)" value={mw(g2040.target)} share={g2040.reachedDE} shareLabel={`${formatPercent(g2040.reachedDE)} erreicht`} />
          <FigureRow label={`Anteil ${scope.name} nach Einwohnern`} value={mw(g2040.fair)} />
          <FigureRow label={`${scope.name} heute`} value={mw(h.installed)} share={g2040.reached} shareLabel={`${formatPercent(g2040.reached)} erreicht`} />
          <FigureRow label="Nötig je Jahr bis Ende 2040" value={`${mw(g2040.needed)} / Jahr`} muted />
        </FigureBlock>
      </div>
      <p className="timeline__note">
        Der Anteil am Bundesziel nach Einwohnern ist ein rechnerischer Vergleich, kein amtliches Ziel: Freiflächen entstehen
        eher auf dem Land, Dachanlagen eher dort, wo viele Menschen wohnen. Die Länder setzen teils eigene Ziele.
      </p>
    </AnalysisPanel>
  );
}
