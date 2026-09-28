'use client';

import { useEffect } from 'react';
import { WAKE_REPEAT_MS, wakeOnOpen } from '../lib/models/wakeModel';

/**
 * Mounted once in the root layout: every MDify page wakes the backends when
 * it opens, and again when the tab comes back after the backends could have
 * gone to sleep. Renders nothing.
 */
export default function WakeOnOpen() {
  useEffect(() => {
    wakeOnOpen();
    let hiddenAt = 0;
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') hiddenAt = Date.now();
      else if (hiddenAt && Date.now() - hiddenAt >= WAKE_REPEAT_MS) wakeOnOpen({ force: true });
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, []);
  return null;
}
