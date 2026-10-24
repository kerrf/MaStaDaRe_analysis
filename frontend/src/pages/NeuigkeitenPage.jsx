import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import Badge from '../components/ui/Badge';
import { NEWS, isNew } from '../config/news';
import useDocumentTitle from '../lib/useDocumentTitle';
import './pages.css';

const MONTH = new Intl.DateTimeFormat('de-DE', { month: 'long', year: 'numeric' });
const DAY = new Intl.DateTimeFormat('de-DE', { day: 'numeric', month: 'long' });
const dateOf = (iso) => new Date(`${iso}T00:00:00`);

/** What is new on the site, in plain language, the newest first, by month (config/news.js). */
export default function NeuigkeitenPage() {
  useDocumentTitle('Neuigkeiten');
  const months = [];
  for (const item of NEWS) {
    const month = MONTH.format(dateOf(item.date));
    if (months.at(-1)?.month !== month) months.push({ month, items: [] });
    months.at(-1).items.push(item);
  }
  return (
    <div className="page">
      <header className="page-header">
        <div className="container page-header__inner">
          <h1 className="page-header__title">Neuigkeiten</h1>
          <p className="page-header__lead">Was neu ist auf der Seite – kurz erklärt, mit einem Link zum Ausprobieren.</p>
        </div>
      </header>

      <div className="container page-body">
        <div className="news">
          {months.map(({ month, items }) => (
            <section key={month} className="news__month">
              <h2 className="news__month-title">{month}</h2>
              <ol className="news__list">
                {items.map((item) => (
                  <li key={item.id} id={item.id} className="card news__item">
                    <div className="news__meta">
                      <time dateTime={item.date}>{DAY.format(dateOf(item.date))}</time>
                      {isNew(item) && (
                        <Badge tone="new" size="xs">
                          Neu
                        </Badge>
                      )}
                    </div>
                    <h3 className="news__title">{item.title}</h3>
                    <p className="news__text">{item.text}</p>
                    <Link to={item.to} className="news__link">
                      Ansehen <ArrowRight size={14} aria-hidden="true" />
                    </Link>
                  </li>
                ))}
              </ol>
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}
