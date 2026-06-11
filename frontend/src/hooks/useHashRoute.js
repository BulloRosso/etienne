// useHashRoute — tracks window.location.hash (sans '#') and re-emits the
// scrapbook open-event. (Phase 7 of the App.jsx decomposition.)

import { useState, useEffect } from 'react';

export default function useHashRoute() {
  const [hashRoute, setHashRoute] = useState(window.location.hash.slice(1) || '');

  useEffect(() => {
    const handleHashChange = () => {
      const hash = window.location.hash.slice(1) || '';
      setHashRoute(hash);
      if (hash === 'scrapbook') {
        window.dispatchEvent(new CustomEvent('openScrapbook'));
      }
    };

    // Check on mount
    handleHashChange();

    // Listen for hash changes
    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  return hashRoute;
}
