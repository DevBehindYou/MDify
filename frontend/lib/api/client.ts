// The Repository / Model layer: the ONLY place that talks to the network.
// Components and view-models call these typed functions; they never call
// fetch() directly. This is the seam that keeps the UI decoupled from the API.

import { API_CONVERT, API_HEALTH, BACKEND_URL } from '@/lib/config';
import { ApiError, messageForCode } from '@/lib/errors';
import type { ConversionResult } from '@/types';

/** Fire-and-forget wake ping straight at the backend to trigger Render's
 *  cold start (bypasses the proxy, which may drop a slow first connection). */
export function wakeBackend(): void {
  if (!BACKEND_URL) return;
  fetch(`${BACKEND_URL}/api/v1/health`, {
    mode: 'cors',
    signal: AbortSignal.timeout(45_000),
  }).catch(() => {
    /* fire-and-forget */
  });
}

/** Returns true when the backend is reachable and ready. */
export async function checkHealth(timeoutMs = 10_000): Promise<boolean> {
  try {
    const res = await fetch(API_HEALTH, { signal: AbortSignal.timeout(timeoutMs) });
    return res.ok;
  } catch {
    return false;
  }
}

/** Convert one file. Resolves to a typed result or throws ApiError. */
export async function convertFile(file: File, profile = 'standard'): Promise<ConversionResult> {
  const form = new FormData();
  form.append('file', file);
  form.append('profile', profile);

  let res: Response;
  try {
    res = await fetch(API_CONVERT, { method: 'POST', body: form });
  } catch {
    throw new ApiError('BACKEND_UNAVAILABLE');
  }

  // Parse the body defensively — a gateway error may not be JSON.
  let data: unknown = null;
  try {
    data = await res.json();
  } catch {
    /* leave data null */
  }

  if (!res.ok) {
    const errBody = (data as { error?: { code?: string; message?: string } } | null)?.error;
    if (errBody?.code) {
      throw new ApiError(errBody.code as never, errBody.message ?? messageForCode(errBody.code));
    }
    if (res.status === 429) throw new ApiError('RATE_LIMITED');
    throw new ApiError('UNKNOWN_ERROR', `Server error (${res.status}).`);
  }

  return data as ConversionResult;
}
