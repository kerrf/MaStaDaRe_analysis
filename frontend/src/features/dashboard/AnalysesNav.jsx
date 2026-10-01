// The analyses of a page as links at its top, each jumping to its panel. links: [{ id (the panel's anchor), title, icon }]
export default function AnalysesNav({ links }) {
  if (links.length < 2) return null;
  const jumpTo = (id) => (event) => {
    event.preventDefault();
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    document.getElementById(id)?.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'start' });
  };
  return (
    <nav className="analyses-nav" aria-label="Zu einer Analyse springen">
      {links.map(({ id, title, icon: Icon }) => (
        <a key={id} href={`#${id}`} className="analyses-nav__item" onClick={jumpTo(id)}>
          <Icon size={15} aria-hidden="true" />
          {title}
        </a>
      ))}
    </nav>
  );
}
