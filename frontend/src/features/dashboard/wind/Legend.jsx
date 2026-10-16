// The colours of a wind chart, each with its name
export default function Legend({ items, label }) {
  return (
    <ul className="wind-legend" aria-label={label}>
      {items.map((item) => (
        <li key={item.id}>
          <span className="wind-legend__dot" style={{ background: item.color }} />
          {item.label}
        </li>
      ))}
    </ul>
  );
}
