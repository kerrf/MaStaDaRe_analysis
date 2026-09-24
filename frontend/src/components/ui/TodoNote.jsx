// Visible only in local development (npm run dev) – never rendered in the production build.
export default function TodoNote({ children }) {
  if (!import.meta.env.DEV) return null;
  return (
    <aside className="todo-note">
      <span className="todo-note__tag">TODO</span>
      <div>{children}</div>
    </aside>
  );
}
