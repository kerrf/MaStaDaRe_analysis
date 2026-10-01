import { Link } from 'react-router-dom';
import { ArrowUpRight } from 'lucide-react';
import TodoNote from '../components/ui/TodoNote';
import { SITE } from '../config/site';
import { useDatenstand } from '../lib/data';
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
    data: 'Grenzen, Einwohner und Fläche der Bundesländer, Landkreise und Gemeinden, Lage der Gemeinden auf der Karte',
    source: 'Verwaltungsgebiete 1:250 000 mit Einwohnerzahlen (VG250-EW), Stand 31.12.2024, Bundesamt für Kartographie und Geodäsie',
    license: 'Datenlizenz Deutschland – Namensnennung – 2.0, © GeoBasis-DE / BKG (2025) (Daten verändert)',
    href: 'https://gdz.bkg.bund.de/index.php/default/verwaltungsgebiete-1-250-000-mit-einwohnerzahlen-stand-31-12-vg250-ew-31-12.html',
  },
  {
    data: 'Ortsnamen auf der Karte (Ortsteile mit gerechneter Einwohnerzahl)',
    source: 'Geographische Namen 1:250 000 (GN250), Stand 31.12.2024, Bundesamt für Kartographie und Geodäsie',
    license: 'Datenlizenz Deutschland – Namensnennung – 2.0, © BKG (2026) (Daten verändert)',
    href: 'https://sgx.geodatenzentrum.de/web_public/gdz/datenquellen/datenquellen_gn250.pdf',
  },
  {
    data: 'Europa als Hintergrund der Karte (Länder, Grenzen, Seen)',
    source: 'Natural Earth, 1:10 Mio., Grenzen aus deutscher Sicht (Version 5.1.1)',
    license: 'Gemeinfrei (Public Domain), vereinfacht',
    href: 'https://www.naturalearthdata.com/',
  },
  {
    data: 'Meeresgebiet „Offshore“ (Küstenmeer und Ausschließliche Wirtschaftszone)',
    source: 'Flanders Marine Institute (2023): Maritime Boundaries Geodatabase, Version 12 – Marine Regions',
    license: 'CC BY 4.0 (Daten verändert)',
    href: 'https://www.marineregions.org/',
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
  ['Landkreis / kreisfreie Stadt', 'Die Kreisebene zwischen Land und Gemeinde. Größere Städte wie München oder Köln sind kreisfrei und bilden selbst einen Kreis. Deutschland hat 400 Kreise.'],
  ['Gemeinde', 'Kleinste Verwaltungseinheit mit eigener Selbstverwaltung, z. B. Altenbeken (Kreis Paderborn) oder Aerzen (Landkreis Hameln-Pyrmont). Rund 10 800 Gemeinden, dazu gemeindefreie Gebiete wie große Forste.'],
  ['Offshore', 'Windenergieanlagen auf See liegen in keiner Gemeinde. Die Karte fasst sie in einem eigenen Gebiet zusammen: dem deutschen Teil von Nord- und Ostsee (Küstenmeer und Ausschließliche Wirtschaftszone).'],
  ['Anlagenart (Solar)', 'Art der Solaranlage laut Register: Gebäudesolaranlage (auf oder an einem Gebäude) oder Freiflächensolaranlage.'],
  ['Hauptausrichtung', 'Himmelsrichtung, in die die Module überwiegend zeigen – von Nord bis Nordwest, dazu Ost-West und nachgeführt.'],
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
    'Postleitzahlen oder Gemeinden?',
    'Beides. Bundesländer, Landkreise und Gemeinden folgen den amtlichen Verwaltungsgrenzen und haben amtliche Einwohnerzahlen; Postleitzahlgebiete sind oft kleiner, decken sich aber nicht mit Verwaltungsgrenzen. Die PLZ-Auflösung gibt es bisher für Solar.',
  ],
  [
    'Darf ich Karten und Daten weiterverwenden?',
    'Ja, unter Angabe der Quelle. Exportierte Karten enthalten die nötige Quellenangabe bereits. Details stehen unter „Datenquellen & Lizenzen“.',
  ],
];

