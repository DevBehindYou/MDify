import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { resetWakeCacheForTests, wakeBackends } from '../lib/server/wake.js';
import {
  getSnapshot,
  resetWakeForTests,
  subscribe,
  wakeOnOpen,
  WAKE_MAX_MS,
  WAKE_REPEAT_MS,
} from '../lib/models/wakeModel.js';

const POOLS = {
  normal: ['http://n1', 'http://n2'],
  ocr: ['http://o1', 'http://o2'],
  archive: ['http://z1'],
};

beforeEach(() => {
  resetWakeCacheForTests();
  resetWakeForTests();
});

// ── server: /api/wake ───────────────────────────────────────────────────────

test('wakeBackends pings every instance and reports counts, never URLs', async () => {
  const hit = [];
  const fetchImpl = async (url) => {
    hit.push(url);
    if (url.startsWith('http://o2')) throw new TypeError('fetch failed'); // asleep
    return new Response('{}', { status: 200 });
  };
  const res = await wakeBackends({ pools: POOLS, fetchImpl, now: 1 });
  assert.deepEqual(hit.sort(), ['http://n1', 'http://n2', 'http://o1', 'http://o2', 'http://z1'].map((u) => `${u}/api/v1/health`));
  assert.deepEqual(res.pools, { normal: { ready: 2, total: 2 }, ocr: { ready: 1, total: 2 }, archive: { ready: 1, total: 1 } });
  assert.equal(res.all_ready, false);
  assert.doesNotMatch(JSON.stringify(res), /http/);
});

test('wakeBackends caches briefly so page loads cannot hammer the pools', async () => {
  let calls = 0;
  const fetchImpl = async () => {
    calls += 1;
    return new Response('{}', { status: 200 });
  };
  await wakeBackends({ pools: POOLS, fetchImpl, now: 1000 });
  const second = await wakeBackends({ pools: POOLS, fetchImpl, now: 5000 });
  assert.equal(calls, 5);
  assert.equal(second.cached, true);
  await wakeBackends({ pools: POOLS, fetchImpl, now: 20_000 });
  assert.equal(calls, 10);
});

test('wakeBackends skips pools with no instances configured', async () => {
  const res = await wakeBackends({ pools: { normal: ['http://n1'], ocr: [], archive: [] }, fetchImpl: async () => new Response('{}'), now: 1 });
  assert.deepEqual(Object.keys(res.pools), ['normal']);
  assert.equal(res.all_ready, true);
});

// ── browser: wake model ─────────────────────────────────────────────────────

function fakeStorage() {
  const map = new Map();
  return { getItem: (k) => map.get(k) ?? null, setItem: (k, v) => map.set(k, String(v)) };
}

test('wakeOnOpen shows waking with a countdown until every pool is ready', async () => {
  let t = 0;
  const answers = [
    { all_ready: false, pools: { ocr: { ready: 0, total: 2 } } },
    { all_ready: false, pools: { ocr: { ready: 1, total: 2 } } },
    { all_ready: true, pools: { ocr: { ready: 2, total: 2 } } },
  ];
  const seen = [];
  subscribe(() => seen.push({ ...getSnapshot() }));
  const final = await wakeOnOpen({
    request: async () => answers.shift(),
    storage: fakeStorage(),
    clock: () => t,
    sleep: async (ms) => {
      t += ms;
    },
  });
  assert.equal(final.phase, 'ready');
  assert.equal(final.countdown, null);
  const counts = seen.filter((s) => s.phase === 'waking').map((s) => s.countdown);
  assert.equal(counts[0], 60);
  assert.ok(counts.every((c, i) => i === 0 || c <= counts[i - 1]), 'countdown never goes up');
  assert.ok(counts.at(-1) >= 1);
});

test('wakeOnOpen does nothing again within the repeat window, unless forced', async () => {
  const storage = fakeStorage();
  let requests = 0;
  const request = async () => {
    requests += 1;
    return { all_ready: true, pools: {} };
  };
  await wakeOnOpen({ request, storage, clock: () => 0 });
  await wakeOnOpen({ request, storage, clock: () => WAKE_REPEAT_MS - 1 });
  assert.equal(requests, 1);
  await wakeOnOpen({ request, storage, clock: () => WAKE_REPEAT_MS - 1, force: true });
  assert.equal(requests, 2);
});

test('wakeOnOpen gives up after WAKE_MAX_MS and stops showing waking', async () => {
  let t = 0;
  const final = await wakeOnOpen({
    request: async () => ({ all_ready: false, pools: {} }),
    storage: fakeStorage(),
    clock: () => t,
    sleep: async (ms) => {
      t += ms;
    },
  });
  assert.ok(t >= WAKE_MAX_MS);
  assert.equal(final.phase, 'idle');
});

test('wakeOnOpen with an unreachable API ends quietly', async () => {
  const final = await wakeOnOpen({ request: async () => null, storage: fakeStorage(), clock: () => 0 });
  assert.equal(final.phase, 'idle');
});
