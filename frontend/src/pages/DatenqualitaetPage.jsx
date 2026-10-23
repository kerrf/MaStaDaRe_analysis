import { Link } from 'react-router-dom';
import { ArrowLeft, Download } from 'lucide-react';
import Badge from '../components/ui/Badge';
import useDocumentTitle from '../lib/useDocumentTitle';
import useRobots from '../lib/useRobots';
import './pages.css';

// How complete and plausible the register's entries are, and how the dashboards deal with it – by technology, each
// finding a sub-section in short points. A start: what came up while preparing the data, counted once on the data of
// 4 October 2026 (the numbers are written here, not loaded). Until the page is complete, search engines leave it out
// (noindex) and the sitemap doesn't list it (scripts/prerender.mjs).

// Freiflächenanlagen per size class: units in the register, Anlagen after merging the units at one grid connection
// (mrt.size_distribution)
const FREIFLAECHEN = [
  ['bis 2 kWp', '67', '67'],
  ['2–7 kWp', '823', '552'],
  ['7–12 kWp', '1.593', '728'],
  ['12–40 kWp', '1.293', '1.106'],
  ['40–100 kWp', '1.125', '785'],
  ['0,1–1 MWp', '7.671', '5.388'],
  ['1–10 MWp', '6.315', '5.495'],
  ['über 10 MWp', '930', '1.021'],
];

// Batteries left out of the capacity (rules of battery-charts.de): why, how many, their capacity
const IMPLAUSIBLE = [
  ['höchstens 0,3 kWh oder 0,3 kW', '5.395', '6,5 MWh'],
  ['erst nach mehr als 12 Stunden voll', '4.949', '146,4 MWh'],
  ['in weniger als 6 Minuten voll', '127', '0,4 MWh'],
  ['ohne Speicheranlage oder Kapazität', '64', '–'],
];

// The catalogs of the export with the columns that use them (backend/app/etl/katalog.py writes it into public/)
const KATALOG_JSON = '/daten/mastr-katalogwerte.json';

// What holds for the whole register, then the technologies, each with its findings (sub-sections); one without any yet
// says so
const CATEGORIES = [
  {
    id: 'allgemein',
    label: 'Allgemein',
    topics: [
      { id: 'codes', label: 'Zahlen statt Text' },
      { id: 'gemeindeschluessel', label: 'Unvollständige Gemeindeschlüssel' },
    ],
  },
  {
    id: 'solar',
    label: 'Solar',
    topics: [
      { id: 'solarparks-in-teilen', label: 'Solarparks in Teilen' },
      { id: 'sammel-lokationen', label: 'Sammel-Lokationen' },
      { id: 'kleine-freiflaechen', label: 'Kleine Freiflächenanlagen' },
      { id: 'balkonkraftwerke', label: 'Balkonkraftwerke' },
      { id: 'flaeche-module', label: 'Fläche und Module' },
    ],
  },
  { id: 'wind', label: 'Wind', topics: [] },
  { id: 'wasserkraft', label: 'Wasserkraft', topics: [] },
  { id: 'biomasse', label: 'Biomasse', topics: [{ id: 'biomasse-einheiten', label: 'Einheiten, EEG- und KWK-Anlagen' }] },
  { id: 'geothermie', label: 'Geothermie & Grubengas', topics: [{ id: 'geothermie-tabelle', label: 'Sechs Energieträger in einer Tabelle' }] },
  {
    id: 'kwk',
    label: 'KWK',
    topics: [
      { id: 'kwk-ort', label: 'Anlagen ohne Ort' },
      { id: 'kwk-waerme', label: 'Wärme' },
    ],
  },
  {
    id: 'batteriespeicher',
    label: 'Batteriespeicher',
    topics: [
      { id: 'speicherkapazitaet', label: 'Kapazität' },
      { id: 'speicher-in-teilen', label: 'Speicher in Teilen' },
    ],
  },
  { id: 'pumpspeicher', label: 'Pumpspeicher', topics: [{ id: 'pumpspeicher-maschinen', label: 'Maschinen statt Kraftwerke' }] },
  { id: 'sonstige-speicher', label: 'Sonstige Speicher', topics: [{ id: 'sonstige-kapazitaet', label: 'Kapazität' }] },
  { id: 'gas', label: 'Gas', topics: [] },
];

// A technology without findings yet
function NotYet() {
  return <p className="quality__empty">Noch nicht geprüft.</p>;
}

