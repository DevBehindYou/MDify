// Server-only: runs the durable work queue (supabase migration
// 20260927000000_mdify_work_queue.sql).
//
// A tick claims queued work items per pool within in-flight limits, sends each
// to its backend pool with object references only, records the outcome, and
// adds any child items a task discovered (scanned PDF pages, images inside an
// archive). Merge items wait BLOCKED in the database until the other items of
// their job are done. Ticks are driven by the user's browser while it waits
// (/api/jobs/:id/advance) and by a cron sweep for abandoned jobs
// (/api/jobs/tick); both run the same code.

import { getPoolConfig, sendToPool } from './dispatcher.js';

export const TASK_ENDPOINTS = {
  CONVERT: '/api/v1/internal/process',
  OCR_IMAGE: '/api/v1/internal/process',
  PDF_PAGE_OCR: '/api/v1/internal/process',
  PDF_ANALYZE: '/api/v1/internal/pdf/analyze',
  PDF_MERGE: '/api/v1/internal/pdf/merge',
  ARCHIVE_PROCESS: '/api/v1/internal/archive/process',
  PROJECT_MERGE: '/api/v1/internal/archive/merge',
};

export const POOLS = ['normal', 'ocr', 'archive'];

// Per-pool in-flight limits. O1/O2 each OCR one image at a time, so the OCR
// pool gets one slot per instance. Tune with MAX_INFLIGHT_* after measuring
// on the real hosts.
export function poolCapacity(env = process.env, pools = getPoolConfig(env)) {
  const num = (name, fallback) => {
    const n = Number.parseInt(env[name] ?? '', 10);
    return Number.isFinite(n) && n >= 0 ? n : fallback;
  };
  return {
    normal: pools.normal.length ? num('MAX_INFLIGHT_NORMAL', 4) : 0,
    ocr: pools.ocr.length ? num('MAX_INFLIGHT_OCR', pools.ocr.length) : 0,
    archive: pools.archive.length ? num('MAX_INFLIGHT_ARCHIVE', pools.archive.length) : 0,
  };
}

export const ITEMS_PER_TICK = 4;

// Statuses the dispatcher already retried on the peer; the queue may try once
// more on a later tick (e.g. after a Render instance finished waking).
const TRANSIENT = new Set([502, 503, 504]);

/** Result fields worth keeping in the database: statistics, never document text. */
function statsOnly(body) {
  if (!body || typeof body !== 'object') return null;
  const {
    filename, original_name, char_count, word_count, tokens_est, engine, backend_role,
    backend_instance, warning, warnings, output_bytes, outputs, primary_output, pages, mode,
  } = body;
  return {
    filename, original_name, char_count, word_count, tokens_est, engine, backend_role,
    backend_instance, warning, warnings, output_bytes, outputs, primary_output, pages, mode,
  };
}

function requestBody(item) {
  const p = item.payload || {};
  return {
    job_id: item.job_id,
    work_item_id: item.work_item_id,
    input_path: item.input_path,
    output_path: item.output_path,
    original_filename: p.original_filename || 'source',
    profile: p.profile || 'Standard',
    ...(item.task_type === 'PDF_PAGE_OCR' ? { raw: true } : {}),
    ...(p.task || {}),
  };
}

/** Child nodes and items from a task that split its input, ready for add_work_items. */
export function spawnFromResult(item, body) {
  const base = item.payload || {};
  const inherit = { original_filename: base.original_filename, profile: base.profile };
  if (item.task_type === 'PDF_ANALYZE' && body.mode === 'split') {
    const nodes = [];
    const items = [];
    for (const seg of body.segments || []) {
      nodes.push({
        node_id: seg.node_id,
        node_type: 'PDF_SEGMENT',
        classification: 'PDF_NATIVE',
        page_from: seg.page_from,
        page_to: seg.page_to,
        sequence_index: seg.page_from,
        status: 'DONE',
        output_object_path: seg.output_path,
      });
    }
    for (const scan of body.scans || []) {
      nodes.push({
        node_id: scan.node_id,
        node_type: 'PDF_PAGE',
        classification: 'PDF_OCR',
        page_from: scan.page,
        page_to: scan.page,
        sequence_index: scan.page,
      });
      items.push({
        node_id: scan.node_id,
        task_type: 'PDF_PAGE_OCR',
        pool: 'ocr',
        sequence_index: scan.page,
        input_path: scan.input_path,
        output_path: scan.output_path,
        payload: { ...inherit, original_filename: `page-${scan.page}.png` },
      });
    }
    const parts = [
      ...(body.segments || []).map((s) => ({ kind: 'native', page_from: s.page_from, page_to: s.page_to, path: s.output_path })),
      ...(body.scans || []).map((s) => ({ kind: 'ocr', page_from: s.page, page_to: s.page, path: s.output_path })),
    ].sort((a, b) => a.page_from - b.page_from);
    items.push({
      task_type: 'PDF_MERGE',
      pool: 'normal',
      status: 'BLOCKED',
      is_final: true,
      sequence_index: 1_000_000,
      output_path: item.output_path,
      payload: {
        ...inherit,
        task: { parts, pages: body.pages, source_bytes: body.source_bytes, skipped_pages: body.skipped_pages || [] },
      },
    });
    return { nodes, items };
  }
  if (item.task_type === 'ARCHIVE_PROCESS' && body.mode === 'single') {
    // Finished in one call; record the tree only (no more work).
    return body.nodes?.length ? { nodes: body.nodes, items: [] } : null;
  }
  if (item.task_type === 'ARCHIVE_PROCESS' && body.mode === 'split') {
    const nodes = body.nodes || [];
    const items = (body.ocr || []).map((o, i) => ({
      node_id: o.node_id,
      task_type: 'OCR_IMAGE',
      pool: 'ocr',
      sequence_index: o.sequence_index ?? i,
      input_path: o.input_path,
      output_path: o.output_path,
      payload: { ...inherit, original_filename: o.filename || `image-${i}.png`, task: { raw: true } },
    }));
    items.push({
      task_type: 'PROJECT_MERGE',
      pool: 'archive',
      status: 'BLOCKED',
      is_final: true,
      sequence_index: 1_000_000,
      output_path: item.output_path,
      payload: {
        ...inherit,
        task: {
          partial_paths: body.partial_paths || [],
          source_bytes: body.source_bytes,
          ocr: (body.ocr || []).map(({ node_id, output_path, logical_path }) => ({ node_id, output_path, logical_path })),
        },
      },
    });
    return { nodes, items };
  }
  return null;
}

