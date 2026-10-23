import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { FileDown } from 'lucide-react';
import ChartPlaceholder from '../../../components/ui/ChartPlaceholder';
import ListSelect from '../../../components/ui/ListSelect';
import Setting, { SettingsRow } from '../../../components/ui/Setting';
import { API_BASE_URL } from '../../../config/site';
import { useDatenstand, useJson } from '../../../lib/data';
import { sourceLine } from '../../../lib/exportChart';
import { fileName, round } from '../../../lib/files';
import { formatDate } from '../../../lib/format';
import { trackEvent } from '../../../lib/usage';
import { useFootnote } from '../footnoteContext';
import ScopeBar from '../ScopeBar';
import ScopeOutline from '../ScopeOutline';
import SelectionBar from '../SelectionBar';
import { PartsSection, ReportNotes, TargetsSection, Tiles, ZubauSection } from './blocks';
import {
  MONTHS,
  asOfName,
  byTechnology,
  extentOf,
  historyOf,
  indexSeries,
  pageModel,
  periodName,
  periodOf,
  trailingMonths,
  yearToDate,
} from './model';
import { saveReport } from './report';
import './overview.css';

const BESTAND_NOTE =
  'Bestand und Zubau dieser Seite nach dem Inbetriebnahme- und dem Stilllegungsdatum der Einheiten: in Betrieb ist, was bis ' +
  'zum Ende des Zeitraums in Betrieb ging und nicht endgültig stillgelegt wurde – auch vorübergehend stillgelegte Einheiten. ' +
  'Die Karte zählt nach dem heutigen Betriebsstatus und kommt deshalb auf einige Promille weniger. Anteil und Rang: unter den ' +
  'Ländern Deutschlands oder den Kreisen des Landes, in ihren heutigen Grenzen.';
const TARGETS_NOTE =
  'Ausbauziele des Bundes: Solar und Wind an Land nach EEG 2023, § 4, Wind auf See nach WindSeeG, § 1 – in Bruttoleistung, ' +
  'wie das Gesetz sie zählt; alle anderen Werte der Seite netto. Der Strich auf dem Balken ist das Zwischenziel. Tempo: ' +
  'der Zubau des letzten vollen Jahres gegen den Zubau, den das Ziel vom Ende des Zeitraums an in jedem Jahr braucht.';
const PLANNED_NOTE =
  'Einheiten „in Planung“ im Marktstammdatenregister, mit einem geplanten Inbetriebnahmedatum ab dem laufenden Monat, wie ' +
  'die Betreiber es angeben. Fast alle geplanten Windenergieanlagen haben ihre Genehmigung im Register; bei Solar fehlen ' +
  'viele Planungen, die nie gemeldet werden.';
const BALKON_NOTE =
  'Balkonkraftwerke (schraffiert): die als steckerfertige Solaranlage registrierten Einheiten. Viele Balkonkraftwerke sind ' +
  'nicht registriert, manche als Gebäudeanlage (siehe Datenqualität): Die Zahl ist eine Untergrenze.';

const query = (ids) => [...new Set(ids.filter(Boolean))].map((id) => `technology=${id}`).join('&');
// A pause for the browser to lay out what was just rendered (a timer: animation frames stop in a hidden tab)
const settle = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// The period of the page: a year – the running one by default – and a month of it, or the whole year
function PeriodSetting({ period, latest, firstYear, onChange }) {
  const years = Array.from({ length: latest.year - firstYear + 1 }, (_, i) => latest.year - i).map((year) => ({
    value: String(year),
    label: year === latest.year ? `${year} (bis heute)` : String(year),
  }));
  const lastMonth = period.year === latest.year ? latest.month : 12;
  const months = [{ value: '', label: 'Ganzes Jahr' }, ...MONTHS.slice(0, lastMonth).map((name, i) => ({ value: String(i + 1), label: name }))];
  return (
    <Setting label="Zeitraum" className="ov-period">
      <ListSelect label="Jahr" value={String(period.year)} options={years} onChange={(year) => onChange({ year: Number(year), month: period.month })} />
      <ListSelect
        label="Monat"
        value={period.month ? String(period.month) : ''}
        options={months}
        onChange={(month) => onChange({ year: period.year, month: month ? Number(month) : null })}
      />
    </Setting>
  );
}

