// Cleanup logic is independent of the Edge runtime so failure paths can be tested.
const PAGE = 1000;
const CHUNK = 100;
const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const checked = async (request, stage) => {
  const result = await request;
  if (result?.error) throw new Error(stage);
  return result?.data;
};
const equalSecret = (given, expected) => {
  if (!expected || given.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < given.length; i++) diff |= given.charCodeAt(i) ^ expected.charCodeAt(i);
  return diff === 0;
};
const safePath = (path, prefix) => typeof path === 'string' && path.startsWith(`${prefix}/`)
  && path.slice(prefix.length + 1).split('/').every(s => s && s !== '.' && s !== '..' && !s.includes('\\'));

export async function deleteClaimedFiles({ job, files, list, remove, guard }) {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(job.job_id) || !job.cleanup_token) throw new Error('invalid claim');
  const prefix = `jobs/${job.job_id}`;
  const paths = new Set();
  for (const f of files) {
    if (!safePath(f.object_path, prefix)) throw new Error('invalid registered path');
    paths.add(f.object_path);
  }
  const renew = async () => { if (!await guard()) throw new Error('cleanup lease lost'); };
  async function walk(folder, depth = 0) {
    if (depth > 8) throw new Error('cleanup tree exceeds depth limit');
    for (let offset = 0; ; offset += PAGE) {
      await renew();
      const entries = await list(folder, { limit: PAGE, offset, sortBy: { column: 'name', order: 'asc' } });
      if (!Array.isArray(entries)) throw new Error('invalid Storage listing');
      for (const entry of entries) {
        if (typeof entry.name !== 'string' || entry.name.includes('/')) throw new Error('invalid Storage name');
        const path = `${folder}/${entry.name}`;
        if (!safePath(path, prefix)) throw new Error('invalid Storage path');
        if (entry.id === null) await walk(path, depth + 1);
        else if (entry.id) paths.add(path);
        else throw new Error('invalid Storage entry');
        if (paths.size > 50000) throw new Error('cleanup tree exceeds object limit');
      }
      if (entries.length < PAGE) return;
      if (offset >= 50000) throw new Error('cleanup listing exceeds page limit');
    }
  }
  await walk(prefix);
  const found = [...paths];
  for (let i = 0; i < found.length; i += CHUNK) {
    await renew();
    await remove(found.slice(i, i + CHUNK));
  }
  await renew();
  const remaining = await list(prefix, { limit: 1, offset: 0, sortBy: { column: 'name', order: 'asc' } });
  if (!Array.isArray(remaining) || remaining.length) throw new Error('Storage objects remain after removal');
  await renew();
  return found.length;
}

export function createCleanupHandler({ env, createClient }) {
  return async req => {
    if (!equalSecret(req.headers.get('x-mdify-cron-secret') ?? '', env('MDIFY_CRON_SECRET') ?? '')) return json({ error: 'unauthorized' }, 401);
    let key = env('SUPABASE_SERVICE_ROLE_KEY');
    if (!key) { try { key = JSON.parse(env('SUPABASE_SECRET_KEYS') ?? '{}').default; } catch { /* missing key below */ } }
    if (!key) return json({ error: 'missing service key' }, 500);
    const bucket = env('SUPABASE_STORAGE_BUCKET') || 'mdify-pro-files';
    const configured = Number(env('CLEANUP_BATCH_SIZE') ?? 100);
    const batch = Number.isFinite(configured) ? Math.max(1, Math.min(500, Math.floor(configured))) : 100;
    const started = Date.now();
    let db;
    let stage = 'client';
    try {
      db = createClient(env('SUPABASE_URL') ?? '', key);
      stage = 'cancel';
      await checked(db.rpc('settle_cancelled_jobs'), stage);
      stage = 'sweep';
      const swept = await checked(db.rpc('sweep_stale_jobs'), stage);
      stage = 'claim';
      const jobs = await checked(db.rpc('claim_cleanup_batch', { batch_size: batch }), stage);
      let deleted = 0, failed = 0, bytes = 0;
      stage = 'cleanup';
      for (const job of jobs ?? []) {
        const args = { p_job_id: job.job_id, p_token: job.cleanup_token };
        try {
          const files = await checked(db.from('file_objects').select('object_path,size_bytes').eq('job_id', job.job_id).neq('storage_status', 'DELETED'), 'files');
          await deleteClaimedFiles({ job, files: files ?? [],
            guard: () => checked(db.rpc('begin_job_cleanup', args), 'begin'),
            list: (prefix, options) => checked(db.storage.from(bucket).list(prefix, options), 'list'),
            remove: paths => checked(db.storage.from(bucket).remove(paths), 'remove'),
          });
          if (!await checked(db.rpc('finish_job_cleanup', args), 'finish')) throw new Error('cleanup lease lost');
          deleted++;
          bytes += (files ?? []).reduce((n, f) => n + Math.max(0, Number(f.size_bytes) || 0), 0);
        } catch {
          failed++;
          // A stale owner must never overwrite the replacement owner's state.
          await checked(db.rpc('fail_job_cleanup', args), 'failure recording');
        }
      }
      const summary = { swept: swept?.length ?? 0, claimed: jobs?.length ?? 0, deleted, failed, bytes_deleted: bytes, duration_ms: Date.now() - started };
      stage = 'audit';
      await checked(db.from('audit_logs').insert({ actor_type: 'SYSTEM', actor_id: 'cleanup-expired-jobs', action: failed ? 'CLEANUP_FAILURE' : 'CLEANUP_RUN', details: summary }), stage);
      return json(summary, failed ? 500 : 200);
    } catch {
      if (db && stage !== 'audit') {
        try { await checked(db.from('audit_logs').insert({ actor_type: 'SYSTEM', actor_id: 'cleanup-expired-jobs', action: 'CLEANUP_FAILURE', details: { stage } }), 'audit'); } catch { /* return failure even if audit is unavailable */ }
      }
      return json({ error: 'cleanup failed', stage }, 500);
    }
  };
}
