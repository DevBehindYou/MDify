// Legal texts must follow the house writing rules (docs: BlogHumanizerPrompt)
// and stay consistent with the consent version.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LEGAL_DOCUMENTS, LEGAL_VERSION, RETENTION_HOURS } from '../lib/legal/policies.js';
import { POLICY_VERSION } from '../lib/models/consentRepository.js';

const BANNED_WORDS = `peril fraught thwart dire feel feeling felt maybe look knew know vibrant bustling
essential vital soul crucible tapestry landscape pesky promptly reverberate enhance emphasise enable delve
revolutionize folks foster sure labyrinthine moist remnant nestled symphony labyrinth gossamer enigma
whispering dance metamorphosis indelible embark navigate mastering elevate unleash harness meticulous
meticulously navigating complexities realm understanding dive shall tailored towards underpins everchanging
daunting amongst robust diving power rapidly expanding excels imagine keen fancy metropolis crucial firstly
moreover furthermore however therefore additionally specifically generally consequently importantly
similarly nonetheless indeed thus alternatively notably despite essentially while unless also although
subsequently arguably because journey ultimately ensure`.split(/\s+/);

const BANNED_PHRASES = ['as a result', 'as well as', 'even though', 'in contrast', 'in order to', 'due to', 'even if',
  'given that', 'that being said', 'it is advisable', 'when it comes to', 'not only', 'remember that', 'in conclusion'];

function allText(doc) {
  const parts = [doc.title, ...doc.summary];
  for (const s of doc.sections) {
    parts.push(s.title);
    for (const b of s.blocks) parts.push(...(b.ul || [b.p || b.note]));
  }
  return parts.join('\n');
}

for (const [key, doc] of Object.entries(LEGAL_DOCUMENTS)) {
  const text = allText(doc);

  test(`${key}: no em dashes or semicolons`, () => {
    assert.equal((text.match(/—/g) || []).length, 0);
    assert.equal((text.match(/;/g) || []).length, 0);
  });

  test(`${key}: no banned vocabulary`, () => {
    const lower = text.toLowerCase();
    const words = BANNED_WORDS.filter((w) => new RegExp(`\\b${w}\\b`, 'i').test(text));
    const phrases = BANNED_PHRASES.filter((p) => lower.includes(p));
    assert.deepEqual([...words, ...phrases], []);
  });

  test(`${key}: states the retention period`, () => {
    assert.match(text, new RegExp(`${RETENTION_HOURS} hours`));
  });
}

test('consent version follows the legal version', () => {
  assert.equal(POLICY_VERSION, LEGAL_VERSION);
});

test('privacy policy covers the GDPR Art. 13 items', () => {
  const text = allText(LEGAL_DOCUMENTS.privacy);
  for (const needle of ['Art. 6(1)(b)', 'Art. 6(1)(f)', 'Art. 15', 'Art. 17', 'Art. 20', 'Art. 21', 'Art. 77', 'Art. 22', 'Standard Contractual Clauses']) {
    assert.ok(text.includes(needle), `missing ${needle}`);
  }
});
