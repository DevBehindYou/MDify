'use client';

import { useCallback, useSyncExternalStore } from 'react';

/**
 * Live `matchMedia` result. Returns null during server rendering and
 * hydration, when the viewport is still unknown.
 */
export function useMediaQuery(query) {
  const subscribe = useCallback(
    (onChange) => {
      const mql = window.matchMedia(query);
      mql.addEventListener('change', onChange);
      return () => mql.removeEventListener('change', onChange);
    },
    [query]
  );

  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(query).matches,
    () => null
  );
}
