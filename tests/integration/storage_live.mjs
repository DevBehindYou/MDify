// Live check of MDify's Supabase Storage paths against the real project.
//
//   node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON tests/integration/storage_live.mjs [rounds]
//
// Reads SUPABASE_* from frontend/.env.local. Every object goes under a fresh
// jobs/<uuid>/ prefix and is deleted at the end (also on failure). Prints
// statuses and timings only: never keys, signed URLs or file content.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createSupabase, supabaseConfig } from '../../frontend/lib/server/supabaseRest.js';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const ROUNDS = Number(process.argv[2] || 5);

function loadEnv(file) {
  const env = {};
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
    if (m) env[m[1]] = m[2].replace(/^(['"])(.*)\1$/, '$2');
  }
  return env;
}

const config = supabaseConfig(loadEnv(path.join(REPO, 'frontend', '.env.local')));
if (!config) {
  console.error('SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY missing in frontend/.env.local');
  process.exit(2);
}
const db = createSupabase(config);
const auth = { apikey: config.key, Authorization: `Bearer ${config.key}` };
const objectUrl = (p) => `${config.url}/storage/v1/object/${config.bucket}/${p}`;

const timings = {};
async function timed(name, fn) {
  const t = performance.now();
  try {
    return await fn();
  } finally {
    (timings[name] ||= []).push(performance.now() - t);
  }
}
function check(cond, what) {
  if (!cond) throw new Error(`FAILED: ${what}`);
}

const created = new Set();
const results = [];

async function round(i) {
  const job = crypto.randomUUID();
  const input = `jobs/${job}/input/source.txt`;
  const output = `jobs/${job}/output/result.md`;
  const node = `jobs/${job}/nodes/${crypto.randomUUID()}/result.md`;
  const body = `MDify live storage check ${i} ${'x'.repeat(2048)}`;

  // 1. Browser upload: signed upload URL + PUT with multipart form.
  const up = await timed('sign upload URL', () => db.signedUploadUrl(input));
  const form = new FormData();
  form.append('cacheControl', '3600');
  form.append('', new Blob([body], { type: 'text/plain' }), 'source.txt');
  const put = await timed('browser PUT (signed)', () => fetch(up.url, { method: 'PUT', body: form }));
  created.add(input);
  check(put.ok, `signed upload returned ${put.status}`);

  // 2. Backend read with the service key (what N1/O1/Z1 do).
  const got = await timed('backend GET', () => fetch(objectUrl(input), { headers: auth }));
  check(got.ok && (await got.text()) === body, `backend download ${got.status}`);

  // 3. Backend writes (result + an intermediate node object).
  for (const p of [output, node]) {
    const res = await timed('backend POST', () =>
      fetch(objectUrl(p), { method: 'POST', headers: { ...auth, 'Content-Type': 'text/markdown; charset=utf-8', 'x-upsert': 'true' }, body: `# out ${i}` })
    );
    created.add(p);
    check(res.ok, `backend upload ${res.status}`);
  }

  // 4. Signed download with a file name (what the user's browser fetches).
  const signed = await timed('sign download URL', () => db.signedDownloadUrl(output, 600, 'report.md'));
  const dl = await timed('browser GET (signed)', () => fetch(signed));
  check(dl.ok && (await dl.text()) === `# out ${i}`, `signed download ${dl.status}`);
  check(/report\.md/.test(dl.headers.get('content-disposition') || ''), 'download name header');

  // 5. Folder listing, as the cleanup function walks it: folders have id null.
  const list = await timed('list folder', () =>
    fetch(`${config.url}/storage/v1/object/list/${config.bucket}`, {
      method: 'POST',
      headers: { ...auth, 'Content-Type': 'application/json' },
      body: JSON.stringify({ prefix: `jobs/${job}`, limit: 1000, offset: 0 }),
    }).then((r) => r.json())
  );
  const names = list.map((e) => `${e.name}:${e.id === null ? 'folder' : 'file'}`).sort();
  check(JSON.stringify(names) === JSON.stringify(['input:folder', 'nodes:folder', 'output:folder']), `listing ${names}`);

  // 6. Delete everything under the job, then confirm it is gone.
  const del = await timed('delete objects', () =>
    fetch(`${config.url}/storage/v1/object/${config.bucket}`, {
      method: 'DELETE',
      headers: { ...auth, 'Content-Type': 'application/json' },
      body: JSON.stringify({ prefixes: [input, output, node] }),
    })
  );
  check(del.ok, `delete ${del.status}`);
  for (const p of [input, output, node]) created.delete(p);
  const gone = await fetch(objectUrl(input), { headers: auth });
  check(gone.status === 400 || gone.status === 404, `object still readable after delete (${gone.status})`);
  results.push('ok');
}

let failure = null;
try {
  for (let i = 1; i <= ROUNDS; i += 1) await round(i);
} catch (err) {
  failure = err.message;
} finally {
  if (created.size) {
    await fetch(`${config.url}/storage/v1/object/${config.bucket}`, {
      method: 'DELETE',
      headers: { ...auth, 'Content-Type': 'application/json' },
      body: JSON.stringify({ prefixes: [...created] }),
    }).catch(() => {});
  }
}

// Bucket settings and whether the tables exist yet (the SQL is pasted by hand).
const bucket = await fetch(`${config.url}/storage/v1/bucket/${config.bucket}`, { headers: auth }).then((r) => r.json());
const tables = {};
for (const t of ['jobs', 'work_items', 'content_nodes']) {
  const r = await fetch(`${config.url}/rest/v1/${t}?select=*&limit=0`, { headers: auth });
  tables[t] = r.ok ? 'present' : `missing (${r.status})`;
}

const median = (xs) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];
console.log(`rounds passed: ${results.length}/${ROUNDS}${failure ? ` — ${failure}` : ''}`);
for (const [name, xs] of Object.entries(timings)) {
  console.log(`${name.padEnd(22)} median ${median(xs).toFixed(0).padStart(5)} ms   max ${Math.max(...xs).toFixed(0).padStart(5)} ms   (n=${xs.length})`);
}
console.log(`bucket: public=${bucket.public} file_size_limit=${bucket.file_size_limit ?? 'none'}`);
console.log(`tables: ${JSON.stringify(tables)}`);
process.exit(failure ? 1 : 0);
