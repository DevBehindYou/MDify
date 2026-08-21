'use client';

// ViewModel for backend availability + cold-start UX. Owns the honest state
// machine the strategy docs ask for: checking → starting (with countdown) →
// online / offline. Components read `status` and `countdown`; they don't poll.

import { useCallback, useEffect, useRef, useState } from 'react';

import { checkHealth, wakeBackend } from '@/lib/api/client';
import type { ServerStatus } from '@/types';

const WAKE_SECONDS = 90; // covers Render free-tier worst-case cold start
const POLL_MS = 5_000;

export interface ServerHealthVM {
  status: ServerStatus;
  countdown: number | null; // seconds remaining while waking, else null
  retry: () => void;
}

export function useServerHealth(): ServerHealthVM {
  const [status, setStatus] = useState<ServerStatus>('checking');
  const [countdown, setCountdown] = useState<number | null>(null);

  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const startCountdown = useCallback(() => {
    if (countdownRef.current) return;
    setCountdown(WAKE_SECONDS);
    countdownRef.current = setInterval(() => {
      setCountdown((n) => {
        if (n === null) return null;
        if (n <= 1) {
          if (countdownRef.current) clearInterval(countdownRef.current);
          countdownRef.current = null;
          return 0;
        }
        return n - 1;
      });
    }, 1_000);
  }, []);

  const stopCountdown = useCallback(() => {
    if (countdownRef.current) clearInterval(countdownRef.current);
    countdownRef.current = null;
    setCountdown(null);
  }, []);

  const probe = useCallback(async () => {
    const ok = await checkHealth();
    if (ok) {
      setStatus('online');
      stopCountdown();
    } else {
      setStatus('starting');
      startCountdown();
    }
  }, [startCountdown, stopCountdown]);

  const retry = useCallback(() => {
    setStatus('checking');
    stopCountdown();
    startCountdown();
    wakeBackend();
    void probe();
  }, [probe, startCountdown, stopCountdown]);

  useEffect(() => {
    wakeBackend(); // trigger cold start immediately
    void probe();
    pollRef.current = setInterval(() => void probe(), POLL_MS);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
      if (countdownRef.current) clearInterval(countdownRef.current);
    };
  }, [probe]);

  return { status, countdown, retry };
}
