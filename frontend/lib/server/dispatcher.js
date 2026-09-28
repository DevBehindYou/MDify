// Server-only: routes a conversion to the right backend pool.
//
//   documents → normal pool (backendN: N1, N2)
//   images    → OCR pool    (backendO: O1, O2)
//
// The instance is picked by a stable hash of the job id — no process-local
// round-robin state, which serverless instances can't share. A transient
// infrastructure failure is retried once on the peer; validation, policy and
// conversion failures are never retried.

const TRANSIENT_STATUSES = new Set([502, 503, 504]);

// Per-attempt budget. O1/O2 run on Render Free, which sleeps after 15 idle
// minutes and takes about a minute to wake, so an OCR attempt must cover the
// wake-up plus the backend's own OCR budget (OCR_TIMEOUT_S, 85 s there).
// A timeout is never retried, and a fast failure (connection error, 502–504)
// leaves room for the peer attempt within the routes' 300 s maxDuration.
export const TIMEOUT_MS_BY_POOL = { normal: 120_000, ocr: 150_000 };

/** Parses a comma-separated URL list from an env var. */
export function parseBackendUrls(value) {
  return String(value || '')
    .split(',')
    .map((url) => url.trim().replace(/\/+$/, ''))
    .filter(Boolean);
}

export function getPoolConfig(env = process.env) {
  return {
    normal: parseBackendUrls(env.NORMAL_BACKEND_URLS),
    ocr: parseBackendUrls(env.OCR_BACKEND_URLS),
    archive: parseBackendUrls(env.ARCHIVE_BACKEND_URLS),
  };
}

/** 32-bit FNV-1a hash — stable across processes and deploys. */
export function stableHash(text) {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash;
}

/**
 * Attempt order for a job: the hash-selected instance first, then its peer.
 * At most two attempts, whatever the pool size.
 */
export function attemptOrder(jobId, urls) {
  if (urls.length === 0) return [];
  const primary = stableHash(jobId) % urls.length;
  if (urls.length === 1) return [urls[primary]];
  return [urls[primary], urls[(primary + 1) % urls.length]];
}

export function isTransientStatus(status) {
  return TRANSIENT_STATUSES.has(status);
}

/**
 * Sends one request to a pool with hash-selected instance and one peer retry.
 * `makeInit()` builds a fresh request per attempt (bodies can't be reused).
 * Returns { status, body, instanceUrl, attempts }.
 */
export async function sendToPool({
  pool,
  urls,
  jobId,
  path,
  makeInit,
  secret,
  timeoutMs = TIMEOUT_MS_BY_POOL[pool] ?? TIMEOUT_MS_BY_POOL.normal,
  fetchImpl = fetch,
}) {
  const order = attemptOrder(jobId, urls);
  if (order.length === 0) {
    return {
      status: 503,
      body: { detail: `No ${pool} conversion backend is configured.` },
      instanceUrl: null,
      attempts: 0,
    };
  }

  let lastFailure = null;
  let attempts = 0;
  for (const baseUrl of order) {
    const init = makeInit();
    attempts += 1;
    let res;
    try {
      res = await fetchImpl(`${baseUrl}${path}`, {
        ...init,
        method: 'POST',
        headers: { ...(init.headers || {}), 'X-Internal-Secret': secret },
        signal: AbortSignal.timeout(timeoutMs),
        cache: 'no-store',
      });
    } catch (err) {
      if (err?.name === 'TimeoutError') {
        // The instance may still be working on it, and a second full attempt
        // would overrun this function's own time limit — don't retry.
        return {
          status: 504,
          body: { detail: 'Conversion timed out. Try a smaller file or retry later.' },
          instanceUrl: baseUrl,
          attempts,
        };
      }
      // Connection refused / DNS / reset — infrastructure, so try the peer.
      lastFailure = { status: 502, reason: 'unreachable' };
      continue;
    }

    if (isTransientStatus(res.status)) {
      lastFailure = { status: res.status, reason: `HTTP ${res.status}` };
      continue;
    }

    let body;
    try {
      body = await res.json();
    } catch {
      body = { detail: `Backend returned an unreadable response (${res.status}).` };
    }
    return { status: res.status, body, instanceUrl: baseUrl, attempts };
  }

  console.error(`[dispatcher] ${pool} pool failed for job ${jobId}: ${lastFailure?.reason}`);
  return {
    status: 502,
    body: { detail: 'The converter is temporarily unavailable. Please retry in a moment.' },
    instanceUrl: null,
    attempts,
  };
}

/** Local/dev path: the file bytes travel in the request (multipart). */
export function dispatchConversion({ file, profile, jobId, ...rest }) {
  return sendToPool({
    ...rest,
    jobId,
    path: '/api/v1/internal/convert',
    makeInit: () => {
      const form = new FormData();
      form.append('file', file, file.name);
      form.append('profile', profile);
      form.append('job_id', jobId);
      return { body: form };
    },
  });
}

/** Storage path: only object references travel; bytes stay in Storage. */
export function dispatchProcess({ jobId, inputPath, outputPath, originalFilename, profile, ...rest }) {
  const payload = JSON.stringify({
    job_id: jobId,
    input_path: inputPath,
    output_path: outputPath,
    original_filename: originalFilename,
    profile,
  });
  return sendToPool({
    ...rest,
    jobId,
    path: '/api/v1/internal/process',
    makeInit: () => ({ body: payload, headers: { 'Content-Type': 'application/json' } }),
  });
}