// The page as a report, off screen while its PDF is made: a title with the area, the period and the Datenstand, a
// then the blocks of the page one below the other, at the width of a page
function OverviewReport({ reportRef, model, zubau, overview, technology, scope, region, kreisAgs, datenstand }) {
  return createPortal(
    <div className="ov-report" ref={reportRef} aria-hidden="true">
      <div className="ov-report__block ov-report__cover">
        <div className="ov-report__brand">
          <span>MaStR Dashboard · Überblick</span>
          <span>mastr-data.de</span>
        </div>
        <div className="ov-report__title">
          <ScopeOutline region={region} kreis={kreisAgs} size={72} />
          <div>
            <h1>
              {technology.label} in {scope.name}
            </h1>
            <p>
              {periodName(model.period)}
              {model.running ? ' bis heute' : ''} · Bestand {asOfName(model)} · Datenstand {formatDate(datenstand)}
            </p>
          </div>
        </div>
      </div>
      <div className="ov-report__block">
        <Tiles model={model} overview={overview} scope={scope} />
      </div>
      <div className="ov-report__block">
        <ZubauSection {...zubau} model={model} scopeName={scope.name} />
      </div>
      {model.targets && (
        <div className="ov-report__block">
          <TargetsSection model={model} />
        </div>
      )}
      {model.parts.filter((p) => p.units > 0 || p.value > 0).length > 1 && (
        <div className="ov-report__block">
          <PartsSection model={model} overview={overview} scopeName={scope.name} />
        </div>
      )}
      <div className="ov-report__block">
        <ReportNotes />
      </div>
    </div>,
    document.body,
  );
}

/**
 * The page "Überblick" of a dashboard: one technology of the scope at a time – chosen in the band on top, like on every
 * page – for a period, like a report: a year (the running one by default) or a month of it (?jahr=, ?monat=). Its
 * numbers on cards of their own (Bestand at the period's end with its share and rank, units, Zubau, against the year
 * before, growth, per inhabitant, planned), its Arten side by side (Solar: Gebäude, Balkonkraftwerke, Freifläche; Wind:
 * an Land, auf See; batteries: their size classes) with their shares and their Zubau relative to their Bestand, the
 * Zubau per year or per month, in Germany the national targets. All from the monthly series of the Zubau
 * (/zubau/zeitverlauf) and the Bestand of the peers at the period's end (/zubau/bestand). All power netto, the targets
 * brutto (as the law counts). The whole page also as a PDF report.
 */
