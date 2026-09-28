import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  POLICY_VERSION,
  acceptConsent,
  hasAcceptedCurrentPolicy,
  isConsentGiven,
  readConsent,
  resetConsentForTests,
  subscribeConsent,
} from '../lib/models/consentRepository.js';

class MemoryStorage {
  constructor() {
    this.map = new Map();
  }
  getItem(k) {
    return this.map.has(k) ? this.map.get(k) : null;
  }
  setItem(k, v) {
    this.map.set(k, String(v));
  }
  removeItem(k) {
    this.map.delete(k);
  }
}

beforeEach(() => {
  globalThis.localStorage = new MemoryStorage();
  resetConsentForTests();
});

test('no consent until accepted', () => {
  assert.equal(isConsentGiven(), false);
  assert.equal(readConsent(), null);
});

test('accepting stores the current policy version and notifies subscribers', () => {
  let calls = 0;
  const unsubscribe = subscribeConsent(() => (calls += 1));
  assert.equal(acceptConsent(Date.UTC(2026, 8, 26)), true);
  unsubscribe();
  assert.equal(calls, 1);
  assert.equal(isConsentGiven(), true);
  assert.deepEqual(readConsent(), { version: POLICY_VERSION, acceptedAt: '2026-09-26T00:00:00.000Z' });
});

test('an acceptance for an older policy version does not count', () => {
  globalThis.localStorage.setItem('mdify-consent', JSON.stringify({ version: '2000-01-01', acceptedAt: 'x' }));
  assert.equal(hasAcceptedCurrentPolicy(), false);
  assert.equal(isConsentGiven(), false);
});

test('blocked storage still accepts for this page view', () => {
  globalThis.localStorage = {
    getItem() {
      throw new Error('blocked');
    },
    setItem() {
      throw new Error('blocked');
    },
  };
  assert.equal(acceptConsent(), false);
  assert.equal(isConsentGiven(), true);
});

test('corrupt stored value is treated as no consent', () => {
  globalThis.localStorage.setItem('mdify-consent', '{not json');
  assert.equal(isConsentGiven(), false);
});
