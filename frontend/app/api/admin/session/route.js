import { createHash } from 'node:crypto';
import {
  checkKeys,
  clearedSessionCookie,
  clearLoginFailures,
  issueSession,
  loginRetryAfterMs,
  noteLoginFailure,
  readSession,
  SESSION_COOKIE,
  sessionCookie,
} from '../../../../lib/server/adminAuth';
import { audit } from '../../../../lib/server/adminService';
import { adminJson, adminSetup, clientAddress, errorResponse, readJson, sameOrigin } from '../../../../lib/server/adminRoute';

export const dynamic = 'force-dynamic';

// Pseudonymous client tag for the audit log: the same client gives the same
// tag, but the address itself is never stored.
const clientTag = (address, keys) => createHash('sha256').update(`${address}\0${keys[0]}`).digest('hex').slice(0, 12);

/** Is there a valid session? (The page asks on load.) */
export async function GET(request) {
  const setup = adminSetup();
  if (setup.response) return adminJson({ configured: false, authenticated: false });
  const session = readSession(request.cookies.get(SESSION_COOKIE)?.value, setup.keys);
  return adminJson({ configured: true, authenticated: Boolean(session), expires_at: session ? session.exp * 1000 : null });
}

/** Sign in with both keys. */
export async function POST(request) {
  const setup = adminSetup();
  if (setup.response) return setup.response;
  if (!sameOrigin(request)) return adminJson({ detail: 'Forbidden' }, { status: 403 });
  const { keys, db } = setup;
  const address = clientAddress(request);

  const wait = loginRetryAfterMs(address);
  if (wait > 0) {
    return adminJson(
      { detail: 'Too many attempts. Try again later.' },
      { status: 429, headers: { 'Retry-After': String(Math.ceil(wait / 1000)) } }
    );
  }

  try {
    const body = await readJson(request, 2048);
    const key1 = typeof body.key1 === 'string' ? body.key1 : '';
    const key2 = typeof body.key2 === 'string' ? body.key2 : '';
    if (!checkKeys(key1, key2, keys)) {
      noteLoginFailure(address);
      await audit(db, null, 'ADMIN_LOGIN_FAILED', { details: { client: clientTag(address, keys) } }).catch(() => {});
      return adminJson({ detail: 'Those keys are not valid.' }, { status: 401 });
    }
    clearLoginFailures(address);
    const session = issueSession(keys);
    await audit(db, session, 'ADMIN_LOGIN_SUCCESS', { details: { client: clientTag(address, keys) } });
    return adminJson(
      { authenticated: true, expires_at: session.exp * 1000 },
      { headers: { 'Set-Cookie': sessionCookie(session.token) } }
    );
  } catch (err) {
    return errorResponse(err, 'login');
  }
}

/** Sign out. */
export async function DELETE(request) {
  const setup = adminSetup();
  if (setup.response) return setup.response;
  if (!sameOrigin(request)) return adminJson({ detail: 'Forbidden' }, { status: 403 });
  const session = readSession(request.cookies.get(SESSION_COOKIE)?.value, setup.keys);
  if (session) await audit(setup.db, session, 'ADMIN_LOGOUT').catch(() => {});
  return adminJson({ authenticated: false }, { headers: { 'Set-Cookie': clearedSessionCookie() } });
}
