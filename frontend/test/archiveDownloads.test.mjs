import { test } from 'node:test';
import assert from 'node:assert/strict';
import { convertFile, fetchResultMarkdown, resetTransportForTests } from '../lib/models/conversionService.js';

const result = {
  filename: '資料.md', download_url: 'https://storage.test/1',
  outputs: [
    { name: '資料-part-002.md', url: 'https://storage.test/2' },
    { name: 'PROJECT_INDEX.md', url: 'https://storage.test/index' },
    { name: '資料-part-001.md', url: 'https://storage.test/1' },
    { name: 'manifest.json', url: 'https://storage.test/manifest' },
  ],
};
const first = '# 資料\n\n## `large.py`\n\n```python\nprint("漢';
const second = '# 資料 (part 2 of 2)\n\n字🙂")\n```\n';

test('archive download joins ordered parts without inserting text inside a code fence', async () => {
  const calls = [];
  const content = await fetchResultMarkdown(result, { sourceType: 'ARCHIVE', fetchImpl: async url => {
    calls.push(url);
    return new Response(url.endsWith('/1') ? first : second);
  } });
  assert.equal(content, first + '字🙂")\n```\n');
  assert.deepEqual(calls, ['https://storage.test/1', 'https://storage.test/2']);
});

test('ordinary results use the primary download unchanged', async () => {
  assert.equal(await fetchResultMarkdown(result, { sourceType: 'DOCUMENT', fetchImpl: async () => new Response('# Same\n') }), '# Same\n');
});

test('a failed part cannot become a successful partial result', async () => {
  await assert.rejects(fetchResultMarkdown(result, { sourceType: 'ARCHIVE', fetchImpl: async url =>
    new Response(url.endsWith('/1') ? first : 'expired', { status: url.endsWith('/1') ? 200 : 403 })
  }), err => err.name === 'ConversionError' && err.status === 403);
});

test('network failure during download is surfaced', async () => {
  await assert.rejects(fetchResultMarkdown(result, { fetchImpl: async () => { throw new TypeError('offline'); } }), err => err.network === true);
});

test('missing download links cannot become empty successful results', async () => {
  await assert.rejects(fetchResultMarkdown({}), err => err.status === 409);
});

test('aborting a download preserves AbortError', async () => {
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(fetchResultMarkdown(result, { signal: controller.signal, fetchImpl: async (_url, { signal }) => {
    signal.throwIfAborted();
  } }), err => err.name === 'AbortError');
});

test('missing or duplicate numbered parts are refused before fetching', async () => {
  for (const outputs of [[result.outputs[0]], [result.outputs[2]], [result.outputs[2], result.outputs[2]], [{ name: '資料-part-003.md', url: 'unused' }]]) {
    await assert.rejects(fetchResultMarkdown({ ...result, outputs }, { sourceType: 'ARCHIVE', fetchImpl: async () => assert.fail('should not fetch') }), err => err.status === 409);
  }
});

test('omitted trailing output links or incorrect continuation titles are detected', async () => {
  for (const continuation of ['# 資料 (part 2 of 3)\n\nbody', '# 資料 (part 3 of 2)\n\nbody', 'body']) {
    await assert.rejects(fetchResultMarkdown(result, { sourceType: 'ARCHIVE', fetchImpl: async url => new Response(url.endsWith('/1') ? first : continuation) }), err => err.status === 409);
  }
});

test('storage conversion returns the entire project instead of only its primary part', async t => {
  resetTransportForTests();
  t.after(resetTransportForTests);
  const calls = [];
  t.mock.method(globalThis, 'fetch', async (url, init = {}) => {
    calls.push(`${init.method || 'GET'} ${url}`);
    if (url === '/api/uploads/create') return Response.json({ job_id: 'synthetic', upload_url: 'https://storage.test/upload' }, { status: 201 });
    if (url === 'https://storage.test/upload') return Response.json({});
    if (url === '/api/jobs/synthetic/start') return Response.json({ status: 'COMPLETED', source_type: 'ARCHIVE', result });
    if (url === 'https://storage.test/1') return new Response(first);
    if (url === 'https://storage.test/2') return new Response(second);
    assert.fail(`unexpected request ${url}`);
  });
  const converted = await convertFile(new File(['synthetic zip'], '資料.zip'), 'Standard');
  assert.equal(converted.content, first + '字🙂")\n```\n');
  assert.equal(converted.job_id, 'synthetic');
  assert.deepEqual(calls.slice(-2), ['GET https://storage.test/1', 'GET https://storage.test/2']);
});