export default function DatenqualitaetPage() {
  useDocumentTitle('Datenqualität des MaStR');
  useRobots('noindex');

  return (
    <div className="page" data-topic="qualitaet">
      <header className="page-header">
        <div className="container page-header__inner">
          <Link to="/" className="page-header__back">
            <ArrowLeft size={15} aria-hidden="true" /> Übersicht
          </Link>
          <div className="page-header__row">
            <h1 className="page-header__title">Datenqualität des MaStR</h1>
            <Badge tone="soon">Im Aufbau</Badge>
          </div>
          <p className="page-header__lead">
            Was im Marktstammdatenregister auffällt – je Technologie – und wie die Auswertungen hier damit umgehen.
          </p>
        </div>
      </header>

      <div className="container page-body info-layout">
        <nav className="toc" aria-label="Inhalt">
          <div className="toc__title">Inhalt</div>
          <ol>
            {CATEGORIES.map((c) => (
              <li key={c.id}>
                <a href={`#${c.id}`} className="toc__category">
                  {c.label}
                </a>
                {c.topics.length > 0 && (
                  <ol className="toc__sub">
                    {c.topics.map((t) => (
                      <li key={t.id}>
                        <a href={`#${t.id}`}>{t.label}</a>
                      </li>
                    ))}
                  </ol>
                )}
              </li>
            ))}
          </ol>
        </nav>

        <article className="prose info-article quality">
          <p className="quality__stand">
            Alle Zahlen: Einheiten in Betrieb in Deutschland, Datenstand 4. Oktober 2026 (Biomasse, Geothermie, KWK und
            sonstige Speicher: Gesamtdatenexport vom 26. September 2026).
          </p>

          <section id="allgemein">
            <h2>Allgemein</h2>

            <section id="codes">
              <h3>Zahlen statt Text</h3>
              <ul>
                <li>Der Gesamtdatenexport führt viele Felder als Zahl: Betriebsstatus 35, Art der Solaranlage 853, Hersteller 1586.</li>
                <li>
                  Was eine Zahl bedeutet, steht in Katalogwerte.xml (1.737 Werte in 123 Katalogen) – welche Spalte welchen Katalog nutzt,
                  steht nirgends.
                </li>
                <li>
                  Der Webdienst des Registers (SOAP-API) liefert statt der Zahl ihre Bedeutung („InBetrieb“). Dieselben Einheiten aus
                  Export und Webdienst nebeneinander zeigen, welche Zahl was heißt – Spalte für Spalte, 135 Spalten in 21 Dateien.
                </li>
                <li>
                  Drei Spalten zählen nach eigenen Dateien: Lokationstyp, Marktfunktion und EEG-Anlagentyp. Dieselbe Zahl heißt dort
                  etwas anderes – 8 ist im Katalog „Kernenergie“, als EEG-Anlagentyp „Stromspeichereinheit“.
                </li>
                <li>Umgang: Die Datenbank führt den Text statt der Zahl („In Betrieb“ statt 35) – auch für alles, was der nächtliche Abgleich holt.</li>
              </ul>
              <p>
                <a className="btn btn--secondary" href={KATALOG_JSON} download>
                  <Download size={14} aria-hidden="true" /> Alle Kataloge mit ihren Spalten (JSON, 90 KB)
                </a>
              </p>
            </section>

            <section id="gemeindeschluessel">
              <h3>Unvollständige Gemeindeschlüssel</h3>
              <ul>
                <li>Der Gemeindeschlüssel hat 8 Stellen: 2 für das Land, 3 für den Kreis, 3 für die Gemeinde.</li>
                <li>
                  Vereinzelt liefert das Register nur 5 Stellen – im Oktober 2026 ein Batteriespeicher in Leipzig mit „14713“ statt
                  „14713000“. Er zählte doppelt als Kreis und hielt den nächtlichen Abgleich einen Tag lang auf.
                </li>
                <li>
                  Umgang: Jede Nacht bekommt ein fünfstelliger Schlüssel einer kreisfreien Stadt seine Gemeinde („14713000“), jeder
                  andere unvollständige wird geleert – die Einheit fehlt dann in den Auswertungen nach Gebiet.
                </li>
              </ul>
            </section>
          </section>

          <section id="solar">
            <h2>Solar</h2>

            <section id="solarparks-in-teilen">
              <h3>Solarparks in Teilen</h3>
              <ul>
                <li>Das Register zählt Einheiten, nicht Anlagen – viele Parks sind je Bauabschnitt, Wechselrichter oder Investor registriert.</li>
                <li>Beispiel: 132 Einheiten à knapp 10 kWp, ein Betreiber, ein Tag – zusammen ein Park mit 1,3 MWp.</li>
                <li>An einem Netzanschluss hängen bis zu 38 Betreiber.</li>
                <li>
                  Umgang: Die <Link to="/erzeuger/anlagen">Verteilung nach Anlagengröße</Link> fasst Einheiten am selben Netzanschluss
                  (Lokation) und mit derselben Anlagenart zu einer Anlage zusammen.
                </li>
                <li>Freiflächen: 19.817 Einheiten → 15.142 Anlagen (1.834 aus mehreren Einheiten).</li>
                <li>Gebäude: 6,37 Mio. Einheiten → 6,12 Mio. Anlagen – meist Erweiterungen (88 %: ≥ 3 Monate zwischen erster und letzter Inbetriebnahme).</li>
                <li>Ausnahmen: Balkonkraftwerke bis 2 kWp zählen einzeln; Lokationen über Gemeinde- oder PLZ-Grenzen zählen je Gebiet.</li>
                <li>Karten, Tabellen und Zubau zählen weiter Einheiten.</li>
              </ul>
              <div className="table-wrap quality__table">
                <table className="data-table">
                  <caption className="visually-hidden">Freiflächenanlagen je Größenklasse: Einheiten im Register und Anlagen</caption>
                  <thead>
                    <tr>
                      <th scope="col">Freiflächen</th>
                      <th scope="col">Einheiten</th>
                      <th scope="col">Anlagen</th>
                    </tr>
                  </thead>
                  <tbody>
                    {FREIFLAECHEN.map(([size, units, anlagen]) => (
                      <tr key={size}>
                        <th scope="row">{size}</th>
                        <td>{units}</td>
                        <td>{anlagen}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            <section id="sammel-lokationen">
              <h3>Sammel-Lokationen</h3>
              <ul>
                <li>Nicht jede Lokation ist ein Netzanschluss.</li>
                <li>Eine Lokation in Hamburg: 1.152 Einheiten, über 1.100 Betreiber, 94 PLZ-Gebiete – fast nur Balkonkraftwerke.</li>
                <li>Andere verbinden Einheiten in bis zu zwölf Gemeinden.</li>
                <li>Umgang: die beiden Ausnahmen oben.</li>
              </ul>
            </section>

            <section id="kleine-freiflaechen">
              <h3>Kleine Freiflächenanlagen</h3>
              <ul>
                <li>3.776 Freiflächen-Einheiten haben höchstens 40 kWp.</li>
                <li>
                  Zulässig: Nach{' '}
                  <a href="https://www.gesetze-im-internet.de/eeg_2014/__3.html" target="_blank" rel="noopener noreferrer">
                    EEG § 3 Nr. 22
                  </a>{' '}
                  ist alles ohne Gebäude Freifläche – auch Garten oder Weide.
                </li>
                <li>1.280 (13,6 MW) sind Teile größerer Anlagen, meist Tracker der 2000er – zusammengefasst in größeren Klassen.</li>
                <li>2.453 (33,9 MW) bleiben klein: 72 % mit Eigenverbrauch, 21 % nachgeführt.</li>
                <li>Einige Dutzend heißen „Dach“, „Stall“, „Scheune“ oder „Carport“ – vermutlich Gebäudeanlagen.</li>
              </ul>
            </section>

            <section id="balkonkraftwerke">
              <h3>Balkonkraftwerke</h3>
              <ul>
                <li>Registriert als steckerfertige Solaranlage: 1,53 Mio. in Betrieb, 1,1 GW netto – fast alle seit 2023 (2024 und 2025 je rund 430.000, 2026 bisher 327.000).</li>
                <li>
                  Viele fehlen: Schätzungen zufolge ist nur ein Viertel bis ein Drittel registriert (Balkon-Solar e. V.), auf jedes
                  registrierte kommen rund zwei nicht registrierte (ZSW) –{' '}
                  <a
                    href="https://www.stuttgarter-zeitung.de/lokales/stuttgart/solarenergie-in-baden-wuerttemberg-unangemeldete-balkonkraftwerke-aussage-einer-genauen-zahl-ist-irrefuehrend-78870090.html"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Stuttgarter Zeitung
                  </a>
                  .
                </li>
                <li>
                  Manche stehen als Gebäudesolaranlage im Register: rund 52.000 haben ihre Größe (≤ 2 kWp, Wechselrichter ≤ 800 W),
                  rund 17.000 auch einen Namen wie „Balkonkraftwerk“, „Balkon“ oder „Mini-PV“.
                </li>
                <li>Umgekehrt: 604 steckerfertige mit mehr als 2 kWp, 2.129 mit Wechselrichter über 800 W.</li>
                <li>
                  Umgang: Karte, Anlagen und Regionen führen Balkonkraftwerke als eigene Anlagenart, der „Überblick“ zeigt sie
                  getrennt – nach der Art im Register, also als Untergrenze; „Gebäude“ ist ohne sie. Die Größenklasse „bis 2 kWp“
                  geht nach der Leistung, nicht nach der Art.
                </li>
              </ul>
            </section>

            <section id="flaeche-module">
              <h3>Fläche und Module</h3>
              <ul>
                <li>Kleine Freiflächen (≤ 40 kWp): 67 mit ≥ 0,5 ha – vermutlich m² im Feld für ha (z. B. 17,6 kWp, 95 Module, „100 ha“).</li>
                <li>104 mit mehr als 800 W je Modul, 18 mit weniger als 50 W – Modulzahl oder Leistung falsch.</li>
                <li>Umgang: Fläche und Modulzahl wertet die Seite nicht aus.</li>
              </ul>
            </section>
          </section>

          <section id="wind">
            <h2>Wind</h2>
            <NotYet />
          </section>

          <section id="wasserkraft">
            <h2>Wasserkraft</h2>
            <NotYet />
          </section>

          <section id="biomasse">
            <h2>Biomasse</h2>

            <section id="biomasse-einheiten">
              <h3>Einheiten, EEG- und KWK-Anlagen</h3>
              <ul>
                <li>21.703 Einheiten mit 9,1 GW: Biogas 20.430 (7,2 GW), feste Biomasse 801 (1,8 GW), flüssige 472 (75 MW).</li>
                <li>Das EEG zählt Anlagen: 14.294 mit 9,05 GW – eine Biogasanlage hat oft mehrere Motoren, jeder eine Einheit.</li>
                <li>19.299 Einheiten (8,3 GW) gehören zu einer KWK-Anlage: Strom und Wärme zugleich.</li>
                <li>Umgang: Karte und Zubau zählen Einheiten; 11 Einheiten (53 MW) nur mit Bundesland zählen für das Land.</li>
              </ul>
            </section>
          </section>

          <section id="geothermie">
            <h2>Geothermie &amp; Grubengas</h2>

            <section id="geothermie-tabelle">
              <h3>Sechs Energieträger in einer Tabelle</h3>
              <ul>
                <li>
                  Das Register führt sie zusammen (EinheitenGeothermieGrubengasDruckentspannung): Grubengas 115 Einheiten (140 MW), Druck
                  aus Gasleitungen 49 (100 MW), Geothermie 12 (62 MW), Klärschlamm 45 (49 MW), Druck aus Wasserleitungen 16 (4 MW),
                  Solarthermie 1.
                </li>
                <li>Umgang: eine Technologie mit Filter je Energieträger; Gas- und Wasserleitungen zusammen als Druckentspannung.</li>
                <li>16 Einheiten (97 MW) nur mit Bundesland – sie zählen für das Land.</li>
              </ul>
            </section>
          </section>

          <section id="kwk">
            <h2>KWK</h2>

            <section id="kwk-ort">
              <h3>Anlagen ohne Ort</h3>
              <ul>
                <li>80.790 KWK-Anlagen in Betrieb, 41,2 GW elektrisch – darunter 14.534 Mikro-KWK bis 2 kW in Häusern.</li>
                <li>Eine KWK-Anlage hat keinen Standort, nur ihre Einheiten (Biomasse, Verbrennung, Grubengas).</li>
                <li>Umgang: Ort und Energieträger der größten Einheit.</li>
                <li>
                  342 Anlagen mit 26,5 GW – fast zwei Drittel der Leistung – stehen nur mit ihrem Bundesland im Register: die großen
                  Heizkraftwerke. Auf Kreisebene zeigt die Karte vor allem kleine KWK.
                </li>
              </ul>
            </section>

            <section id="kwk-waerme">
              <h3>Wärme</h3>
              <ul>
                <li>
                  61 Anlagen mit mehr als dem 1.000-Fachen ihrer elektrischen Leistung als Wärme, zusammen 18,6 GW – etwa 620 kW
                  elektrisch und 4,4 GW thermisch: vermutlich kWh im Jahr statt kW.
                </li>
                <li>
                  Umgang: Wärme nur bis zum 50-Fachen der elektrischen Leistung (Mikro-KWK mit Spitzenkessel reichen bis dahin). 128
                  Anlagen zählen ohne Wärme; es bleiben 74,4 GW thermisch.
                </li>
              </ul>
            </section>
          </section>

          <section id="batteriespeicher">
            <h2>Batteriespeicher</h2>

            <section id="speicherkapazitaet">
              <h3>Kapazität</h3>
              <ul>
                <li>Oft Wh und kWh verwechselt – z. B. Heimspeicher mit 14.000 kWh und 3,5 kW: 4.000 Stunden bis voll.</li>
                <li>
                  Umgang: Prüfregeln von{' '}
                  <a href="https://battery-charts.de/battery-charts/" target="_blank" rel="noopener noreferrer">
                    battery-charts.de
                  </a>{' '}
                  (RWTH Aachen) – mehr als 0,3 kWh und 0,3 kW, voll in 6 Minuten bis 12 Stunden.
                </li>
                <li>Ergebnis: 2,81 Mio. Speicher → 2,80 Mio. mit 33,7 GWh.</li>
                <li>
                  Offen: Großspeicher von Privatpersonen (kW und kWh je × 1.000) – Betreiberart fehlt noch. Schätzung: 8 von 672
                  Großspeichern neben Solar ≤ 30 kWp, zusammen 50 MWh.
                </li>
              </ul>
              <div className="table-wrap quality__table">
                <table className="data-table">
                  <caption className="visually-hidden">Nicht gezählte Batteriespeicher nach Grund</caption>
                  <thead>
                    <tr>
                      <th scope="col">Nicht gezählt</th>
                      <th scope="col">Speicher</th>
                      <th scope="col">Kapazität</th>
                    </tr>
                  </thead>
                  <tbody>
                    {IMPLAUSIBLE.map(([why, units, capacity]) => (
                      <tr key={why}>
                        <th scope="row">{why}</th>
                        <td>{units}</td>
                        <td>{capacity}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr>
                      <th scope="row">zusammen (0,4 % der Speicher)</th>
                      <td>10.535</td>
                      <td>153 MWh</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </section>

            <section id="speicher-in-teilen">
              <h3>Speicher in Teilen</h3>
              <ul>
                <li>24 Netzanschlüsse ≥ 1 MW mit 2–14 Speicheranlagen, zusammen 76 – z. B. 25 MWh in zehn Teilen à 2,5 MWh.</li>
                <li>Umgang: Die Verteilung nach Speichergröße zählt sie bisher einzeln.</li>
                <li>Heimspeicher: rund 19.100 Anschlüsse mit 2–10 Speichern, 5.500 davon mit verschiedenen Betreibern (Mehrparteienhäuser).</li>
              </ul>
            </section>
          </section>

          <section id="pumpspeicher">
            <h2>Pumpspeicher</h2>

            <section id="pumpspeicher-maschinen">
              <h3>Maschinen statt Kraftwerke</h3>
              <ul>
                <li>Registriert je Maschine, teils als zwei Speicheranlagen oder über mehrere Stationen.</li>
                <li>Umgang: Maschinen am selben Standort oder in derselben Speicheranlage = ein Kraftwerk.</li>
                <li>Ergebnis: 75 Maschinen → 22 Kraftwerke in Deutschland, dazu 10 in Österreich und Luxemburg.</li>
                <li>Winzige Einträge bis 33 kW (Pergola, Wärmepumpe, Heimspeicher) zählen nicht.</li>
              </ul>
            </section>
          </section>

          <section id="sonstige-speicher">
            <h2>Sonstige Speicher</h2>

            <section id="sonstige-kapazitaet">
              <h3>Kapazität</h3>
              <ul>
                <li>391 Wasserstoffspeicher, 96 Druckluft- und 14 Schwungradspeicher in Betrieb, zusammen rund 4 MW.</li>
                <li>
                  Wasserstoff meist im Haus (z. B. 1,5 kW, 1.500 kWh): rechnerisch 1.000 Stunden bis voll – plausibel, ein Speicher über
                  den Winter.
                </li>
                <li>
                  Der Druckluftspeicher Huntorf (Turbine 321 MW) steht mit 1 kW und 1.680 MWh im Register, nur mit seinem Bundesland.
                </li>
                <li>Umgang: Kapazität wie registriert, ohne die Prüfregeln der Batteriespeicher.</li>
              </ul>
            </section>
          </section>

          <section id="gas">
            <h2>Gas</h2>
            <NotYet />
          </section>
        </article>
      </div>
    </div>
  );
}
