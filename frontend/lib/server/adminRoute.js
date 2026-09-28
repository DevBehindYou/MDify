// Server-only: the guard every /api/admin route runs first.
//
//   - admin configured (both keys) and Supabase configured, else 503
//   - valid, unexpired session cookie, else 401
//   - for requests that change something: the x-mdify-admin header (a plain
//     form or link on another site cannot send it) and, when the browser
//     sends Origin, the same host. Together with SameSite=Strict this blocks
//     cross-site requests.
//
// Responses are never cached or indexed.

import { NextResponse } from 'next/server';
import { adminKeys, readSession, SESSION_COOKIE } from './adminAuth.js';
import { AdminError } from './adminService.js';
import { createSupabase, SupabaseError, supabaseConfig } from './supabaseRest.js';

export const ADMIN_HEADERS = { 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex, nofollow' };

export const adminJson = (body, init = {}) =>
  NextResponse.json(body, { ...init, headers: { ...ADMIN_HEADERS, ...(init.headers || {}) } });

export function sameOrigin(request) {
  if (request.headers.get('x-mdify-admin') !== '1') return false;
  const origin = request.headers.get('origin');
  if (!origin) return true;
  try {
    return new URL(origin).host === request.headers.get('host');
  } catch {
    return false;
  }
}

/** The client address for the login throttle (Vercel sets x-forwarded-for). */
export function clientAddress(request) {
  return (request.headers.get('x-forwarded-for') || '').split(',')[0].trim() || 'local';
}

/** { keys, db } when the admin can run at all, else { response }. */
export function adminSetup() {
  const keys = adminKeys();
  const config = supabaseConfig();
  if (!keys || !config) return { response: adminJson({ detail: 'The admin is not configured' }, { status: 503 }) };
  return { keys, db: createSupabase(config) };
}

export function errorResponse(err, where) {
  if (err instanceof AdminError) return adminJson({ detail: err.message }, { status: err.status });
  // PostgREST answers 404 for a missing table or function.
  if (err instanceof SupabaseError && err.status === 404) {
    return adminJson({ detail: 'The database is not set up yet: run supabase/MDIFY_SETUP.sql in the Supabase SQL Editor.' }, { status: 503 });
  }
  // Messages only: never document content, keys or signed URLs.
  console.error(`[admin ${where}]`, err instanceof SupabaseError ? err.message : err?.name || 'error');
  return adminJson({ detail: 'Something went wrong. Try again.' }, { status: 502 });
}

/**
 * Wraps a route handler: `handler({ request, params, db, session })`.
 * `mutation: true` for anything that changes data or signs a link.
 */
export function withAdmin(handler, { mutation = false, name = 'route' } = {}) {
  return async (request, context = {}) => {
    const setup = adminSetup();
    if (setup.response) return setup.response;
    if (mutation && !sameOrigin(request)) return adminJson({ detail: 'Forbidden' }, { status: 403 });
    const session = readSession(request.cookies.get(SESSION_COOKIE)?.value, setup.keys);
    if (!session) return adminJson({ detail: 'Sign in again' }, { status: 401 });
    try {
      return await handler({ request, params: context.params || {}, db: setup.db, session });
    } catch (err) {
      return errorResponse(err, name);
    }
  };
}

/** Parses a JSON body of at most `limit` bytes. */
export async function readJson(request, limit = 16 * 1024) {
  const text = await request.text();
  if (text.length > limit) throw new AdminError('Request too large', 413);
  try {
    return text ? JSON.parse(text) : {};
  } catch {
    throw new AdminError('Invalid JSON');
  }
}
