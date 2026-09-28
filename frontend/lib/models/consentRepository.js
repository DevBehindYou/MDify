// Terms of Service + Privacy Policy acceptance, persisted in localStorage.
//
// The version comes from lib/legal/policies.js: bump LEGAL_VERSION there when
// either document changes materially and every visitor is asked again, since
// an acceptance only counts for the version it was given for.

import { LEGAL_VERSION } from '../legal/policies.js';

export const POLICY_VERSION = LEGAL_VERSION;
const STORAGE_KEY = 'mdify-consent';

const listeners = new Set();

// Acceptance given in this page view, for when storage is blocked.
let sessionAccepted = false;

function getStorage() {
  try {
    return globalThis.localStorage || null;
  } catch {
    return null;
  }
}

/** The stored acceptance for the current policy version, or null. */
export function readConsent() {
  const storage = getStorage();
  if (!storage) return null;
  try {
    const record = JSON.parse(storage.getItem(STORAGE_KEY) || 'null');
    return record && record.version === POLICY_VERSION ? record : null;
  } catch {
    return null;
  }
}

export function hasAcceptedCurrentPolicy() {
  return readConsent() !== null;
}

/**
 * Records acceptance of the current version. Returns false when storage is
 * unavailable — the acceptance then lasts only for this page view.
 */
export function acceptConsent(now = Date.now()) {
  sessionAccepted = true;
  const record = { version: POLICY_VERSION, acceptedAt: new Date(now).toISOString() };
  let persisted = false;
  try {
    const storage = getStorage();
    if (storage) {
      storage.setItem(STORAGE_KEY, JSON.stringify(record));
      persisted = true;
    }
  } catch {
    // Quota or privacy mode — fall back to the in-memory flag.
  }
  listeners.forEach((listener) => listener());
  return persisted;
}

/** Current acceptance, including an in-memory one when storage is blocked. */
export function isConsentGiven() {
  return sessionAccepted || hasAcceptedCurrentPolicy();
}

/** Subscribes to acceptance changes, including ones made in other tabs. */
export function subscribeConsent(listener) {
  listeners.add(listener);
  const onStorage = (event) => {
    if (event.key === STORAGE_KEY) listener();
  };
  if (typeof window !== 'undefined') window.addEventListener('storage', onStorage);
  return () => {
    listeners.delete(listener);
    if (typeof window !== 'undefined') window.removeEventListener('storage', onStorage);
  };
}

/** Test helper: forget the in-memory acceptance. */
export function resetConsentForTests() {
  sessionAccepted = false;
}
