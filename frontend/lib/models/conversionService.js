// Transport between the browser and the conversion backend. ViewModels call
// only these functions.
//
// Two paths, same result shape ({ filename, content, tokens_est, … }):
//   Storage (production): create job → PUT bytes straight to Supabase Storage
//     via a signed URL → start job → fetch the Markdown from a signed download
//     URL. File bytes and results never pass through a Vercel function.
//   Multipart (local development, or when the server answers 501 because
//     Supabase isn't configured): POST /api/convert with the file.

export class ConversionError extends Error {
  constructor(message, { status = null, network = false } = {}) {
    super(message);
    this.name = 'ConversionError';
    this.status = status;
    /** True when the backend could not be reached at all. */
    this.network = network;
  }
}

const UNREACHABLE = 'Could not reach the converter. Check your connection and retry.';

/** Reads every combined archive part before exposing a successful result. */
export async function fetchResultMarkdown(result, { sourceType, signal, fetchImpl = fetch } = {}) {
  const read = async (url) => {
    if (!url) throw new ConversionError('The converted file has no download link. Please try again.', { status: 409 });
    try {
      const response = await fetchImpl(url, { signal });
      if (!response.ok) throw new ConversionError(`Could not download the converted file (${response.status}). Please try again.`, { status: response.status });
      return await response.text();
    } catch (err) {
      if (err?.name === 'AbortError' || err instanceof ConversionError) throw err;
      throw new ConversionError('Could not download the converted file. Check your connection and retry.', { network: true });
    }
  };
  const stem = (result.filename || '').replace(/\.md$/i, '');
  const prefix = `${stem}-part-`;
  const parts = sourceType === 'ARCHIVE' && stem
    ? (result.outputs || []).flatMap((output) => {
      if (!output.name?.startsWith(prefix)) return [];
      const match = /^(\d{3,})\.md$/.exec(output.name.slice(prefix.length));
      return match ? [{ ...output, number: Number(match[1]) }] : [];
    }).sort((a, b) => a.number - b.number)
    : [];
  if (!parts.length) return read(result.download_url);

  const incomplete = () => new ConversionError('The project result is incomplete. Please retry downloading it.', { status: 409 });
  if (parts.length < 2 || parts.some((part, index) => part.number !== index + 1)) throw incomplete();
  const content = [];
  for (const [index, part] of parts.entries()) {
    let text = await read(part.url);
    if (index > 0) {
      const header = /^# [^\r\n]* \(part (\d+) of (\d+)\)\n\n/.exec(text);
      // This also detects a server response that omitted trailing output links.
      if (!header || Number(header[1]) !== index + 1 || Number(header[2]) !== parts.length) throw incomplete();
      text = text.slice(header[0].length);
    }
    content.push(text);
  }
  return content.join('');
}

async function request(url, init, fallbackMessage) {
  let res;
  try {
    res = await fetch(url, init);
  } catch (err) {
    if (err?.name === 'AbortError') throw err;
    throw new ConversionError(fallbackMessage || UNREACHABLE, { network: true });
  }
  let data = {};
  try {
    data = await res.json();
  } catch (err) {
    if (err?.name === 'AbortError') throw err;
    // Non-JSON body (e.g. a platform error page) — fall through to status.
  }
  return { res, data };
}

const failure = (res, data) =>
  new ConversionError(data.detail || data.error || `Conversion failed (${res.status})`, { status: res.status });

// null = unknown until the first attempt; false = server has no Storage.
let storageAvailable = null;

async function convertViaStorage(file, profile, signal, onProgress) {
  const { res: created, data: job } = await request('/api/uploads/create', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ filename: file.name, size: file.size, content_type: file.type || null, profile }),
    signal,
  });
  if (created.status === 501) {
    storageAvailable = false;
    return null;
  }
  if (!created.ok) throw failure(created, job);
  storageAvailable = true;

  // Same request shape as @supabase/storage-js uploadToSignedUrl.
  const form = new FormData();
  form.append('cacheControl', '3600');
  form.append('', file);
  let uploaded;
  try {
    uploaded = await fetch(job.upload_url, { method: 'PUT', body: form, signal });
  } catch (err) {
    if (err?.name === 'AbortError') throw err;
    throw new ConversionError('Upload failed. Check your connection and retry.', { network: true });
  }
  if (!uploaded.ok) throw new ConversionError(`Upload failed (${uploaded.status})`, { status: uploaded.status });

  onProgress?.(UPLOADED_PROGRESS);

  const first = await startUploadedJob(job.job_id, { signal });
  const status = await waitForJob(job.job_id, first, { signal, onProgress });
  if (status.status !== 'COMPLETED') {
    throw new ConversionError(status.detail || status.error?.message || 'Conversion failed', { status: 422 });
  }

  const result = status.result || {};
  const content = await fetchResultMarkdown(result, { sourceType: status.source_type, signal });
  return { ...result, job_id: job.job_id, source_type: status.source_type, items: status.items, content };
}

