import { useMemo, useState } from 'react';
import { TriangleAlert } from 'lucide-react';
import { ChartFoot } from '../../components/ui/ChartExport';
import SegmentedControl from '../../components/ui/SegmentedControl';
import Setting, { SettingsRow } from '../../components/ui/Setting';
import { NETZEBENEN, NETZ_TECHNOLOGIEN } from '../../config/dashboards';
import { API_BASE_URL } from '../../config/site';
import { useJson } from '../../lib/data';
import { fileName, round } from '../../lib/files';
import { formatAmount, formatNumber, formatShare } from '../../lib/format';
import AnalysisPanel from './AnalysisPanel';
import ScopeBar from './ScopeBar';

// What the shares and the ranking go by: the power of the connected units, or the number of points
const MEASURES = [
  { id: 'leistung', label: 'Leistung', title: 'Leistung der angeschlossenen Einheiten' },
  { id: 'punkte', label: 'Anzahl', title: 'Netzanschlusspunkte in Betrieb' },
];
const TOP = 15;

const power = (mw) => formatAmount(mw, 'MW');
const sumOf = (rows, field) => rows.reduce((acc, row) => acc + (row[field] ?? 0), 0);

// Loading, failed, or nothing in the scope
function State({ status, empty }) {
  if (status === 'error') {
    return (
      <div className="timeline__state" role="alert">
        <TriangleAlert size={18} aria-hidden="true" />
        Daten derzeit nicht verfügbar.
      </div>
    );
  }
  if (status === 'loading') {
    return (
      <div className="timeline__state" role="status">
        <div className="spinner" />
        Lade Daten …
      </div>
    );
  }
  return empty ? <div className="timeline__state">Keine Netzanschlusspunkte in diesem Gebiet.</div> : null;
}

// The shares of a whole as one bar: a segment per part in its colour, its share as tooltip
function MixBar({ parts, label }) {
  const total = parts.reduce((acc, p) => acc + p.value, 0);
  return (
    <div className="mix-bar" role="img" aria-label={label}>
      {total > 0 &&
        parts
          .filter((p) => p.value > 0)
          .map((p) => (
            <span
              key={p.id}
              className="mix-bar__part"
              style={{ flexGrow: p.value, background: p.color }}
              title={`${p.label}: ${formatShare(p.value / total)}`}
            />
          ))}
    </div>
  );
}

