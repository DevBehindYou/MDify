'use client';

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { checkHealth } from '../lib/models/conversionService';
import { getServerSnapshot, getSnapshot, subscribe } from '../lib/models/wakeModel';

/**
 * Tracks whether the converter API is reachable, and whether the backends
 * are still waking up (the root layout starts that on every page open).
 *
 * Checks once on mount, then only on real signals — the browser going
 * online/offline, the tab becoming visible while offline, a conversion
 * failing to connect, or the user pressing Retry. The previous fixed
 * 8-second poll spent a request per open tab every 8 seconds to learn
 * nothing new.
 *
 * @returns {{ serverStatus: 'online'|'checking'|'waking'|'offline', wakeCountdown: number|null, recheck: () => Promise<void> }}
 */
export function useServerStatusViewModel() {
  const [apiStatus, setApiStatus] = useState('online');
  const statusRef = useRef(apiStatus);
  statusRef.current = apiStatus;
  const wake = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  const recheck = useCallback(async () => {
    if (statusRef.current === 'offline') setApiStatus('checking');
    const ok = await checkHealth();
    setApiStatus(ok ? 'online' : 'offline');
  }, []);

  useEffect(() => {
    recheck();

    const handleOffline = () => setApiStatus('offline');
    const handleVisible = () => {
      if (document.visibilityState === 'visible' && statusRef.current === 'offline') recheck();
    };

    window.addEventListener('online', recheck);
    window.addEventListener('offline', handleOffline);
    document.addEventListener('visibilitychange', handleVisible);
    return () => {
      window.removeEventListener('online', recheck);
      window.removeEventListener('offline', handleOffline);
      document.removeEventListener('visibilitychange', handleVisible);
    };
  }, [recheck]);

  const waking = apiStatus === 'online' && wake.phase === 'waking';
  return {
    serverStatus: waking ? 'waking' : apiStatus,
    wakeCountdown: waking ? wake.countdown : null,
    recheck,
  };
}