const TERMINAL = new Set(['COMPLETED', 'FAILED', 'CANCELLED', 'DELETED']);
const UPLOADED_PROGRESS = 25;
export const JOB_WAIT_LIMIT_MS = 30 * 60_000;

const sleep = (ms, signal) =>
  new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener(
      'abort',
      () => {
        clearTimeout(timer);
        reject(new DOMException('Aborted', 'AbortError'));
      },
      { once: true }
    );
  });

function retryDelay(res, fallback) {
  const value = res?.headers?.get('Retry-After');
  const seconds = value && /^\d+$/.test(value) ? Number(value) : 0;
  return Math.max(fallback, Math.min(330, seconds) * 1000);
}

/** Retry an already uploaded job's idempotent start without uploading again. */
export async function startUploadedJob(jobId, { signal, fetchImpl = fetch, sleepImpl = sleep, now = Date.now } = {}) {
  const deadline = now() + JOB_WAIT_LIMIT_MS;
  for (let attempt = 0; ; attempt++) {
    let res;
    let data = {};
    try {
      res = await fetchImpl(`/api/jobs/${jobId}/start`, { method: 'POST', cache: 'no-store', signal });
      data = await res.json().catch(() => ({}));
    } catch (err) {
      if (err?.name === 'AbortError') throw err;
      res = null;
    }
    if (res?.ok) return data;
    if (res && res.status < 500 && res.status !== 429) throw failure(res, data);
    if (attempt >= 8 || now() >= deadline) {
      throw new ConversionError(data.detail || 'The uploaded file could not be started. Please try again later.', { status: res?.status, network: !res });
    }
    await sleepImpl(Math.min(deadline - now(), retryDelay(res, Math.min(15_000, 1000 * 2 ** attempt))), signal);
  }
}

/**
 * Keeps a multi-part job (scanned PDF, archive) moving: each /advance call
 * runs one scheduling pass for this job on the server. Transient errors back
 * off and retry; the job itself is durable, so nothing is lost meanwhile.
 */
export async function waitForJob(jobId, first, { signal, onProgress, fetchImpl = fetch, sleepImpl = sleep, now = Date.now } = {}) {
  let status = first;
  const deadline = now() + JOB_WAIT_LIMIT_MS;
  let delay = 500;
  let failures = 0;
  while (!TERMINAL.has(status.status)) {
    onProgress?.(UPLOADED_PROGRESS + Math.round((status.progress || 0) * 0.7));
    if (now() > deadline) {
      throw new ConversionError('This file is taking unusually long. Please try again later.', { status: 504 });
    }
    await sleepImpl(delay, signal);
    let res;
    let data = {};
    try {
      res = await fetchImpl(`/api/jobs/${jobId}/advance`, { method: 'POST', cache: 'no-store', signal });
      data = await res.json().catch(() => ({}));
    } catch (err) {
      if (err?.name === 'AbortError') throw err;
      res = null;
    }
    if (res?.ok) {
      status = data;
      failures = 0;
      // Waiting for a free backend slot: ask less often.
      delay = status.status === 'QUEUED' ? 3000 : 500;
    } else if (!res || res.status >= 500 || res.status === 429) {
      failures += 1;
      if (failures > 8) throw new ConversionError(UNREACHABLE, { network: !res });
      delay = retryDelay(res, Math.min(15_000, 1000 * 2 ** failures));
    } else {
      throw failure(res, data);
    }
  }
  return status;
}

/**
 * Converts one file. Rejects with an AbortError when `signal` fires, and with
 * a ConversionError for every other failure. `onProgress(percent)` reports
 * upload and processing progress for multi-part jobs.
 */
export async function convertFile(file, profile, { signal, onProgress } = {}) {
  if (storageAvailable !== false) {
    const result = await convertViaStorage(file, profile, signal, onProgress);
    if (result) return result;
  }

  const form = new FormData();
  form.append('file', file);
  form.append('profile', profile);
  const { res, data } = await request('/api/convert', { method: 'POST', body: form, signal });
  if (!res.ok) throw failure(res, data);
  return data;
}

/** Resolves true when the app's API answers, false otherwise. Never rejects. */
export async function checkHealth({ timeoutMs = 6000 } = {}) {
  try {
    const res = await fetch('/api/health', {
      cache: 'no-store',
      signal: AbortSignal.timeout(timeoutMs),
    });
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * Asks the server to ping every backend so sleeping instances start.
 * Resolves { pools, all_ready } or null when the app's API is unreachable.
 */
export async function requestWake({ fetchImpl = fetch, timeoutMs = 15000 } = {}) {
  try {
    const res = await fetchImpl('/api/wake', { method: 'POST', cache: 'no-store', signal: AbortSignal.timeout(timeoutMs) });
    return res.ok ? await res.json() : null;
  } catch {
    return null;
  }
}

/** Test hook: forget what was learned about the server's Storage support. */
export function resetTransportForTests() {
  storageAvailable = null;
}