// Netzanschlüsse je Netzebene: a row per Netzebene 1–7 – its points, the power of their units, the power per point,
// those in planning – and the mix of the main technologies of their Lokationen, by power or by number
function NetzebenenAnalysis({ analysis, region, scopeName, fileBase }) {
  const data = useJson(`${API_BASE_URL}${analysis.path}?region=${region}`);
  const [measureId, setMeasureId] = useState(MEASURES[0].id);
  const measure = MEASURES.find((m) => m.id === measureId);
  const rows = useMemo(() => {
    if (!data.data) return [];
    return NETZEBENEN.map((ebene) => {
      const own = data.data.filter((row) => row.spannungsebene === ebene.code);
      const byTech = Object.fromEntries(NETZ_TECHNOLOGIEN.map((t) => [t.id, own.find((row) => row.technologie === t.id) ?? {}]));
      return { ...ebene, punkte: sumOf(own, 'punkte'), leistung: sumOf(own, 'leistung'), geplant: sumOf(own, 'geplant'), byTech };
    });
  }, [data.data]);
  const total = { punkte: sumOf(rows, 'punkte'), leistung: sumOf(rows, 'leistung'), geplant: sumOf(rows, 'geplant') };
  const partsOf = (row) => NETZ_TECHNOLOGIEN.map((t) => ({ ...t, value: row.byTech[t.id][measure.id] ?? 0 }));

  const csv = {
    name: 'netzebenen',
    filename: fileName(fileBase, 'netzebenen', region),
    rows: () =>
      rows.map((row) => ({
        Netzebene: row.ne,
        Spannungsebene: row.label,
        Netzanschlusspunkte: row.punkte,
        'Leistung (MW)': round(row.leistung),
        'In Planung': row.geplant,
        ...Object.fromEntries(
          NETZ_TECHNOLOGIEN.flatMap((t) => [
            [`${t.label}: Punkte`, row.byTech[t.id].punkte ?? 0],
            [`${t.label}: Leistung (MW)`, round(row.byTech[t.id].leistung ?? 0)],
          ]),
        ),
      })),
  };

  return (
    <AnalysisPanel
      id={`analyse-${analysis.id}`}
      icon={analysis.icon}
      title={analysis.title}
      lead={`${scopeName} · Netzanschlusspunkte der Stromerzeugung und die Leistung ihrer Einheiten je Netzebene`}
      settings={
        <SettingsRow>
          <Setting label="Anteile nach">
            <SegmentedControl
              label="Anteile nach"
              options={MEASURES.map((m) => ({ id: m.id, label: m.label, title: `Technologien nach ${m.title}` }))}
              value={measureId}
              onChange={setMeasureId}
            />
          </Setting>
        </SettingsRow>
      }
    >
      {data.status === 'ready' && total.punkte + total.geplant > 0 ? (
        <div className="netz-table__scroll">
          <table className="netz-table">
            <thead>
              <tr>
                <th scope="col">Netzebene</th>
                <th scope="col" className="is-num">
                  Netzanschlusspunkte
                </th>
                <th scope="col" className="is-num">
                  Leistung
                </th>
                <th scope="col" className="is-num">
                  je Punkt
                </th>
                <th scope="col" className="netz-table__mix">
                  Technologien nach {measure.label}
                </th>
                <th scope="col" className="is-num">
                  In Planung
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.code}>
                  <th scope="row">
                    <span className="netz-table__ne">{row.ne}</span> {row.label}
                  </th>
                  <td className="is-num">{formatNumber(row.punkte)}</td>
                  <td className="is-num">{power(row.leistung)}</td>
                  <td className="is-num">{row.punkte ? formatAmount((row.leistung * 1000) / row.punkte, 'kW') : '–'}</td>
                  <td className="netz-table__mix">
                    <MixBar parts={partsOf(row)} label={`${row.label}: Technologien nach ${measure.label}`} />
                  </td>
                  <td className="is-num">{formatNumber(row.geplant)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <th scope="row">Gesamt</th>
                <td className="is-num">{formatNumber(total.punkte)}</td>
                <td className="is-num">{power(total.leistung)}</td>
                <td className="is-num">{total.punkte ? formatAmount((total.leistung * 1000) / total.punkte, 'kW') : '–'}</td>
                <td className="netz-table__mix" />
                <td className="is-num">{formatNumber(total.geplant)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      ) : (
        <State status={data.status} empty={data.status === 'ready'} />
      )}

      <div className="timeline-legend" aria-label="Technologien">
        {NETZ_TECHNOLOGIEN.map((t) => (
          <span key={t.id} className="timeline-legend__item is-static">
            <span className="timeline-legend__dot" style={{ background: t.color }} />
            {t.label}
          </span>
        ))}
      </div>

      <ChartFoot csv={rows.length ? csv : null}>
        <p className="timeline__note">
          Netzebene 2, 4 und 6: Umspannung zwischen den Spannungen. Technologie: die mit der meisten Leistung an der Lokation
          des Netzanschlusspunkts.{' '}
          {region === 'DE' &&
            'Deutschland mit den Pump- und Wasserkraftwerken in Luxemburg und Österreich, die am deutschen Netz angeschlossen sind (auf der Karte nicht enthalten). '}
          {analysis.note}
        </p>
      </ChartFoot>
    </AnalysisPanel>
  );
}

// Netzbetreiber: the largest in the scope by power or by number of points, each with its share, the rest in one row
function NetzbetreiberAnalysis({ analysis, region, scopeName, fileBase }) {
  const data = useJson(`${API_BASE_URL}${analysis.path}?region=${region}`);
  const [measureId, setMeasureId] = useState(MEASURES[0].id);
  const measure = MEASURES.find((m) => m.id === measureId);
  const all = useMemo(
    () => [...(data.data ?? [])].sort((a, b) => (b[measureId] ?? 0) - (a[measureId] ?? 0)),
    [data.data, measureId],
  );
  const top = all.slice(0, TOP);
  const rest = all.slice(TOP);
  const total = sumOf(all, measureId);
  const valueOf = (value) => (measureId === 'leistung' ? power(value) : formatNumber(value));
  const nameOf = (row) => row.name ?? `${row.netzbetreiber ?? 'Ohne Angabe'}`;

  const csv = {
    name: 'netzbetreiber',
    filename: fileName(fileBase, 'netzbetreiber', region),
    rows: () =>
      all.map((row) => ({
        Netzbetreiber: nameOf(row),
        'MaStR-Nummer': row.netzbetreiber,
        Netzanschlusspunkte: row.punkte,
        'Leistung (MW)': round(row.leistung),
        'In Planung': row.geplant,
      })),
  };

  return (
    <AnalysisPanel
      id={`analyse-${analysis.id}`}
      icon={analysis.icon}
      title={analysis.title}
      lead={`${scopeName} · die ${TOP} größten nach ${measure.title}, von ${formatNumber(all.length)} Netzbetreibern`}
      settings={
        <SettingsRow>
          <Setting label="Rangfolge nach">
            <SegmentedControl
              label="Rangfolge nach"
              options={MEASURES.map((m) => ({ id: m.id, label: m.label, title: `Nach ${m.title}` }))}
              value={measureId}
              onChange={setMeasureId}
            />
          </Setting>
        </SettingsRow>
      }
    >
      {data.status === 'ready' && all.length ? (
        <div className="netz-table__scroll">
          <table className="netz-table netz-table--ranking">
            <thead>
              <tr>
                <th scope="col" className="is-num">
                  Rang
                </th>
                <th scope="col">Netzbetreiber</th>
                <th scope="col" className="is-num">
                  Netzanschlusspunkte
                </th>
                <th scope="col" className="is-num">
                  Leistung
                </th>
                <th scope="col" className="netz-table__mix">
                  Anteil nach {measure.label}
                </th>
              </tr>
            </thead>
            <tbody>
              {top.map((row, i) => {
                const share = total ? (row[measureId] ?? 0) / total : 0;
                return (
                  <tr key={row.netzbetreiber ?? i}>
                    <td className="is-num netz-table__rank">{i + 1}</td>
                    <th scope="row">{nameOf(row)}</th>
                    <td className="is-num">{formatNumber(row.punkte)}</td>
                    <td className="is-num">{power(row.leistung)}</td>
                    <td className="netz-table__mix">
                      <div className="share-bar" title={`${valueOf(row[measureId])} · ${formatShare(share)}`}>
                        {/* At most the cell less the label's room: 100 % leaves the label beside it */}
                        <span className="share-bar__fill" style={{ width: `calc(${share} * (100% - 4.5rem))` }} />
                        <span className="share-bar__label">{formatShare(share)}</span>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
            {rest.length > 0 && (
              <tfoot>
                <tr>
                  <td />
                  <th scope="row">Weitere {formatNumber(rest.length)} Netzbetreiber</th>
                  <td className="is-num">{formatNumber(sumOf(rest, 'punkte'))}</td>
                  <td className="is-num">{power(sumOf(rest, 'leistung'))}</td>
                  <td className="netz-table__mix">
                    <span className="share-bar__label">{total ? formatShare(sumOf(rest, measureId) / total) : '–'}</span>
                  </td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      ) : (
        <State status={data.status} empty={data.status === 'ready'} />
      )}

      <ChartFoot csv={all.length ? csv : null}>
        <p className="timeline__note">
          Der Netzbetreiber jedes Netzanschlusspunkts, wie im MaStR angegeben; Übertragungsnetzbetreiber mit den
          Anschlüssen der Höchstspannung. Die CSV enthält alle. {analysis.note}
        </p>
      </ChartFoot>
    </AnalysisPanel>
  );
}

// The page "Spannungsebenen & Netzbetreiber" of the Netzanschlüsse, in Deutschland, a Land or a Kreis (the Gebiet in the
// header, no Gemeinde): the points per Netzebene with the mix of their technologies, and the largest grid operators
export default function NetzView({ config, state }) {
  const { region, kreisAgs, kreisOptions, selectScope, scopeKey, scopeName } = state;
  const analyses = config.analyses.filter((a) => a.view === 'spannungsebenen');
  const fileBase = `mastr_${config.id}`;
  return (
    <div className="dashboard-page">
      <ScopeBar region={region} kreis={kreisAgs} kreisOptions={kreisOptions} onSelectScope={selectScope} />
      {analyses.map((a) =>
        a.kind === 'netzebenen' ? (
          <NetzebenenAnalysis key={a.id} analysis={a} region={scopeKey} scopeName={scopeName} fileBase={fileBase} />
        ) : a.kind === 'netzbetreiber' ? (
          <NetzbetreiberAnalysis key={a.id} analysis={a} region={scopeKey} scopeName={scopeName} fileBase={fileBase} />
        ) : null,
      )}
    </div>
  );
}
