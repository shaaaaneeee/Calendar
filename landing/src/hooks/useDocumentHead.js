import { useEffect } from 'react';

function setMeta(name, content) {
  let el = document.querySelector(`meta[name="${name}"]`);
  if (!content) {
    el?.remove();
    return;
  }
  if (!el) {
    el = document.createElement('meta');
    el.setAttribute('name', name);
    document.head.appendChild(el);
  }
  el.setAttribute('content', content);
}

// Each route used to be its own HTML file with its own <title> and
// <meta description>; now that they're all served from one index.html,
// each page has to set those itself on mount so tab titles and SEO
// metadata don't go stale after client-side navigation.
export function useDocumentHead({ title, description, noindex = false }) {
  useEffect(() => {
    if (title) document.title = title;
    if (description) setMeta('description', description);
    setMeta('robots', noindex ? 'noindex' : null);
  }, [title, description, noindex]);
}
