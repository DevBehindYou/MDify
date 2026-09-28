import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  attemptOrder,
  dispatchConversion,
  parseBackendUrls,
  stableHash,
  TIMEOUT_MS_BY_POOL,
} from '../lib/server/dispatcher.js';
import { poolForExtension } from '../lib/formats.js';

test('timeouts fit Render Free wake-ups and the 300 s route budget', () => {
  const ROUTE_BUDGET_MS = 300_000; // maxDuration in the conversion routes
  const RENDER_WAKE_MS = 60_000; // Render Free: about a minute after 15 idle minutes
  const OCR_BUDGET_MS = 85_000; // OCR_TIMEOUT_S in render.yaml
  assert.ok(TIMEOUT_MS_BY_POOL.ocr >= RENDER_WAKE_MS + OCR_BUDGET_MS);
  for (const ms of Object.values(TIMEOUT_MS_BY_POOL)) assert.ok(ms < ROUTE_BUDGET_MS);
});

const N = ['https://n1.example', 'https://n2.example'];
const file = new File(['hello'], 'a.txt', { type: 'text/plain' });

function json(status, body) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

function run(fetchImpl, jobId = 'job-1') {
  return dispatchConversion({ pool: 'normal', urls: N, jobId, file, profile: 'Standard', secret: 's', fetchImpl });
}

test('documents route to the normal pool, images to OCR', () => {
  assert.equal(poolForExtension('pdf'), 'normal');
  assert.equal(poolForExtension('docx'), 'normal');
  assert.equal(poolForExtension('png'), 'ocr');
  assert.equal(poolForExtension('tiff'), 'ocr');
  assert.equal(poolForExtension('exe'), null);
});

test('parseBackendUrls trims entries and trailing slashes', () => {
  assert.deepEqual(parseBackendUrls(' https://a.dev/ , ,https://b.dev'), ['https://a.dev', 'https://b.dev']);
  assert.deepEqual(parseBackendUrls(undefined), []);
});

test('instance choice is stable per job and spreads across the pool', () => {
  assert.equal(stableHash('job-123'), stableHash('job-123'));
  assert.deepEqual(attemptOrder('job-123', N), attemptOrder('job-123', N));
  const primaries = new Set(Array.from({ length: 50 }, (_, i) => attemptOrder(`job-${i}`, N)[0]));
  assert.equal(primaries.size, 2);
  const [first, second] = attemptOrder('job-9', N);
  assert.notEqual(first, second);
  assert.deepEqual(attemptOrder('x', [N[0]]), [N[0]]);
  assert.deepEqual(attemptOrder('x', []), []);
});

test('success on the primary makes exactly one call with the shared secret', async () => {
  const calls = [];
  const res = await run(async (url, init) => {
    calls.push({ url, secret: init.headers['X-Internal-Secret'], jobId: init.body.get('job_id') });
    return json(200, { content: '# ok' });
  });
  assert.equal(res.status, 200);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].secret, 's');
  assert.equal(calls[0].jobId, 'job-1');
  assert.ok(calls[0].url.endsWith('/api/v1/internal/convert'));
});

test('unreachable primary fails over once to the peer', async () => {
  const urls = [];
  const res = await run(async (url) => {
    urls.push(url);
    if (urls.length === 1) throw new TypeError('fetch failed');
    return json(200, { content: '# from peer' });
  });
  assert.equal(res.status, 200);
  assert.equal(urls.length, 2);
  assert.notEqual(new URL(urls[0]).host, new URL(urls[1]).host);
});

test('503 from the primary fails over; both down yields one 502', async () => {
  let count = 0;
  const res = await run(async () => {
    count += 1;
    return json(503, { detail: 'down' });
  });
  assert.equal(count, 2);
  assert.equal(res.status, 502);
});

for (const status of [400, 401, 413, 422]) {
  test(`HTTP ${status} is returned as-is and never retried`, async () => {
    let count = 0;
    const res = await run(async () => {
      count += 1;
      return json(status, { detail: 'nope' });
    });
    assert.equal(count, 1);
    assert.equal(res.status, status);
    assert.equal(res.body.detail, 'nope');
  });
}

test('a timeout is not retried on the peer', async () => {
  let count = 0;
  const res = await run(async () => {
    count += 1;
    throw new DOMException('timed out', 'TimeoutError');
  });
  assert.equal(count, 1);
  assert.equal(res.status, 504);
});

test('an empty pool answers 503 without calling anything', async () => {
  const res = await dispatchConversion({
    pool: 'ocr',
    urls: [],
    jobId: 'j',
    file,
    profile: 'Standard',
    secret: 's',
    fetchImpl: () => assert.fail('must not fetch'),
  });
  assert.equal(res.status, 503);
});
