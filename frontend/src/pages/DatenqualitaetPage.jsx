import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import Badge from '../components/ui/Badge';
import useDocumentTitle from '../lib/useDocumentTitle';
import useRobots from '../lib/useRobots';
import './pages.css';

// How complete and plausible the register's entries are, and how the dashboards deal with it. A start: what came up
// while preparing the data, counted once on the data of 4 October 2026 (the numbers are written here, not loaded).
// Until the page is complete, search engines leave it out (noindex) and the sitemap doesn't list it
// (scripts/prerender.mjs).

const SECTIONS = [
  { id: 'solarparks-in-teilen', label: 'Solarparks in Teilen' },
  { id: 'sammel-lokationen', label: 'Sammel-Lokationen' },
  { id: 'kleine-freiflaechen', label: 'Kleine Freiflächenanlagen' },
  { id: 'balkonkraftwerke', label: 'Balkonkraftwerke als Gebäudeanlage' },
  { id: 'tippfehler', label: 'Fläche und Module' },
  { id: 'speicherkapazitaet', label: 'Kapazität von Batteriespeichern' },
  { id: 'speicher-in-teilen', label: 'Batteriespeicher in Teilen' },
  { id: 'pumpspeicher', label: 'Pumpspeicher' },
];

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
            Wie vollständig und plausibel sind die Angaben im Marktstammdatenregister? Ein erster Überblick: was beim Aufbereiten
            auffällt und wie die Auswertungen hier damit umgehen.
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
          <p className="quality__stand">Alle Zahlen: Einheiten in Betrieb in Deutschland, Datenstand 4. Oktober 2026.</p>

          <section id="solarparks-in-teilen">
            <h2>Solarparks in Teilen registriert</h2>
            <p>
              Das Register zählt Einheiten, nicht Anlagen. Viele Solarparks sind in Teilen registriert: je Bauabschnitt, je
              Wechselrichter oder je Investor. Ein Beispiel: 132 Einheiten mit je knapp 10 kWp, ein Betreiber, alle am selben Tag
              in Betrieb genommen – zusammen ein Park mit 1,3 MWp. Andere Parks gehören vielen Eigentümern: An einem Netzanschluss
              hängen bis zu 38 Betreiber.
            </p>
            <p>
              Die <Link to="/erzeuger/anlagen">Verteilung nach Anlagengröße</Link> zählt deshalb Anlagen statt Einheiten:{' '}
              <strong>Einheiten am selben Netzanschluss</strong> – im Register dieselbe Lokation – und mit derselben Anlagenart
              gelten als eine Anlage, egal wem sie gehören. Bei Freiflächen werden so aus 19.817 Einheiten 15.142 Anlagen; 1.834
              davon bestehen aus mehreren Einheiten.
            </p>
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
            <p>
              Bei Gebäuden werden aus 6,37 Mio. Einheiten 6,12 Mio. Anlagen. Meist sind es Erweiterungen: Bei 88 % der
              zusammengefassten Anlagen liegen mindestens drei Monate zwischen der ersten und der letzten Inbetriebnahme.
            </p>
            <p>
              Zwei Ausnahmen: <strong>Balkonkraftwerke bis 2 kWp zählen immer einzeln</strong> – die Mieter eines Hauses haben
              ihre eigenen, auch hinter demselben Anschluss. Und Einheiten einer Lokation in verschiedenen Gemeinden oder
              Postleitzahlgebieten zählen getrennt; ein Park über eine Gemeindegrenze hinweg zählt in jeder Gemeinde. Die übrigen
              Zahlen – Karten, Tabellen, Zubau – zählen weiter Einheiten.
            </p>
          </section>

          <section id="sammel-lokationen">
            <h2>Sammel-Lokationen</h2>
            <p>
              Eine Lokation soll die Einheiten an einem Netzanschluss bündeln. Nicht jede tut das: Eine einzige Lokation in Hamburg
              trägt 1.152 Einheiten von über 1.100 Betreibern in 94 Postleitzahlgebieten, fast alles
              Balkonkraftwerke. Andere verbinden Einheiten verschiedener Betreiber in bis zu zwölf Gemeinden. Ein gemeinsamer
              Netzanschluss ist das nicht – daher die beiden Ausnahmen oben.
            </p>
          </section>

          <section id="kleine-freiflaechen">
            <h2>Kleine Freiflächenanlagen</h2>
            <p>
              3.776 Freiflächen-Einheiten haben höchstens 40 kWp – für einen Solarpark zu wenig. Unmöglich ist das nicht: Nach dem{' '}
              <a href="https://www.gesetze-im-internet.de/eeg_2014/__3.html" target="_blank" rel="noopener noreferrer">
                EEG (§ 3 Nr. 22)
              </a>{' '}
              ist jede Solaranlage, die nicht auf, an oder in einem Gebäude oder einer anderen baulichen Anlage steckt, eine
              Freiflächenanlage – auch die im Garten oder auf der Weide.
            </p>
            <ul>
              <li>
                <strong>1.280 sind Teile größerer Anlagen</strong> (13,6 MW), meist Nachführanlagen, viele aus den
                2000er-Jahren: Jeder Tracker ist eine eigene Einheit, oft mit eigenem Betreiber. Zusammengefasst zählen sie in
                größeren Klassen.
              </li>
              <li>
                <strong>Es bleiben 2.453 kleine Anlagen</strong> (33,9 MW). 72 % speisen nur einen Teil ihres Stroms ein, den Rest
                verbrauchen Haus, Hof oder Betrieb selbst; 21 % werden der Sonne nachgeführt.
              </li>
              <li>
                Einige Dutzend heißen „Dach“, „Stall“, „Scheune“ oder „Carport“ und gehören vermutlich zu den Gebäudeanlagen.
              </li>
            </ul>
          </section>

          <section id="balkonkraftwerke">
            <h2>Balkonkraftwerke als Gebäudesolaranlage</h2>
            <p>
              Für Balkonkraftwerke hat das Register eine eigene Art, die steckerfertige Solaranlage – rund 1,5 Mio. sind so
              registriert. Viele andere stehen als Gebäudesolaranlage im Register, und das zeigen Name und Größe:{' '}
              <strong>17.437 Gebäudesolaranlagen</strong> heißen „Balkonkraftwerk“, „Balkon“, „Mini-PV“ oder ähnlich und haben
              die Größe eines Balkonkraftwerks: bis 2 kWp Modulleistung und ein Wechselrichter bis 800 W. Nach der Größe allein sind
              es 51.941. Die meisten wurden 2022 und 2023 registriert (zusammen 32.423), seither deutlich weniger.
            </p>
            <p>
              Für die Auswertungen hier ändert das wenig: Gebäude-, sonstige und steckerfertige Anlagen zählen zusammen als
              „Gebäude“, und die Größenklasse „bis 2 kWp“ geht nach der Leistung, nicht nach der Art.
            </p>
          </section>

          <section id="tippfehler">
            <h2>Fläche und Module</h2>
            <p>Manche Angaben passen nicht zueinander. Bei den kleinen Freiflächen-Einheiten (bis 40 kWp):</p>
            <ul>
              <li>
                67 geben einen halben Hektar oder mehr an – vermutlich Quadratmeter im Feld für Hektar. Beispiel: 17,6 kWp mit 95
                Modulen auf „100 ha“; Leistung und Modulzahl passen zusammen, die Fläche nicht.
              </li>
              <li>104 kommen auf mehr als 800 Watt je Modul, 18 auf weniger als 50 Watt: Modulzahl oder Leistung stimmen nicht.</li>
            </ul>
            <p>Fläche und Modulzahl wertet diese Seite bisher nicht aus.</p>
          </section>

          <section id="speicherkapazitaet">
            <h2>Kapazität von Batteriespeichern</h2>
            <p>
              Bei Batteriespeichern werden gern Wattstunden und Kilowattstunden verwechselt: Ein Heimspeicher mit 14.000 kWh und
              3,5 kW bräuchte 4.000 Stunden, um voll zu werden. Die Auswertungen hier übernehmen deshalb die Prüfregeln von{' '}
              <a href="https://battery-charts.de/battery-charts/" target="_blank" rel="noopener noreferrer">
                battery-charts.de
              </a>{' '}
              (RWTH Aachen): Ein Speicher zählt nur mit mehr als 0,3 kWh und 0,3 kW, und er muss in 6 Minuten bis 12 Stunden voll
              sein.
            </p>
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
            <p>Von 2,81 Mio. Batteriespeichern in Betrieb bleiben 2,80 Mio. mit 33,7 GWh.</p>
            <p>
              battery-charts.de schließt außerdem Großspeicher von Privatpersonen aus: Dort sind oft kW und kWh zugleich um das
              Tausendfache zu hoch, und das Verhältnis bleibt plausibel. Diese Prüfung fehlt hier noch, weil die Art des Betreibers
              (Person oder Organisation) nicht eingelesen wird. Eine Schätzung: Von 672 Großspeichern stehen 8 neben einer
              Solaranlage mit höchstens 30 kWp, zusammen 50 MWh – etwa 2.250 kWh und 2.000 kW neben 2 kWp, vermutlich ein
              Heimspeicher mit 2,25 kWh.
            </p>
          </section>

          <section id="speicher-in-teilen">
            <h2>Batteriespeicher in Teilen</h2>
            <p>
              Bei Batterien trägt die Speicheranlage die Kapazität, und praktisch jede Batterie-Einheit hat ihre eigene. Große
              Speicher sind trotzdem manchmal in Teilen registriert: An 24 Netzanschlüssen mit mindestens 1 MW hängen 2 bis 14
              Speicheranlagen, zusammen 76 – etwa ein 25-MWh-Speicher in zehn Teilen zu je 2,5 MWh. Die Verteilung nach
              Speichergröße zählt sie bisher einzeln.
            </p>
            <p>
              Häufiger teilen sich Heimspeicher einen Anschluss: An rund 19.100 Anschlüssen hängen 2 bis 10 davon, an 5.500 mit
              verschiedenen Betreibern – etwa in Mehrparteienhäusern, deren Speicher nicht zusammengehören.
            </p>
          </section>

          <section id="pumpspeicher">
            <h2>Pumpspeicher</h2>
            <p>
              Pumpspeicherkraftwerke sind je Maschine registriert, manche als zwei Speicheranlagen, andere über mehrere Stationen
              verteilt. Die Auswertungen fassen Maschinen am selben Standort oder in derselben Speicheranlage zu einem Kraftwerk
              zusammen: 75 Maschinen ergeben 22 Kraftwerke in Deutschland, dazu 10 in Österreich und Luxemburg, die ebenfalls im
              Register stehen.
              Einige winzige Einträge bis 33 kW – eine Pergola, eine Wärmepumpe, ein Heimspeicher – sind als Pumpspeicher
              registriert; sie zählen nicht.
            </p>
          </section>
        </article>
      </div>
    </div>
  );
}
