// Server-only Supabase access over plain REST (PostgREST + Storage API), so
// the frontend needs no extra dependency. Uses the service_role key: never
// import this from browser code, never prefix these env vars NEXT_PUBLIC_.
//
// Storage REST shapes follow @supabase/storage-js.

export function supabaseConfig(env = process.env) {
  const url = (env.SUPABASE_URL || '').replace(/\/+$/, '');
  const key = env.SUPABASE_SERVICE_ROLE_KEY || '';
  if (!url || !key) return null;
  return { url, key, bucket: env.SUPABASE_STORAGE_BUCKET || 'mdify-pro-files' };
}

export class SupabaseError extends Error {
  constructor(message, status) {
    super(message);
    this.name = 'SupabaseError';
    this.status = status;
  }
}

const encodePath = (path) => path.split('/').map(encodeURIComponent).join('/');

export function createSupabase(config, fetchImpl = fetch) {
  const headers = {
    apikey: config.key,
    Authorization: `Bearer ${config.key}`,
  };

  async function call(path, init = {}) {
    const res = await fetchImpl(`${config.url}${path}`, {
      ...init,
      headers: { ...headers, ...(init.headers || {}) },
      cache: 'no-store',
    });
    const text = await res.text();
    let data = null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = text;
    }
    if (!res.ok) {
      // Message only — response bodies may echo request data; never log keys.
      const msg = (data && (data.message || data.error)) || `HTTP ${res.status}`;
      throw new SupabaseError(`Supabase ${init.method || 'GET'} ${path.split('?')[0]} failed: ${msg}`, res.status);
    }
    return data;
  }

  const json = (method, body, extra = {}) => ({
    method,
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json', ...extra },
  });

  return {
    bucket: config.bucket,

    // ── Postgres (PostgREST) ──
    insert: (table, row) =>
      call(`/rest/v1/${table}`, json('POST', row, { Prefer: 'return=representation' })).then((r) => r?.[0] ?? null),

    /** Bulk insert; rows that hit the `onConflict` unique key are skipped. */
    insertMany: (table, rows, { onConflict } = {}) =>
      call(
        `/rest/v1/${table}${onConflict ? `?on_conflict=${onConflict}` : ''}`,
        json('POST', rows, { Prefer: `return=minimal${onConflict ? ',resolution=ignore-duplicates' : ''}` })
      ),

    /** PATCH rows matching `filters` (PostgREST syntax, e.g. { job_id: 'eq.x' }). */
    update: (table, filters, patch) =>
      call(`/rest/v1/${table}?${new URLSearchParams(filters)}`, json('PATCH', patch, { Prefer: 'return=representation' })),

    select: (table, filters) => call(`/rest/v1/${table}?${new URLSearchParams(filters)}`),

    /** DELETE rows matching `filters` (PostgREST syntax); returns the deleted rows. */
    remove: (table, filters) =>
      call(`/rest/v1/${table}?${new URLSearchParams(filters)}`, { method: 'DELETE', headers: { Prefer: 'return=representation' } }),

    rpc: (fn, args) => call(`/rest/v1/rpc/${fn}`, json('POST', args)),

    // ── Storage ──
    /** Signed upload URL (valid 2 h, Supabase default). No key needed to use it. */
    async signedUploadUrl(path) {
      const data = await call(`/storage/v1/object/upload/sign/${config.bucket}/${encodePath(path)}`, json('POST', {}));
      const url = new URL(`${config.url}/storage/v1${data.url}`);
      return { url: url.toString(), token: url.searchParams.get('token') };
    },

    async signedDownloadUrl(path, expiresIn, downloadName) {
      const data = await call(`/storage/v1/object/sign/${config.bucket}/${encodePath(path)}`, json('POST', { expiresIn }));
      const url = new URL(`${config.url}/storage/v1${data.signedURL}`);
      if (downloadName) url.searchParams.set('download', downloadName);
      return url.toString();
    },

    /** One folder level: files have an id, sub-folders have id === null. */
    listObjects: (prefix, { limit = 1000, offset = 0 } = {}) =>
      call(`/storage/v1/object/list/${config.bucket}`, json('POST', { prefix, limit, offset })),

    /** Deletes objects; paths that do not exist are ignored by Storage. */
    removeObjects: (paths) => call(`/storage/v1/object/${config.bucket}`, json('DELETE', { prefixes: paths })),
  };
}
