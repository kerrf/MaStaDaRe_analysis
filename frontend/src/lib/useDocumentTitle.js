import { useEffect } from 'react';
import { documentTitle } from '../config/seo';

// The page's title (null: the start page's), with the site's name – as the pre-rendered HTML has it (config/seo.js)
export default function useDocumentTitle(title) {
  useEffect(() => {
    document.title = documentTitle(title);
  }, [title]);
}