/** Sends one claimed item to its pool and records the outcome. */
export async function executeItem(db, item, { env = process.env, secret, fetchImpl } = {}) {
  const urls = getPoolConfig(env)[item.pool] || [];
  const started = Date.now();
  const body = requestBody(item);
  const { status, body: res, instanceUrl } = await sendToPool({
    pool: item.pool,
    urls,
    jobId: item.work_item_id, // spreads a job's pieces across both instances
    path: TASK_ENDPOINTS[item.task_type],
    secret,
    makeInit: () => ({ method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }),
    ...(fetchImpl ? { fetchImpl } : {}),
  });
  const backend = res?.backend_instance || null;
  const duration = res?.duration_ms ?? Date.now() - started;

  if (status === 200) {
    const spawn = spawnFromResult(item, res);
    const stats = statsOnly(res);
    const jobStatus = await db.rpc('finish_work_item', {
      p_work_item_id: item.work_item_id, p_attempt: item.attempt_count,
      p_outcome: 'SUCCEEDED', p_bucket: db.bucket, p_backend: backend,
      p_duration_ms: duration, p_result: stats,
      p_nodes: spawn?.nodes || [], p_items: spawn?.items || [],
    });
    return { item: item.work_item_id, outcome: 'SUCCEEDED', jobStatus, reachedBackend: Boolean(instanceUrl) };
  }

  const outcome = TRANSIENT.has(status) ? 'RETRY' : 'FAILED';
  const jobStatus = await db.rpc('finish_work_item', {
    p_work_item_id: item.work_item_id,
    p_attempt: item.attempt_count,
    p_outcome: outcome,
    p_bucket: db.bucket,
    p_backend: backend,
    p_duration_ms: duration,
    p_result: null,
    p_error_code: `HTTP_${status}`,
    p_error_message: String(res?.detail || '').slice(0, 500),
  });
  if (jobStatus === 'FAILED') {
    await db.insert('job_events', {
      job_id: item.job_id,
      event_type: 'FAILED',
      status: 'FAILED',
      stage: item.task_type,
      message: `HTTP ${status}`,
    });
  }
  return { item: item.work_item_id, outcome, jobStatus };
}

/**
 * One scheduling pass. With `jobId`, only that job's items are claimed (a
 * browser advancing its own upload); without it, any job (cron sweep).
 * Items of all pools run concurrently; the call returns when they finish.
 */
export async function runTick(db, { jobId = null, env = process.env, secret, fetchImpl, limit = ITEMS_PER_TICK } = {}) {
  await db.rpc('requeue_expired_work_items', {});
  const capacity = poolCapacity(env);
  const claimed = [];
  for (const pool of POOLS) {
    if (!capacity[pool]) continue;
    const rows = await db.rpc('claim_work_items', {
      p_pool: pool,
      p_capacity: capacity[pool],
      p_limit: limit,
      p_job_id: jobId,
    });
    claimed.push(...(rows || []));
  }
  // A failure while recording one item must not abort the others; its lease
  // expires and requeue_expired_work_items() retries it.
  const results = await Promise.all(
    claimed.map((item) =>
      executeItem(db, item, { env, secret, fetchImpl }).catch((err) => ({
        item: item.work_item_id,
        outcome: 'ERROR',
        error: err.message,
      }))
    )
  );
  return { claimed: claimed.length, results };
}
