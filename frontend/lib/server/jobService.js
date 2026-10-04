// Server-only job lifecycle on Supabase Storage + Postgres.
//
//   createUpload → storage estimate + atomic active-job admission → UPLOADING + file_objects
//                  INPUT PENDING + signed upload URL (bytes go straight to Storage)
//   startJob     → confirm_upload() (48 h deadline) → enqueue_root() → first
//                  scheduling pass inline, so small files finish in this call
//   advanceJob   → one more scheduling pass for this job (the browser calls it
//                  while waiting), then the job's status
//   jobStatus    → progress counters; for a finished job, statistics and
//                  short-lived signed links to its outputs, never the content
//
// Work runs through the durable queue in ./jobQueue.js.

import { maxFileSizeFor, OCR_EXTENSIONS, poolForExtension, sizeLimitMessage, splitFileName } from '../formats.js';
import { getPoolConfig } from './dispatcher.js';
import { runTick } from './jobQueue.js';

export const DOWNLOAD_URL_TTL_S = 600;

// App labels → database enum values (migrations).
const PROFILE_DB = { Standard: 'standard', Clean: 'clean', Compact: 'compact', 'RAG-ready': 'rag_ready' };
const WORKLOAD_DB = { normal: 'NORMAL', ocr: 'OCR', archive: 'ARCHIVE' };
const TERMINAL = new Set(['COMPLETED', 'FAILED', 'CANCELLED', 'DELETED']);

// Storage a job can occupy, as a multiple of its upload: the input plus
// results, and for PDFs and archives also rendered pages / extracted images.
const FOOTPRINT = { DOCUMENT: 2, IMAGE: 2, PDF: 3, ARCHIVE: 3 };
const USAGE_CACHE_MS = 15_000;

export class JobError extends Error {
  constructor(message, status, { retryAfter = null } = {}) {
    super(message);
    this.name = 'JobError';
    this.status = status;
    this.retryAfter = retryAfter;
  }
}

export const inputPath = (jobId, ext) => `jobs/${jobId}/input/source.${ext}`;
export const outputPath = (jobId, sourceType) =>
  `jobs/${jobId}/output/${sourceType === 'ARCHIVE' ? 'combined.md' : 'result.md'}`;

export function sourceTypeFor(ext) {
  if (ext === 'pdf') return 'PDF';
  if (ext === 'zip') return 'ARCHIVE';
  if (OCR_EXTENSIONS.includes(ext)) return 'IMAGE';
  return 'DOCUMENT';
}

// ── Storage budget ──────────────────────────────────────────────────────────

let usageCache = null; // { at, bytes }

export function storageBudgetBytes(env = process.env) {
  const n = Number.parseInt(env.STORAGE_BUDGET_BYTES ?? '', 10);
  return Number.isFinite(n) && n > 0 ? n : 800 * 1024 * 1024; // of Supabase Free's 1 GB
}

/**
 * Refuses a new job when the bucket plus this job's expected footprint would
 * pass the budget. Fails open if the usage query itself fails: a missing
 * number must not take the whole service down.
 */
export async function checkStorageBudget(db, { size, sourceType, env = process.env, now = Date.now() }) {
  let used;
  if (usageCache && now - usageCache.at < USAGE_CACHE_MS) {
    used = usageCache.bytes;
  } else {
    try {
      used = Number(await db.rpc('storage_usage_bytes', { p_bucket: db.bucket })) || 0;
      usageCache = { at: now, bytes: used };
    } catch (err) {
      console.error('[storage budget] usage query failed:', err.message);
      return { used: null, allowed: true };
    }
  }
  const needed = size * (FOOTPRINT[sourceType] || 2);
  if (used + needed > storageBudgetBytes(env)) {
    throw new JobError('MDify is handling a lot of files right now. Please try again in a few minutes.', 503);
  }
  return { used, allowed: true };
}

/** Test hook. */
export function resetStorageUsageCacheForTests() {
  usageCache = null;
}

// ── Lifecycle ───────────────────────────────────────────────────────────────

export async function createUpload(db, { filename, size, contentType, profile, env = process.env }) {
  const { base, ext } = splitFileName(filename);
  const pool = poolForExtension(ext);
  if (!pool) throw new JobError(`Unsupported file format: .${ext || 'unknown'}`, 400);
  if (!Number.isSafeInteger(size) || size <= 0) throw new JobError('The file is empty', 400);
  if (size > maxFileSizeFor(ext)) throw new JobError(sizeLimitMessage(ext), 413);
  if (getPoolConfig(env)[pool].length === 0) {
    throw new JobError(`.${ext} conversion isn't available right now`, 503);
  }
  const sourceType = sourceTypeFor(ext);
  await checkStorageBudget(db, { size, sourceType, env });

  let job;
  try {
    job = await db.rpc('create_upload_job', {
      p_bucket: db.bucket, p_filename: base, p_extension: ext, p_size: size,
      p_mime: contentType || null, p_profile: PROFILE_DB[profile] || 'standard',
      p_source_type: sourceType, p_workload_type: WORKLOAD_DB[pool],
    });
  } catch {
    // Missing migration or unavailable capacity must never fall back to inserts.
    throw new JobError('Uploads are temporarily unavailable. Please retry shortly.', 503, { retryAfter: 30 });
  }
  if (job?.allowed === false) {
    throw new JobError('MDify is handling many jobs. Please try again shortly.', 503, { retryAfter: 30 });
  }
  if (job?.allowed !== true || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(job.job_id || '')) {
    throw new JobError('Uploads are temporarily unavailable. Please retry shortly.', 503, { retryAfter: 30 });
  }
  const path = inputPath(job.job_id, ext);
  const upload = await db.signedUploadUrl(path);
  return { job_id: job.job_id, upload_url: upload.url, object_path: path };
}

