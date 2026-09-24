import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, Check, Cloud, Flame, Zap } from 'lucide-react';
import Badge from '../components/ui/Badge';
import ChartPlaceholder from '../components/ui/ChartPlaceholder';
import useDocumentTitle from '../lib/useDocumentTitle';
import NotFoundPage from './NotFoundPage';
import './pages.css';

const MAERKTE = {
  strom: {
    title: 'Strommarkt',
    icon: Zap,
    lead: 'Großhandelspreise und Erzeugungsmix – wie der Ausbau erneuerbarer Energien den Strompreis prägt.',
    planned: ['Day-Ahead-Preise (stündlich/viertelstündlich)', 'Negative Preise und ihre Häufigkeit', 'Erzeugungsmix nach Energieträger'],
  },
  gas: {
    title: 'Gasmarkt',
    icon: Flame,
    lead: 'Gaspreise und Speicherfüllstände als Rahmenbedingung für Stromerzeugung und Wärme.',
    planned: ['Großhandelspreise (TTF / THE)', 'Füllstände der deutschen Gasspeicher', 'Einordnung gegenüber dem Vorjahr'],
  },
  co2: {
    title: 'CO₂-Markt',
    icon: Cloud,
    lead: 'Der CO₂-Preis im europäischen Emissionshandel und seine Wirkung auf fossile Erzeugung.',
    planned: ['EUA-Preisentwicklung', 'Nationaler CO₂-Preis (BEHG)', 'CO₂-Intensität des Strommixes'],
  },
};

export default function MarktPage() {
  const { markt } = useParams();
  const page = MAERKTE[markt];
  useDocumentTitle(page?.title);
  if (!page) return <NotFoundPage />;
  const Icon = page.icon;

  return (
    <div className="page" data-topic="maerkte">
      <header className="page-header">
        <div className="container page-header__inner">
          <Link to="/" className="page-header__back">
            <ArrowLeft size={15} aria-hidden="true" /> Übersicht
          </Link>
          <div className="page-header__row">
            <span className="page-header__icon" aria-hidden="true">
              <Icon size={22} />
            </span>
            <div>
              <span className="eyebrow">Märkte</span>
              <h1 className="page-header__title">{page.title}</h1>
            </div>
            <Badge tone="soon">In Vorbereitung</Badge>
          </div>
          <p className="page-header__lead">{page.lead}</p>
        </div>
      </header>

      <div className="container page-body soon-grid">
        <section className="card">
          <header className="card__header">
            <h2 className="card__title">Geplante Inhalte</h2>
          </header>
          <ul className="card__body check-list">
            {page.planned.map((item) => (
              <li key={item}>
                <Check size={15} aria-hidden="true" /> {item}
              </li>
            ))}
          </ul>
        </section>
        <section className="card">
          <header className="card__header">
            <h2 className="card__title">Vorschau</h2>
          </header>
          <div className="card__body">
            <ChartPlaceholder variant="line" note="Die Zeitreihen werden gerade angebunden." height={260} />
          </div>
        </section>
      </div>
    </div>
  );
}