export default function InfoPage() {
  useDocumentTitle('Info & Methodik');
  const datenstand = useDatenstand();

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
              <strong>Bundesländer, Landkreise und Gemeinden:</strong> Jede Einheit wird über den amtlichen Gemeindeschlüssel zugeordnet, den
              das Register für sie führt: die acht Stellen bestimmen die Gemeinde, die ersten fünf den Kreis, die ersten zwei das Land.
              Gezählt werden Einheiten in Betrieb. Grenzen, Einwohnerzahlen und Flächen stammen aus einer Quelle, den Verwaltungsgebieten
              1:250 000 des BKG (Stand 31.12.2024). Für die Webkarte wurden die Gemeindegrenzen vereinfacht (um bis zu rund 70 m), Kreise
              und Länder sind daraus zusammengesetzt – ihre Grenzen liegen daher exakt aufeinander.
            </p>
            <p>
              Einige Einheiten tragen den Schlüssel einer Gemeinde, die seit dem Stichtag der Geodaten fusioniert wurde (rund 0,1 %). Sie
              zählen für ihren Landkreis und ihr Land, erscheinen aber auf keiner Gemeindefläche. <strong>Windenergie auf See</strong> liegt
              in keiner Gemeinde und bildet auf jeder Ebene ein eigenes Gebiet „Offshore“; Einwohner hat es keine, die Fläche ist die des
              Meeresgebiets.
            </p>
            <p>
              <strong>Postleitzahlen:</strong> Zusätzlich wird jede Solaranlage über die Postleitzahl ihres Standorts zugeordnet. Daraus
              entstehen Summen je 5-stelliger PLZ und je PLZ-Region (3- und 2-stellig).
            </p>
            <h3>Bedienung der Karte</h3>
            <ul>
              <li>
                <strong>Bundesland anklicken</strong> (oder oben im Gebietsfeld wählen): Die Karte zoomt hinein und wechselt auf die Landkreise;
                die Rangliste zeigt dann die Landkreise bzw. Gemeinden dieses Landes.
              </li>
              <li>
                <strong>Landkreis anklicken</strong> (oder im zweiten Auswahlfeld wählen): Die Karte zoomt weiter hinein und zeigt die Gemeinden
                des Kreises. Die Kennzahlen beziehen sich dann auf den Kreis – mit seinem Anteil am Bundesland und seinem Rang unter dessen
                Kreisen.
              </li>
              <li>
                <strong>Außerhalb des gewählten Gebiets klicken</strong>: eine Ebene zurück – vom Landkreis zum Bundesland, vom Bundesland zur
                Gesamtansicht, jeweils mit der vorherigen Auflösung. „Deutschland“ im Gebietsfeld führt direkt zur Gesamtansicht.
              </li>
              <li>
                <strong>Strg/⌘ + Mausrad</strong> zoomt die Karte, normales Scrollen bewegt die Seite.
              </li>
              <li>
                <strong>Solar – Anlagenart:</strong> Gebäude- und Freiflächenanlagen lassen sich getrennt auswählen. Der Filter wird gerade
                angebunden; bis dahin zeigen Karte und Kennzahlen alle Solaranlagen.
              </li>
            </ul>
            <h3>Kennzahlen</h3>
            <ul>
              <li>
                <strong>Absolut:</strong> Summe der Bruttoleistung in MW.
              </li>
              <li>
                <strong>Je km²:</strong> Leistung in kW je Quadratkilometer Gebietsfläche – zeigt die räumliche Dichte. Beim Gebiet „Offshore“
                ist es die Meeresfläche.
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
              Das PLZ-Rollup (aggregate_pv_by_plz_power.sql) filtert nicht nach <code>EinheitBetriebsstatus</code> – stillgelegte und
              geplante Einheiten zählen dort mit, anders als bei Bundesland/Landkreis/Gemeinde. Außerdem rundet <code>NUMERIC(10,0)</code> die
              Leistung je PLZ auf ganze MW (kleine Gebiete werden 0).
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
              Herkunft der PLZ-Shapes und Einwohnerzahlen bestätigen (Dateistruktur deutet auf suche-postleitzahl.org/OSM hin).
            </TodoNote>
          </section>

          <section id="aktualitaet">
            <h2>Aktualität</h2>
            <p>
              Aktueller Datenstand: <strong>{formatDate(datenstand)}</strong>. Jede Nacht holt das Dashboard alle Änderungen
              des Marktstammdatenregisters seit dem letzten Abgleich über dessen Webdienst und berechnet Karten und Kennzahlen
              neu. Der Datenstand ist der Tag, bis zu dem alle Änderungen enthalten sind.
            </p>
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
