// Wakes the backends when someone opens MDify, and exposes the progress as
// a tiny external store (read with useSyncExternalStore).
//
// Render Free instances sleep after 15 idle minutes and take about a minute
// to start. The first wake request starts them; the model then re-checks
// until every pool answers or the wait is clearly over. It never blocks
// conversions: the dispatcher's per-attempt timeouts already cover a wake-up.

import { requestWake } from './conversionService.js';

export const WAKE_EXPECTED_S = 60; // Render Free, per its docs
export const WAKE_POLL_MS = 12_000;
export const WAKE_MAX_MS = 100_000;
export const WAKE_REPEAT_MS = 10 * 60_000; // backends sleep after 15 idle minutes
const STORAGE_KEY = 'mdify-wake-at';

const IDLE = Object.freeze({ phase: 'idle', countdown: null, pools: null });
let state = IDLE;
let running = null;
const listeners = new Set();

function set(next) {
  state = { ...state, ...next };
  listeners.forEach((listener) => listener());
}

export function subscribe(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export const getSnapshot = () => state;
export const getServerSnapshot = () => IDLE;

/** Time of this tab's last wake, or null if it never woke the backends. */
function lastWakeAt(storage) {
  try {
    const raw = storage?.getItem(STORAGE_KEY);
    return raw == null || raw === '' || Number.isNaN(Number(raw)) ? null : Number(raw);
  } catch {
    return null;
  }
}

function rememberWake(storage, at) {
  try {
    storage?.setItem(STORAGE_KEY, String(at));
  } catch {
    // Storage blocked: the page wakes again next time, which is harmless.
  }
}

const defaultSleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Wakes every pool unless this tab did so in the last WAKE_REPEAT_MS.
 * Concurrent calls share one run. Resolves with the final state.
 */
export function wakeOnOpen({
  force = false,
  request = requestWake,
  storage = typeof sessionStorage === 'undefined' ? null : sessionStorage,
  clock = Date.now,
  sleep = defaultSleep,
} = {}) {
  if (running) return running;
  const started = clock();
  const last = lastWakeAt(storage);
  if (!force && last !== null && started - last < WAKE_REPEAT_MS) return Promise.resolve(state);
  rememberWake(storage, started);

  running = (async () => {
    let result = await request();
    const remaining = () => Math.max(1, WAKE_EXPECTED_S - Math.floor((clock() - started) / 1000));
    while (result && !result.all_ready && clock() - started < WAKE_MAX_MS) {
      set({ phase: 'waking', countdown: remaining(), pools: result.pools });
      for (let waited = 0; waited < WAKE_POLL_MS; waited += 1000) {
        await sleep(1000);
        set({ countdown: remaining() });
      }
      result = await request();
    }
    // Ready, unreachable (the health check reports that separately) or gave up:
    // stop showing "Waking" either way. Conversions still wait long enough.
    set({ phase: result?.all_ready ? 'ready' : 'idle', countdown: null, pools: result?.pools ?? null });
    return state;
  })().finally(() => {
    running = null;
  });
  return running;
}

/** Test hook. */
export function resetWakeForTests() {
  state = IDLE;
  running = null;
  listeners.clear();
}
