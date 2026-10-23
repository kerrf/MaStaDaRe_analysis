import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { QUESTIONS } from '../../config/questions';
import { findBundeslandByAgs } from '../../config/regions';
import { API_BASE_URL } from '../../config/site';
import { useJson } from '../../lib/data';

// The names of the Kreise by their key (frontend/public/kreise.json, written by scripts/geo/build_boundaries.py): small,
// where a Kreis map would be 800 KB
const KREISE_URL = '/kreise.json';

function useNamer() {
  const kreise = useJson(KREISE_URL);
  return (key) => {
    if (key === 'offshore') return 'Offshore';
    if (String(key).length === 2) return findBundeslandByAgs(key)?.name ?? key;
    return kreise.data?.[key] ?? key;
  };
}

// One question: what it is about, the question, the answer in a sentence (live), the way to the view that answers it.
// The whole card is the link.
function QuestionCard({ item, name }) {
  const Icon = item.icon;
  const data = useJson(`${API_BASE_URL}${item.answer.path}`);
  const answer = data.status === 'ready' && Array.isArray(data.data) && data.data.length ? item.answer.text(data.data, name) : null;
  return (
    <Link to={item.to} className="question-card" data-topic={item.topic}>
      <span className="question-card__label">
        <Icon size={14} aria-hidden="true" />
        {item.label}
      </span>
      <h3 className="question-card__question">{item.question}</h3>
      <p className={`question-card__answer${answer ? '' : ' is-pending'}`} aria-live="polite">
        {answer ?? (data.status === 'loading' ? <span className="skeleton question-card__skeleton" /> : 'Die Antwort steht in der Ansicht.')}
      </p>
      <span className="question-card__cta">
        {item.cta} <ArrowRight size={14} aria-hidden="true" />
      </span>
    </Link>
  );
}

/**
 * Questions the data answers, on the home page: each a card with the answer in one sentence, computed live, leading to
 * the view that shows it (config/questions.js). What the platform can do, by example.
 */
export default function QuestionGallery() {
  const name = useNamer();
  return (
    <div className="questions">
      {QUESTIONS.map((item) => (
        <QuestionCard key={item.id} item={item} name={name} />
      ))}
    </div>
  );
}
