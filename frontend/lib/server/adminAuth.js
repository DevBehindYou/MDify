// Server-only: access to /mdify-controller.
//
// Two independent keys (ADMIN_KEY_1, ADMIN_KEY_2) must both match; neither
// ever reaches browser JavaScript. A match issues a short-lived session: an
// HMAC-signed, expiring token in an HttpOnly, SameSite=Strict cookie scoped to
// /api/admin. The signing key is derived from both admin keys, so changing
// either key ends every session.

import { createHash, createHmac, randomUUID, timingSafeEqual } from 'node:crypto';

export const SESSION_COOKIE = 'mdify_admin';
export const SESSION_PATH = '/api/admin';
export const SESSION_TTL_S = 30 * 60;
export const MIN_KEY_LENGTH = 24;

/** Both keys, or null when the admin is not configured (or configured weakly). */
export function adminKeys(env = process.env) {
  const k1 = env.ADMIN_KEY_1 || '';
  const k2 = env.ADMIN_KEY_2 || '';
  if (k1.length < MIN_KEY_LENGTH || k2.length < MIN_KEY_LENGTH || k1 === k2) return null;
  return [k1, k2];
}

// Hashing first gives equal lengths, so the comparison time does not depend
// on the key or on how much of it was guessed.
const digest = (value) => createHash('sha256').update(String(value ?? '')).digest();

export function checkKeys(key1, key2, keys) {
  // Both comparisons always run: the timing never tells which key was wrong.
  const ok1 = timingSafeEqual(digest(key1), digest(keys[0]));
  const ok2 = timingSafeEqual(digest(key2), digest(keys[1]));
  return ok1 && ok2;
}

const signingKey = (keys) => createHash('sha256').update(`mdify-admin-session\0${keys[0]}\0${keys[1]}`).digest();
const sign = (body, keys) => createHmac('sha256', signingKey(keys)).update(body).digest();

export function issueSession(keys, now = Date.now()) {
  const iat = Math.floor(now / 1000);
  const payload = { sid: randomUUID(), iat, exp: iat + SESSION_TTL_S };
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return { token: `${body}.${sign(body, keys).toString('base64url')}`, ...payload };
}

/** The session payload, or null when the token is missing, forged or expired. */
export function readSession(token, keys, now = Date.now()) {
  if (!token || !keys) return null;
  const [body, sig, extra] = String(token).split('.');
  if (!body || !sig || extra !== undefined) return null;
  const given = Buffer.from(sig, 'base64url');
  const expected = sign(body, keys);
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
  let payload;
  try {
    payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
  } catch {
    return null;
  }
  if (typeof payload?.exp !== 'number' || typeof payload.sid !== 'string' || payload.exp * 1000 <= now) return null;
  return payload;
}

export function sessionCookie(token, { maxAge = SESSION_TTL_S, secure = process.env.NODE_ENV === 'production' } = {}) {
  return [
    `${SESSION_COOKIE}=${token}`,
    `Path=${SESSION_PATH}`,
    'HttpOnly',
    'SameSite=Strict',
    `Max-Age=${maxAge}`,
    ...(secure ? ['Secure'] : []),
  ].join('; ');
}

export const clearedSessionCookie = (opts) => sessionCookie('', { ...opts, maxAge: 0 });

// ── Login throttle ─────────────────────────────────────────────────────────
// Best effort, per server instance: after LOGIN_MAX_FAILURES wrong attempts
// from one client within the window, logins from it wait for the window to
// pass. The audit log records every attempt either way.

export const LOGIN_MAX_FAILURES = 5;
export const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const failures = new Map();

function recent(client, now) {
  const list = (failures.get(client) || []).filter((t) => now - t < LOGIN_WINDOW_MS);
  if (list.length) failures.set(client, list);
  else failures.delete(client);
  return list;
}

/** Milliseconds until this client may try again (0 = allowed now). */
export function loginRetryAfterMs(client, now = Date.now()) {
  const list = recent(client, now);
  return list.length >= LOGIN_MAX_FAILURES ? LOGIN_WINDOW_MS - (now - list[0]) : 0;
}

export function noteLoginFailure(client, now = Date.now()) {
  if (failures.size > 10_000) failures.clear(); // bounded memory under a flood
  failures.set(client, [...recent(client, now), now]);
}

export function clearLoginFailures(client) {
  failures.delete(client);
}

export function resetLoginThrottleForTests() {
  failures.clear();
}
