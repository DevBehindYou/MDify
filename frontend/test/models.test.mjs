import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { uniqueArchiveNames } from '../lib/models/fileExport.js';
import {
  MAX_SESSIONS,
  clearAllRecentSessions,
  getRecentSessions,
  saveRecentSession,
} from '../lib/models/sessionRepository.js';
import { splitFileName, validateUpload } from '../lib/formats.js';

class MemoryStorage {
  constructor(quota = Infinity) {
    this.map = new Map();
    this.quota = quota;
  }
  getItem(k) {
    return this.map.has(k) ? this.map.get(k) : null;
  }
  setItem(k, v) {
    if (v.length > this.quota) {
      const err = new Error('quota');
      err.name = 'QuotaExceededError';
      throw err;
    }
    this.map.set(k, String(v));
  }
  removeItem(k) {
    this.map.delete(k);
  }
}

beforeEach(() => {
  globalThis.localStorage = new MemoryStorage();
});

test('ZIP entry names are made unique', () => {
  assert.deepEqual(uniqueArchiveNames(['report.md', 'report.md', 'notes.md', 'report.md']), [
    'report.md',
    'report (2).md',
    'notes.md',
    'report (3).md',
  ]);
});

test('sessions keep only the newest five', () => {
  for (let i = 0; i < MAX_SESSIONS + 2; i += 1) {
    saveRecentSession({ id: `s${i}`, original_name: `f${i}.pdf`, content: `c${i}` });
  }
  const sessions = getRecentSessions();
  assert.equal(sessions.length, MAX_SESSIONS);
  assert.equal(sessions[0].id, `s${MAX_SESSIONS + 1}`);
});

test('quota pressure drops oldest sessions instead of wiping the list', () => {
  globalThis.localStorage = new MemoryStorage(600);
  saveRecentSession({ id: 'old', original_name: 'old.pdf', content: 'x'.repeat(200) });
  const after = saveRecentSession({ id: 'new', original_name: 'new.pdf', content: 'y'.repeat(300) });
  assert.deepEqual(after.map((s) => s.id), ['new']);
});

test('a session too large to store leaves the existing list intact', () => {
  globalThis.localStorage = new MemoryStorage(400);
  saveRecentSession({ id: 'keep', original_name: 'keep.pdf', content: 'k' });
  const after = saveRecentSession({ id: 'huge', original_name: 'huge.pdf', content: 'z'.repeat(5000) });
  assert.deepEqual(after.map((s) => s.id), ['keep']);
  assert.deepEqual(getRecentSessions().map((s) => s.id), ['keep']);
});

test('clear removes everything', () => {
  saveRecentSession({ id: 'a', original_name: 'a.pdf', content: 'a' });
  assert.deepEqual(clearAllRecentSessions(), []);
  assert.deepEqual(getRecentSessions(), []);
});

test('file names are split safely and validated', () => {
  assert.deepEqual(splitFileName('../../x/Report.Final.PDF'), {
    base: 'Report.Final.PDF',
    ext: 'pdf',
    stem: 'Report.Final',
  });
  assert.equal(validateUpload({ name: 'a.pdf', size: 10 }), null);
  assert.match(validateUpload({ name: 'a.exe', size: 10 }), /Unsupported/);
  assert.match(validateUpload({ name: 'a.pdf', size: 0 }), /empty/);
  assert.match(validateUpload({ name: 'a.pdf', size: 16 * 1024 * 1024 }), /limit/);
  // Images: 10MB. Documents keep 15MB.
  assert.equal(validateUpload({ name: 'a.pdf', size: 12 * 1024 * 1024 }), null);
  assert.equal(validateUpload({ name: 'scan.png', size: 10 * 1024 * 1024 }), null);
  assert.equal(validateUpload({ name: 'scan.JPG', size: 10 * 1024 * 1024 + 1 }), 'Images are limited to 10MB');
  for (const ext of ['jpg', 'jpeg', 'png', 'webp', 'tif', 'tiff', 'bmp', 'gif']) {
    assert.match(validateUpload({ name: `x.${ext}`, size: 11 * 1024 * 1024 }), /Images are limited to 10MB/, ext);
  }
});
