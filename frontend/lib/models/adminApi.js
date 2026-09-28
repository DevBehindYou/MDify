// Browser side of /mdify-controller: calls the /api/admin routes. The
// session lives in an HttpOnly cookie the browser sends automatically; this
// code never sees a key or token. Requests that change something carry the
// x-mdify-admin header the server requires.

export class AdminApiError extends Error {
  constructor(message, status) {
    super(message);
    this.name = 'AdminApiError';
    this.status = status;
  }
}

async function call(path, { method = 'GET', body, signal } = {}) {
  let res;
  try {
    res = await fetch(`/api/admin${path}`, {
      method,
      credentials: 'same-origin',
      cache: 'no-store',
      signal,
      headers: {
        ...(method === 'GET' ? {} : { 'x-mdify-admin': '1' }),
        ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch (err) {
    if (err?.name === 'AbortError') throw err;
    throw new AdminApiError('Network error. Check your connection.', 0);
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new AdminApiError(data.detail || `Request failed (${res.status})`, res.status);
  return data;
}

const query = (params) => {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params || {})) if (v !== null && v !== undefined && v !== '') q.set(k, v);
  const s = q.toString();
  return s ? `?${s}` : '';
};

export const adminApi = {
  session: () => call('/session'),
  login: (key1, key2) => call('/session', { method: 'POST', body: { key1, key2 } }),
  logout: () => call('/session', { method: 'DELETE' }),
  overview: () => call('/overview'),
  jobs: (params, signal) => call(`/jobs${query(params)}`, { signal }),
  job: (jobId, signal) => call(`/jobs/${encodeURIComponent(jobId)}`, { signal }),
  action: (jobId, action, hours) => call(`/jobs/${encodeURIComponent(jobId)}/action`, { method: 'POST', body: { action, hours } }),
  bulk: (jobIds, action, hours) => call('/bulk', { method: 'POST', body: { job_ids: jobIds, action, hours } }),
  signFile: (jobId, fileId, purpose = 'download') =>
    call(`/jobs/${encodeURIComponent(jobId)}/files/${encodeURIComponent(fileId)}`, { method: 'POST', body: { purpose } }),
  files: (params) => call(`/files${query(params)}`),
  audit: (params) => call(`/audit${query(params)}`),
  processes: () => call('/processes'),
};

// ── Preview and ZIP (in the browser, from short-lived signed links) ────────

export const PREVIEW_CHARS = 200_000;
export const ZIP_MAX_FILES = 200;
export const ZIP_MAX_BYTES = 200 * 1024 * 1024;

/** First PREVIEW_CHARS characters of a stored text file. */
export async function previewText(jobId, fileId) {
  const { url } = await adminApi.signFile(jobId, fileId, 'preview');
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) throw new AdminApiError(`Preview failed (${res.status})`, res.status);
  const text = await res.text();
  return { text: text.slice(0, PREVIEW_CHARS), truncated: text.length > PREVIEW_CHARS };
}

/**
 * Builds one ZIP in the browser from files of one or more jobs.
 * `items`: [{ jobId, fileId, name }]. Each link is signed (and audited) on the
 * server; bytes go straight from Storage to this browser.
 */
export async function downloadZip(items, { onProgress, zipName = 'mdify-export.zip' } = {}) {
  if (!items.length) throw new AdminApiError('Nothing to download', 400);
  if (items.length > ZIP_MAX_FILES) throw new AdminApiError(`At most ${ZIP_MAX_FILES} files per ZIP`, 400);
  const { default: JSZip } = await import('jszip');
  const zip = new JSZip();
  let bytes = 0;
  const used = new Set();
  for (let i = 0; i < items.length; i += 1) {
    const item = items[i];
    const { url, name } = await adminApi.signFile(item.jobId, item.fileId, 'download');
    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) throw new AdminApiError(`Could not fetch ${name} (${res.status})`, res.status);
    const blob = await res.blob();
    bytes += blob.size;
    if (bytes > ZIP_MAX_BYTES) throw new AdminApiError('The selection is larger than 200 MB; pick fewer files', 413);
    const base = item.name || name;
    let entry = base;
    for (let n = 2; used.has(entry); n += 1) entry = base.replace(/(\.[^.]*)?$/, `-${n}$1`);
    used.add(entry);
    zip.file(entry, blob);
    onProgress?.((i + 1) / items.length);
  }
  const out = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE' });
  const href = URL.createObjectURL(out);
  const a = document.createElement('a');
  a.href = href;
  a.download = zipName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(href), 10_000);
  return { files: items.length, bytes };
}

/** Opens a signed download link for one file. */
export async function downloadFile(jobId, fileId) {
  const { url } = await adminApi.signFile(jobId, fileId, 'download');
  const a = document.createElement('a');
  a.href = url;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
}
