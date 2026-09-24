import { Link } from 'react-router-dom';
import { ArrowUpRight } from 'lucide-react';
import TodoNote from '../components/ui/TodoNote';
import { SITE } from '../config/site';
import { formatDate } from '../lib/format';
import useDocumentTitle from '../lib/useDocumentTitle';
import './pages.css';

const SECTIONS = [
  { id: 'ueber', label: 'Über das Projekt' },
  { id: 'methodik', label: 'Methodik' },
  { id: 'quellen', label: 'Datenquellen & Lizenzen' },
  { id: 'aktualitaet', label: 'Aktualität' },
  { id: 'glossar', label: 'Glossar' },
  { id: 'faq', label: 'Häufige Fragen' },
  { id: 'nutzung', label: 'Nutzung & Haftung' },
  { id: 'kontakt', label: 'Kontakt' },
];

const SOURCES = [
  {
    data: 'Anlagen- und Speicherdaten',
    source: 'Marktstammdatenregister (Gesamtdatenexport), Bundesnetzagentur',
    license: 'Datenlizenz Deutschland – Namensnennung – 2.0',
    href: 'https://www.marktstammdatenregister.de/MaStR/Datendownload',
  },
  {
    data: 'Postleitzahlgebiete, Einwohner und Fläche je PLZ',
    source: 'suche-postleitzahl.org auf Basis von OpenStreetMap',
    license: 'ODbL 1.0, © OpenStreetMap-Mitwirkende',
    href: 'https://www.suche-postleitzahl.org/downloads',
  },
  {
    data: 'Bundesländergrenzen',
    source: 'simplemaps.com',
    license: 'siehe Lizenzbedingungen des Anbieters',
    href: 'https://simplemaps.com',
  },
  {
    data: 'Kreisgrenzen (geplant)',
    source: 'Verwaltungsgebiete 1:250 000 (VG250), Bundesamt für Kartographie und Geodäsie',
    license: 'Datenlizenz Deutschland – Namensnennung – 2.0',
    href: 'https://gdz.bkg.bund.de',
  },
];

const GLOSSAR = [
  ['Bruttoleistung', 'Maximale elektrische Wirkleistung einer Einheit. Bei Photovoltaik die Summe der Modulleistung (kWp). Grundlage aller Leistungswerte hier.'],
  ['Nettonennleistung', 'Leistung, die dauerhaft ins Netz abgegeben werden kann – bei PV häufig durch den Wechselrichter begrenzt.'],
  ['kWp (Kilowatt-Peak)', 'Nennleistung von Solarmodulen unter standardisierten Testbedingungen.'],
  ['Kapazität vs. Leistung', 'Bei Speichern beschreibt die Kapazität (kWh/MWh) die speicherbare Energiemenge, die Leistung (kW/MW) wie schnell geladen oder entladen werden kann.'],
  ['MaStR-Nummer', 'Eindeutige Kennung jeder registrierten Einheit im Marktstammdatenregister (z. B. SEE… für Stromerzeugungseinheiten).'],
  ['PLZ-Region', 'Zusammenfassung von Postleitzahlgebieten über die ersten zwei bzw. drei Ziffern.'],
  ['AGS', 'Amtlicher Gemeindeschlüssel, 8-stellig. Die ersten zwei Stellen stehen für das Land, die ersten fünf für den Kreis.'],
];

const FAQ = [
  [
    'Warum weichen die Zahlen von anderen Statistiken ab?',
    'Anlagen werden teils mit Verzögerung registriert oder nachträglich korrigiert. Außerdem unterscheiden sich Stichtage, der Umgang mit stillgelegten Anlagen und Brutto- gegenüber Nettoleistung.',
  ],
  [
    'Warum sind manche Flächen grau?',
    'Für diese Gebiete liegen keine Daten vor – etwa weil dort keine Anlage registriert ist oder sich die Postleitzahl keinem Gebiet zuordnen lässt.',
  ],
  [
    'Warum Postleitzahlen und nicht Gemeinden?',
    'Die Postleitzahl des Standorts ist für nahezu alle Einheiten im Register enthalten und damit die feinste flächendeckende Ebene. Landkreise und Gemeinden sind in Vorbereitung.',
  ],
  [
    'Darf ich Karten und Daten weiterverwenden?',
    'Ja, unter Angabe der Quelle. Exportierte Karten enthalten die nötige Quellenangabe bereits. Details stehen unter „Datenquellen & Lizenzen“.',
  ],
];