export default function OverviewView({ config, state }) {
  const { region, kreisAgs, kreisOptions, selectScope, scopeKey, scopeName, parentName } = state;
  const datenstand = useDatenstand();
  const technologies = config.technologies.filter((t) => t.statsPath && t.overview);
  // The URL's technology, or the first with an overview (Speicher: the batteries while the map shows Pumpspeicher)
  const technology = technologies.find((t) => t.id === state.technology.id) ?? technologies[0];
  const overview = technology.overview;
  const kind = kreisAgs ? 'kreis' : region ? 'land' : 'de';
  const scope = { kind, key: scopeKey, parentKey: kind === 'kreis' ? kreisAgs.slice(0, 2) : 'DE', name: scopeName, parentName };

  // The monthly series of the parts (and what they need: the Balkonkraftwerke to take out, the batteries' power, the
  // targets' Bruttoleistung), the planned units, and – for the period – the Bestand of the scope and its peers
  const ids = [...overview.parts.flatMap((p) => [p.series, p.minus, p.also]), ...Object.values(overview.targets ?? {}).flat()];
  const series = useJson(`${API_BASE_URL}/zubau/zeitverlauf?region=${scopeKey}&${query(ids)}`);
  const geplant = useJson(overview.planned ? `${API_BASE_URL}/zubau/geplant?region=${scopeKey}&yearly=true&${query(overview.planned)}` : null);
  const index = useMemo(() => (series.data ? indexSeries(series.data) : null), [series.data]);
  const extent = useMemo(() => (series.data ? extentOf(series.data) : null), [series.data]);
  const geplantByTechnology = useMemo(() => (geplant.data ? byTechnology(geplant.data) : null), [geplant.data]);
  const period = extent ? periodOf(state.searchParams, extent.latest, extent.firstYear) : null;
  const bestand = useJson(
    period
      ? `${API_BASE_URL}/zubau/bestand?parent=${scope.parentKey}&year=${period.year}${period.month ? `&month=${period.month}` : ''}&${query(overview.total)}`
      : null,
  );

  const model = useMemo(
    () =>
      index && extent && period
        ? pageModel({
            overview,
            index,
            period,
            latest: extent.latest,
            datenstand,
            bestand: bestand.data,
            scope,
            geplant: geplantByTechnology,
          })
        : null,
    // scope and period are new objects every render: their keys decide
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [overview, index, extent, period?.year, period?.month, datenstand, bestand.data, scopeKey, kind, parentName, geplantByTechnology],
  );

  // The Zubau's chart: the years, the last 12 months, a month's year up to it
  const zubau = useMemo(
    () => model && { history: historyOf(model, index, extent.firstYear), trailing: trailingMonths(model, index), ytd: yearToDate(model, index) },
    [model, index, extent],
  );

  // The page's remarks, in the order the page marks them
  const isSolar = overview.parts.some((p) => p.id === 'balkon');
  useFootnote('bestand', model ? BESTAND_NOTE : null);
  useFootnote('geplant', model?.planned ? PLANNED_NOTE : null);
  useFootnote('balkon', isSolar && model ? BALKON_NOTE : null);
  useFootnote('ziele', model?.targets ? TARGETS_NOTE : null);

  // The PDF report: rendered off screen while it is made (report: its options), then saved
  const reportRef = useRef(null);
  const [report, setReport] = useState(null);
  useEffect(() => {
    if (!report) return undefined;
    let alive = true;
    (async () => {
      try {
        await document.fonts.ready;
        // The report laid out, its chart measured its width and drawn again
        await settle(200);
        await saveReport(reportRef.current, report);
      } finally {
        if (alive) setReport(null);
      }
    })();
    return () => {
      alive = false;
    };
  }, [report]);

  const setPeriod = ({ year, month }) => {
    const { latest } = extent;
    const valid = month && (year < latest.year || month <= latest.month) ? month : null;
    trackEvent('Zeitraum', { dashboard: config.id, zeitraum: valid ? 'monat' : 'jahr' });
    state.setParams({ jahr: year === latest.year ? null : String(year), monat: valid ? String(valid) : null });
  };

  const fileBase = fileName('mastr', config.id, technology.id, 'ueberblick', scopeKey);
  const periodSlug = period ? `${period.year}${period.month ? `-${String(period.month).padStart(2, '0')}` : ''}` : '';
  const makeReport = () => {
    trackEvent('Grafikexport', { grafik: 'ueberblick-bericht', format: 'pdf' });
    setReport({
      filename: fileName(fileBase, periodSlug),
      title: `${technology.label} in ${scopeName} – Überblick ${periodName(model.period)}`,
      subject: `${technology.label}: Bestand, Zubau und Anteile in ${scopeName}`,
      source: sourceLine(datenstand),
      url: window.location.href,
    });
  };

  const head = (
    <header className="ov-head">
      <div className="ov-head__text">
        <h2 className="ov-head__title">
          {technology.label} in {scopeName}
          {model && (
            <span className="ov-head__period">
              {periodName(model.period)}
              {model.running ? ' · bis heute' : ''}
            </span>
          )}
        </h2>
      </div>
      {model && (
        <button type="button" className="btn btn--secondary ov-head__report" onClick={makeReport} disabled={Boolean(report)}>
          <FileDown size={16} aria-hidden="true" />
          {report ? 'Bericht wird erstellt …' : 'Bericht als PDF'}
        </button>
      )}
    </header>
  );
  const band = (
    <SelectionBar technologies={technologies} state={state} active={technology} filters={false}>
      {extent && period && (
        <SettingsRow>
          <PeriodSetting period={period} latest={extent.latest} firstYear={extent.firstYear} onChange={setPeriod} />
        </SettingsRow>
      )}
    </SelectionBar>
  );
  const scopeBar = <ScopeBar region={region} kreis={kreisAgs} kreisOptions={kreisOptions} onSelectScope={selectScope} />;

  if (!model) {
    const failed = series.status === 'error';
    const empty = series.status === 'ready';
    return (
      <>
        {scopeBar}
        {band}
        {head}
        <ChartPlaceholder
          variant="bars"
          title={failed ? 'Keine Daten' : empty ? 'Nichts in Betrieb' : 'Wird geladen …'}
          note={empty ? `${technology.label}: in ${scopeName}${period ? ` ${periodName(period)}` : ''} nichts in Betrieb.` : undefined}
        />
      </>
    );
  }

  const { measure, parts, targets } = model;
  const [, many] = overview.units ?? ['Anlage', 'Anlagen'];
  const unit = measure.format === 'capacity' ? 'MWh' : 'MW';
  const measureName = measure.label.replace('Installierte ', '');
  const shown = parts.filter((p) => p.units > 0 || p.value > 0);
  const named = periodName(model.period);
  const partsCsv = {
    name: 'ueberblick-arten',
    filename: fileName(fileBase, 'arten', periodSlug),
    rows: () =>
      shown.map((p) => ({
        Gebiet: scopeName,
        Zeitraum: named,
        Art: p.label,
        [`${many} in Betrieb`]: p.units,
        [`${measure.label} (${unit})`]: round(p.value, 3),
        [`Anteil an ${many} (%)`]: round(p.shareUnits * 100, 2),
        [`Anteil an ${measureName} (%)`]: round(p.shareValue * 100, 2),
        [`Zubau: ${many}`]: p.addedUnits,
        [`Zubau (${unit})`]: round(p.added, 3),
        [`Zubau ggü. Bestand davor: ${many} (%)`]: p.growthUnits == null ? null : round(p.growthUnits * 100, 2),
        [`Zubau ggü. Bestand davor: ${measureName} (%)`]: p.growthValue == null ? null : round(p.growthValue * 100, 2),
      })),
  };
  const zubauCsv = {
    name: 'ueberblick-zubau',
    filename: fileName(fileBase, 'zubau', periodSlug),
    // The years, then the last 12 months
    rows: () => [
      ...zubau.history.map((h) => ({
        Zeitraum: h.partial ? `${h.year} (unvollständig)` : String(h.year),
        ...Object.fromEntries(parts.map((part) => [`${part.label} (${unit})`, round(h.parts[part.id].added, 3)])),
      })),
      ...zubau.trailing.periods.map((p) => ({
        Zeitraum: p.label,
        ...Object.fromEntries(parts.map((part) => [`${part.label} (${unit})`, p.values[part.id] == null ? null : round(p.values[part.id], 3)])),
      })),
    ],
  };
  const targetsCsv = targets && {
    name: 'ueberblick-ziele',
    filename: fileName(fileBase, 'ausbauziele', periodSlug),
    rows: () =>
      targets.map((t) => ({
        Ziel: t.label,
        Quelle: t.source,
        Stand: asOfName(model),
        'Bestand brutto (MW)': round(t.installed, 1),
        [`Ziel ${t.goal.year} (MW)`]: t.goal.value,
        'Erreicht (%)': round((t.installed / t.goal.value) * 100, 1),
        [`Zubau ${t.pace.year} brutto (MW)`]: round(t.pace.actual, 1),
        'Nötiger Zubau je Jahr (MW)': round(t.pace.needed, 1),
      })),
  };

  return (
    <>
      {scopeBar}
      {band}
      {head}
      <Tiles model={model} overview={overview} scope={scope} />
      <ZubauSection {...zubau} model={model} scopeName={scopeName} csv={zubauCsv} moreHref={state.hrefOf('zubau')} />
      <div className={`ov-row${targets ? ' ov-row--aside' : ''}`}>
        <PartsSection model={model} overview={overview} scopeName={scopeName} csv={partsCsv} />
        {targets && <TargetsSection model={model} csv={targetsCsv} />}
      </div>
      {report && (
        <OverviewReport
          reportRef={reportRef}
          model={model}
          zubau={zubau}
          overview={overview}
          technology={technology}
          scope={scope}
          region={region}
          kreisAgs={kreisAgs}
          datenstand={datenstand}
        />
      )}
    </>
  );
}
