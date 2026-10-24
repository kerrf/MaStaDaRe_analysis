// What is new on the site, in plain language: the page Neuigkeiten (pages/NeuigkeitenPage.jsx) lists all of it, the
// newest first.
//   date   when it went online (ISO); title, text: for everyone, no technical words; to: where to see it (a link with
//          its settings)
// A new feature: an item at the top.

export const NEWS = [
  {
    id: 'teilen',
    date: '2026-10-24',
    title: 'Ansichten teilen',
    text: 'Jede Ansicht hat ihren eigenen Link – mit Gebiet, Technologie, Zeitraum und allen Einstellungen. Der Knopf „Teilen“ oben rechts kopiert ihn, auf dem Handy öffnet er das Teilen-Menü.',
    to: '/erzeuger',
  },
  {
    id: 'ueberblick-zubau',
    date: '2026-10-23',
    title: 'Überblick: der Zubau der letzten 12 Monate',
    text: 'Neben den Jahren zeigt der Überblick jetzt die letzten zwölf Monate, und wie viel mehr oder weniger es waren als in den zwölf davor.',
    to: '/erzeuger/ueberblick',
  },
  {
    id: 'balkonkraftwerke',
    date: '2026-10-23',
    title: 'Balkonkraftwerke auf der Karte',
    text: 'Steckerfertige Solaranlagen haben eine eigene Anlagenart: auf der Karte, in der Rangliste, je Einwohner. Viele sind nicht registriert – die Zahlen sind eine Untergrenze.',
    to: '/erzeuger?anlagenart=balkon&kennzahl=relative_population_power&ebene=landkreis',
  },
  {
    id: 'speicherklassen',
    date: '2026-10-23',
    title: 'Heim-, Gewerbe- und Großspeicher',
    text: 'Die Batteriespeicher auf der Karte lassen sich nach ihrer Größe zeigen: vom Speicher im Keller bis zum Großspeicher am Umspannwerk.',
    to: '/speicher?groesse=grossspeicher',
  },
  {
    id: 'netz-zubau',
    date: '2026-10-23',
    title: 'Neue Netzanschlüsse je Spannungsebene',
    text: 'Wie viele Netzanschlusspunkte jedes Jahr dazukommen, auf welcher Spannungsebene, und wie schnell sie registriert werden.',
    to: '/netz/zubau',
  },
  {
    id: 'karte-zeit',
    date: '2026-10-21',
    title: 'Die Karte in der Zeit',
    text: 'Die Karte zeigt nicht mehr nur heute: den Bestand am Ende jedes Jahres oder Monats seit 2000, den Zubau und die Stilllegungen darin, und was in Planung ist.',
    to: '/erzeuger?wert=zubau',
  },
  {
    id: 'technologien',
    date: '2026-10-20',
    title: 'Biomasse, Geothermie, KWK und sonstige Speicher',
    text: 'Das ganze Marktstammdatenregister: neben Solar, Wind und Wasserkraft jetzt auch Biomasse, Geothermie, Kraft-Wärme-Kopplung und Druckluft-, Schwungrad- und Wasserstoffspeicher.',
    to: '/erzeuger?technologie=biomasse',
  },
  {
    id: 'ueberblick',
    date: '2026-10-19',
    title: 'Der Überblick: ein Gebiet wie ein Bericht',
    text: 'Eine Technologie in Deutschland, einem Land oder einem Kreis auf einer Seite – Bestand, Zubau, Anteil, Rang, das Ausbauziel. Für ein Jahr oder einen Monat, auch als PDF.',
    to: '/erzeuger/ueberblick',
  },
];
