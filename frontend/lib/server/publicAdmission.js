// Server-only shared admission. Never retain or log raw network identifiers.
import { createHmac } from 'node:crypto';
import { isIP } from 'node:net';
import { createSupabase, supabaseConfig } from './supabaseRest.js';

export class AdmissionError extends Error {
  constructor(status = 503, retryAfter = 30) {
    super(status === 429 ? 'Too many requests. Please wait and try again.' : 'MDify is busy right now. Please try again shortly.');
    this.status = status;
    this.retryAfter = retryAfter;
  }
}

export function admissionResponse(err) {
  if (!(err instanceof AdmissionError)) return null;
  return Response.json({ detail: err.message }, { status: err.status,
    headers: { 'Retry-After': String(err.retryAfter), 'Cache-Control': 'no-store' } });
}

export function clientHash(request, env = process.env, now = Date.now()) {
  if (!env.BACKEND_SHARED_SECRET) throw new AdmissionError();
  // Vercel owns this header. Self-hosted requests share one conservative key;
  // an arbitrary Forwarded/X-Forwarded-For header never creates a new client.
  const forwarded = env.VERCEL === '1' ? request.headers.get('x-vercel-forwarded-for') : null;
  const ip = forwarded?.trim();
  const identity = ip && isIP(ip) ? new URL(`http://${isIP(ip) === 6 ? `[${ip}]` : ip}`).hostname : 'unknown';
  const day = Math.floor(now / 86_400_000);
  return createHmac('sha256', env.BACKEND_SHARED_SECRET).update(`mdify-admission:${day}:${identity}`).digest('hex');
}

export async function admitPublicRequest(request, action, { env = process.env, db, now = Date.now() } = {}) {
  // Preserve the documented no-database development transport only in dev.
  // Production/preview never silently bypass a missing migration or service.
  const config = supabaseConfig(env);
  if (!db && !config && env.NODE_ENV === 'development' && env.VERCEL !== '1') return { release: async () => {} };
  if (!db && !config) throw new AdmissionError();
  const client = db || createSupabase(config);
  let result;
  try {
    result = await client.rpc('admit_public_request', { p_action: action, p_client_hash: clientHash(request, env, now) });
  } catch {
    throw new AdmissionError();
  }
  const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (result?.allowed !== true) {
    if (result?.allowed === false && [429, 503].includes(result.status) && Number.isInteger(result.retry_after) && result.retry_after >= 1 && result.retry_after <= 330) {
      throw new AdmissionError(result.status, result.retry_after);
    }
    throw new AdmissionError();
  }
  if (action === 'convert' && !UUID.test(result.lease_id || '')) throw new AdmissionError();
  return { release: async () => {
    if (!result.lease_id) return;
    try { await client.rpc('release_public_multipart', { p_lease_id: result.lease_id }); }
    catch { /* An unreleased lease expires conservatively; no raw DB errors. */ }
  } };
}

// Count streamed bytes even without Content-Length; never buffer an arbitrary
// request before applying the bound. Used by both JSON and multipart routes.
export async function readBoundedBody(request, maxBytes) {
  const length = request.headers.get('content-length');
  if (length !== null && (!/^\d+$/.test(length) || Number(length) > maxBytes)) {
    return { error: Response.json({ detail: 'Upload request is too large.' }, { status: 413 }) };
  }
  const reader = request.body?.getReader();
  if (!reader) return { bytes: new Uint8Array() };
  const parts = [];
  let size = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxBytes) {
        await reader.cancel();
        return { error: Response.json({ detail: 'Upload request is too large.' }, { status: 413 }) };
      }
      parts.push(value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const part of parts) { bytes.set(part, offset); offset += part.byteLength; }
  return { bytes };
}