export default function InfoPage() {
  useDocumentTitle('Info & Methodik');

  return (
    <div className="page">
      <header className="page-header">
        <div className="container page-header__inner">
          <span className="eyebrow">Info</span>
          <h1 className="page-header__title">Info &amp; Methodik</h1>
          <p className="page-header__lead">
            Woher die Daten kommen, wie die Kennzahlen berechnet werden und was bei der Interpretation zu beachten ist.
          </p>
        </div>
      </header>

      <div className="container page-body info-layout">
        <nav className="toc" aria-label="Inhalt">
          <div className="toc__title">Inhalt</div>
          <ol>
            {SECTIONS.map((s) => (
              <li key={s.id}>
                <a href={`#${s.id}`}>{s.label}</a>
              </li>
            ))}
          </ol>
        </nav>

        <article className="prose info-article">
          <section id="ueber">
            <h2>Über das Projekt</h2>
            <p>
              Das Marktstammdatenregister (MaStR) der Bundesnetzagentur erfasst jede Anlage zur Stromerzeugung und -speicherung in
              Deutschland – vom Balkonkraftwerk bis zum Offshore-Windpark. Die Daten sind öffentlich, aber in ihrer Rohform kaum lesbar.
            </p>
            <p>
              Dieses Projekt bereitet sie auf und macht den Ausbau erneuerbarer Energien regional sichtbar und vergleichbar: bundesweit,
              je Bundesland und kleinräumig bis auf Postleitzahl-Ebene.
            </p>
            <TodoNote>Eigene Motivation ergänzen: Wer steckt dahinter, was ist das Ziel, für wen ist das Dashboard gedacht?</TodoNote>
          </section>

          <section id="methodik">
            <h2>Methodik</h2>
            <h3>Datengrundlage</h3>
            <p>
              Grundlage ist der <strong>Gesamtdatenexport</strong> des Marktstammdatenregisters. Je Einheit werden unter anderem
              Bruttoleistung, Inbetriebnahmedatum, Postleitzahl und Bundesland ausgewertet und in einer PostgreSQL/PostGIS-Datenbank
              aggregiert.
            </p>
            <h3>Räumliche Zuordnung</h3>
            <p>
              Jede Einheit wird über die Postleitzahl ihres Standorts zugeordnet. Daraus entstehen Summen je 5-stelliger PLZ, je PLZ-Region
              (3- und 2-stellig) sowie je Bundesland.
            </p>
            <h3>Kennzahlen</h3>
            <ul>
              <li>
                <strong>Absolut:</strong> Summe der Bruttoleistung in MW.
              </li>
              <li>
                <strong>Je km²:</strong> Leistung in kW je Quadratkilometer Gebietsfläche – zeigt die räumliche Dichte.
              </li>
              <li>
                <strong>Je Einwohner:</strong> Leistung in kW je Einwohner – macht dicht und dünn besiedelte Regionen vergleichbar.
              </li>
            </ul>
            <h3>Farbskala &amp; Legende</h3>
            <p>
              Die Karten verwenden eine einfarbige Skala von hell (wenig) nach dunkel (viel). Bei vielen kleinen Gebieten wird die Skala beim
              98. Perzentil gekappt, damit einzelne Ausreißer die Karte nicht dominieren – in der Legende erkennbar am Zeichen „≥“. Grau
              dargestellte Flächen enthalten keine Daten.
            </p>
            <h3>Heatmap</h3>
            <p>
              Die kontinuierliche Ansicht glättet die Anlagendichte mit einem Gauß-Kern – unabhängig von Verwaltungs- oder PLZ-Grenzen.
            </p>
            <TodoNote>
              Prüfen: Die Aggregations-SQLs filtern nicht nach <code>EinheitBetriebsstatus</code> – stillgelegte und geplante Einheiten zählen
              derzeit mit. Außerdem rundet <code>NUMERIC(10,0)</code> die Leistung je PLZ auf ganze MW (kleine Gebiete werden 0).
            </TodoNote>
          </section>

          <section id="quellen">
            <h2>Datenquellen &amp; Lizenzen</h2>
            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th scope="col">Daten</th>
                    <th scope="col">Quelle</th>
                    <th scope="col">Lizenz</th>
                  </tr>
                </thead>
                <tbody>
                  {SOURCES.map((s) => (
                    <tr key={s.data}>
                      <td>{s.data}</td>
                      <td>
                        <a href={s.href} target="_blank" rel="noopener noreferrer">
                          {s.source}
                        </a>
                      </td>
                      <td>{s.license}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p>
              Lizenztext der Datenlizenz Deutschland:{' '}
              <a href="https://www.govdata.de/dl-de/by-2-0" target="_blank" rel="noopener noreferrer">
                govdata.de/dl-de/by-2-0
              </a>
            </p>
            <TodoNote>
              Herkunft der PLZ-Shapes und Einwohnerzahlen bestätigen (Dateistruktur deutet auf suche-postleitzahl.org/OSM hin). Für die
              Bundesländer die simplemaps-Lizenz prüfen – oder gleich auf BKG VG250 umstellen, das liefert auch die Landkreise.
            </TodoNote>
          </section>

          <section id="aktualitaet">
            <h2>Aktualität</h2>
            <p>
              Aktueller Datenstand: <strong>{formatDate(SITE.dataStand)}</strong>. Die Bundesnetzagentur veröffentlicht den
              Gesamtdatenexport regelmäßig neu; die Daten dieses Dashboards werden in festen Abständen aktualisiert.
            </p>
            <TodoNote>Aktualisierungsrhythmus festlegen, sobald die Update-Pipeline steht – und den Datenstand vom Backend ausliefern lassen.</TodoNote>
          </section>

          <section id="glossar">
            <h2>Glossar</h2>
            <dl className="glossary">
              {GLOSSAR.map(([term, text]) => (
                <div key={term}>
                  <dt>{term}</dt>
                  <dd>{text}</dd>
                </div>
              ))}
            </dl>
          </section>

          <section id="faq">
            <h2>Häufige Fragen</h2>
            <div className="faq">
              {FAQ.map(([q, a]) => (
                <details key={q}>
                  <summary>{q}</summary>
                  <p>{a}</p>
                </details>
              ))}
            </div>
          </section>

          <section id="nutzung">
            <h2>Nutzung &amp; Haftung</h2>
            <p>
              Die Darstellungen werden mit Sorgfalt erstellt, eine Gewähr für Vollständigkeit und Richtigkeit wird jedoch nicht übernommen.
              Dies ist kein offizielles Angebot der Bundesnetzagentur. Bei Weiterverwendung bitte die Quellen gemäß der jeweiligen Lizenz
              nennen.
            </p>
            <p>
              Siehe auch <Link to="/impressum">Impressum</Link> und <Link to="/datenschutz">Datenschutz</Link>.
            </p>
          </section>

          <section id="kontakt">
            <h2>Kontakt</h2>
            <p>Fragen, Fehler gefunden oder Ideen für neue Auswertungen? Am schnellsten erreichst du mich hier:</p>
            <div className="contact-links">
              {SITE.owner.email && (
                <a className="btn btn--secondary" href={`mailto:${SITE.owner.email}`}>
                  E-Mail
                </a>
              )}
              <a className="btn btn--secondary" href={SITE.links.github} target="_blank" rel="noopener noreferrer">
                GitHub <ArrowUpRight size={14} aria-hidden="true" />
              </a>
              <a className="btn btn--secondary" href={SITE.links.linkedin} target="_blank" rel="noopener noreferrer">
                LinkedIn <ArrowUpRight size={14} aria-hidden="true" />
              </a>
            </div>
            <TodoNote>E-Mail-Adresse in src/config/site.js (owner.email) eintragen – dann erscheint hier ein E-Mail-Button.</TodoNote>
          </section>
        </article>
      </div>
    </div>
  );
}
