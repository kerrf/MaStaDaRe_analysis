import { useEffect } from 'react';

// The page's robots meta tag while it is shown ("noindex", "index, nofollow"); without one, search engines index the
// page and follow its links. A pre-rendered page (scripts/prerender.mjs) may bring the tag already: it is taken over.
export default function useRobots(content) {
  useEffect(() => {
    let meta = document.querySelector('meta[name="robots"]');
    if (!meta) {
      meta = document.createElement('meta');
      meta.name = 'robots';
      document.head.appendChild(meta);
    }
    meta.content = content;
    return () => meta.remove();
  }, [content]);
}
