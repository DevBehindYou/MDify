// Server-only: wakes every backend instance when someone opens MDify.
//
// O1/O2 run on Render Free, which sleeps after 15 idle minutes and needs
// about a minute to start again. Any request starts the wake-up, so a short
// health ping per instance is enough; the ping does not wait for the full
// start. The result is cached briefly so page loads can't hammer the pools.

import { getPoolConfig } from './dispatcher.js';

export const WAKE_PING_TIMEOUT_MS = 8_000;
export const WAKE_CACHE_MS = 10_000;

let cache = null; // { at, result }

async function ping(url, fetchImpl, timeoutMs) {
  try {
    const res = await fetchImpl(`${url}/api/v1/health`, {
      cache: 'no-store',
      signal: AbortSignal.timeout(timeoutMs),
    });
    return res.ok;
  } catch {
    return false; // asleep, starting or down: the request still triggers a wake-up
  }
}

/**
 * Pings every configured instance in parallel.
 * Returns { pools: { normal: { ready, total }, ocr: {...}, archive: {...} }, all_ready, cached }
 * with counts only: backend URLs never leave the server.
 */
export async function wakeBackends({
  pools = getPoolConfig(),
  fetchImpl = fetch,
  timeoutMs = WAKE_PING_TIMEOUT_MS,
  now = Date.now(),
} = {}) {
  if (cache && now - cache.at < WAKE_CACHE_MS) return { ...cache.result, cached: true };

  const entries = Object.entries(pools).filter(([, urls]) => urls.length > 0);
  const results = await Promise.all(
    entries.map(async ([name, urls]) => {
      const oks = await Promise.all(urls.map((url) => ping(url, fetchImpl, timeoutMs)));
      return [name, { ready: oks.filter(Boolean).length, total: urls.length }];
    })
  );
  const summary = Object.fromEntries(results);
  const result = {
    pools: summary,
    all_ready: results.every(([, p]) => p.ready === p.total),
  };
  cache = { at: now, result };
  return { ...result, cached: false };
}

/** Test hook. */
export function resetWakeCacheForTests() {
  cache = null;
}
