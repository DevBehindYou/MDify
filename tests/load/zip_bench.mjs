// ZIP export benchmark: the same JSZip call the browser makes in
// frontend/lib/models/fileExport.js (downloadMarkdownZip), run in Node.
//
//   node tests/load/zip_bench.mjs [out.json]
//
// File sizes are drawn from the Markdown sizes measured in the e2e run
// (small docs ~1 KB, medium 10–600 KB, one large 1.7 MB spreadsheet output),
// deterministic seed.

import { createRequire } from 'node:module';
import { writeFileSync } from 'node:fs';
import { performance } from 'node:perf_hooks';

const require = createRequire(new URL('../../frontend/package.json', import.meta.url));
const JSZip = require('jszip');

const SIZES = [1_200, 2_500, 8_000, 40_000, 120_000, 250_000, 600_000, 1_700_000];
let seed = 42;
const rand = () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
const WORDS = 'markdown table heading chunk vector document report revenue section latency'.split(' ');

function markdown(bytes) {
  const parts = ['# Document\n\n'];
  let len = parts[0].length;
  while (len < bytes) {
    const line = Array.from({ length: 12 }, () => WORDS[Math.floor(rand() * WORDS.length)]).join(' ') + '.\n';
    parts.push(line);
    len += line.length;
  }
  return parts.join('');
}

async function run(count, compression) {
  const files = Array.from({ length: count }, (_, i) => {
    const r = rand();
    const size = r < 0.45 ? SIZES[Math.floor(rand() * 3)] : r < 0.97 ? SIZES[3 + Math.floor(rand() * 4)] : SIZES[7];
    return { name: `doc-${i}.md`, content: markdown(size) };
  });
  const sourceBytes = files.reduce((n, f) => n + Buffer.byteLength(f.content), 0);
  global.gc?.();
  const mem = () => { const m = process.memoryUsage(); return m.heapUsed + m.arrayBuffers; };
  const heapBefore = mem();
  let heapPeak = heapBefore;
  const sampler = setInterval(() => { heapPeak = Math.max(heapPeak, mem()); }, 5);
  const t0 = performance.now();
  const zip = new JSZip();
  files.forEach((f) => zip.file(f.name, f.content));
  const blob = await zip.generateAsync({ type: 'uint8array', compression });
  const ms = performance.now() - t0;
  clearInterval(sampler);
  heapPeak = Math.max(heapPeak, mem());
  return {
    compression,
    files: count,
    source_mb: +(sourceBytes / 1048576).toFixed(2),
    zip_mb: +(blob.byteLength / 1048576).toFixed(2),
    ms: Math.round(ms),
    js_memory_growth_mb: +((heapPeak - heapBefore) / 1048576).toFixed(1),
  };
}

const rows = [];
for (const compression of ['STORE', 'DEFLATE']) {
  seed = 42;
  for (const n of [5, 10, 25, 50, 100]) {
    const row = await run(n, compression);
    rows.push(row);
    console.log(JSON.stringify(row));
  }
}
if (process.argv[2]) writeFileSync(process.argv[2], JSON.stringify({ note: 'JSZip default is STORE; the app uses the default', rows }, null, 2));