async function loadJob(db, jobId) {
  const rows = await db.select('jobs', {
    job_id: `eq.${jobId}`,
    select:
      'job_id,status,stage,progress,source_type,source_extension,profile,original_filename,' +
      'items_total,items_done,items_failed,items_skipped,warnings,error_code,error_message,files_deleted_at',
  });
  const job = rows?.[0];
  if (!job) throw new JobError('Job not found', 404);
  return job;
}

export async function startJob(db, jobId, { secret, env = process.env, fetchImpl, tick = true } = {}) {
  const job = await loadJob(db, jobId);
  if (TERMINAL.has(job.status) || job.status === 'CANCEL_REQUESTED') {
    return { status: 200, body: await jobStatus(db, jobId) };
  }
  if (job.status === 'UPLOADING' || job.status === 'QUEUED') {
    const path = inputPath(jobId, job.source_extension);
    const files = await db.select('file_objects', { job_id: `eq.${jobId}`, kind: 'eq.INPUT', select: 'size_bytes' });
    const objects = await db.listObjects(path.slice(0, path.lastIndexOf('/')));
    const object = objects?.find((o) => o.name === path.split('/').pop() && o.id);
    const size = Number(object?.metadata?.size);
    if (!object || !Number.isSafeInteger(size) || size <= 0) throw new JobError('The upload is not available yet. Please retry the upload.', 409);
    if (size !== Number(files?.[0]?.size_bytes) || size > maxFileSizeFor(job.source_extension)) {
      throw new JobError('The uploaded file size does not match the requested upload.', 413);
    }
    await db.rpc('start_uploaded_job', { p_job_id: jobId, p_bucket: db.bucket, p_verified_size: size });
  }
  if (tick) await runTick(db, { jobId, env, secret, fetchImpl });
  const body = await jobStatus(db, jobId);
  return { status: body.status === 'FAILED' ? statusForFailure(body.error?.code) : 200, body };
}

export async function advanceJob(db, jobId, { secret, env = process.env, fetchImpl } = {}) {
  const job = await loadJob(db, jobId);
  if (!TERMINAL.has(job.status) && job.status !== 'UPLOADING') {
    await runTick(db, { jobId, env, secret, fetchImpl });
  }
  return jobStatus(db, jobId);
}

function statusForFailure(code) {
  const m = /^HTTP_(\d{3})$/.exec(code || '');
  const n = m ? Number(m[1]) : 0;
  return n >= 400 && n < 500 ? n : 422;
}

export async function jobStatus(db, jobId) {
  const job = await loadJob(db, jobId);
  const body = {
    job_id: job.job_id,
    status: job.status,
    progress: job.progress,
    source_type: job.source_type,
    items: {
      total: job.items_total,
      done: job.items_done,
      failed: job.items_failed,
      skipped: job.items_skipped,
    },
  };
  if (job.status === 'FAILED' || job.status === 'CANCELLED') {
    body.error = { code: job.error_code, message: job.error_message || 'Conversion failed' };
    body.detail = body.error.message;
  }
  if (job.status === 'COMPLETED' && !job.files_deleted_at) {
    body.result = await finishedResult(db, job);
  }
  return body;
}

async function finalResult(db, jobId) {
  const rows = await db.select('work_items', {
    job_id: `eq.${jobId}`,
    is_final: 'eq.true',
    status: 'eq.SUCCEEDED',
    select: 'result,output_path,assigned_backend',
    order: 'completed_at.desc',
    limit: '1',
  });
  return rows?.[0] || null;
}

async function finishedResult(db, job) {
  const registered = await db.select('file_objects', { job_id: `eq.${job.job_id}`, kind: 'eq.OUTPUT', select: 'file_id', limit: '1' });
  if (!registered?.length) await db.rpc('finalize_job_outputs', { p_job_id: job.job_id, p_bucket: db.bucket });
  const final = await finalResult(db, job.job_id);
  const r = final?.result || {};
  const outputs = (r.outputs?.length ? r.outputs : [{ path: final?.output_path || outputPath(job.job_id, job.source_type), name: r.filename, kind: 'OUTPUT' }])
    .slice(0, 25);
  const signed = await Promise.all(
    outputs.map(async (o) => ({
      name: o.name || o.path.split('/').pop(),
      kind: o.kind || 'OUTPUT',
      bytes: o.bytes ?? null,
      url: await db.signedDownloadUrl(o.path, DOWNLOAD_URL_TTL_S, o.name),
      path: o.path,
    }))
  );
  const primaryPath = r.primary_output || outputs[0].path;
  const primary = signed.find((o) => o.path === primaryPath) || signed[0];
  return {
    filename: r.filename,
    original_name: r.original_name || job.original_filename,
    char_count: r.char_count,
    word_count: r.word_count,
    tokens_est: r.tokens_est,
    engine: r.engine,
    backend_instance: r.backend_instance || final?.assigned_backend,
    warning: r.warning,
    warnings: r.warnings || [],
    download_url: primary?.url,
    download_expires_in: DOWNLOAD_URL_TTL_S,
    outputs: signed.map(({ path, ...rest }) => rest),
  };
}

export async function downloadUrl(db, jobId) {
  const job = await loadJob(db, jobId);
  if (job.status !== 'COMPLETED') throw new JobError('Job has no result yet', 409);
  if (job.files_deleted_at) throw new JobError('Files for this job were deleted', 410);
  const final = await finalResult(db, jobId);
  const path = final?.result?.primary_output || final?.output_path || outputPath(jobId, job.source_type);
  return db.signedDownloadUrl(path, DOWNLOAD_URL_TTL_S);
}
