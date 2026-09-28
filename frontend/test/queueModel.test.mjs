import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  initialQueueState,
  planAddFiles,
  queueReducer,
  selectActiveResult,
  selectConvertible,
} from '../lib/models/queueModel.js';
import { MAX_QUEUE_FILES } from '../lib/formats.js';

let n = 0;
const makeId = () => `id-${++n}`;
const file = (name, size = 10) => ({ name, size });

function withItems(names) {
  const { accepted } = planAddFiles(initialQueueState, names.map((x) => file(x)), { makeId });
  return queueReducer(initialQueueState, { type: 'itemsAdded', items: accepted });
}

function succeed(state, id, content = `content of ${id}`) {
  let next = queueReducer(state, { type: 'jobStarted', id });
  next = queueReducer(next, { type: 'jobSucceeded', id, result: { filename: `${id}.md`, content } });
  return next;
}

test('planAddFiles skips duplicates, unsupported files and overflow', () => {
  const state = withItems(['a.pdf']);
  const plan = planAddFiles(
    state,
    [file('a.pdf'), file('b.docx'), file('b.docx'), file('virus.exe'), file('empty.txt', 0)],
    { makeId }
  );
  assert.deepEqual(plan.accepted.map((i) => i.name), ['b.docx']);
  assert.equal(plan.duplicates, 2);
  assert.deepEqual(plan.rejected.map((r) => r.name), ['virus.exe', 'empty.txt']);

  const many = Array.from({ length: MAX_QUEUE_FILES + 3 }, (_, i) => file(`f${i}.txt`));
  const capped = planAddFiles(initialQueueState, many, { makeId });
  assert.equal(capped.accepted.length, MAX_QUEUE_FILES);
  assert.equal(capped.overflow, 3);
});

test('a finished job becomes the active result', () => {
  let state = withItems(['a.pdf', 'b.pdf']);
  const [a, b] = state.items;
  state = succeed(state, a.id);
  state = succeed(state, b.id);
  assert.equal(state.activeResultId, b.id);
  assert.equal(state.items.find((i) => i.id === a.id).status, 'done');
  assert.equal(selectActiveResult(state).id, b.id);
});

test('a result arriving for a removed file is ignored', () => {
  let state = withItems(['a.pdf']);
  const [a] = state.items;
  state = queueReducer(state, { type: 'jobStarted', id: a.id });
  state = queueReducer(state, { type: 'itemRemoved', id: a.id });
  state = queueReducer(state, { type: 'jobSucceeded', id: a.id, result: { content: 'late' } });
  assert.deepEqual(state.results, []);
  assert.deepEqual(state.items, []);
});

test('removing a non-active file keeps the selection (id-based, not index-based)', () => {
  let state = withItems(['a.pdf', 'b.pdf', 'c.pdf']);
  const [a, b, c] = state.items;
  state = succeed(succeed(succeed(state, a.id), b.id), c.id);
  state = queueReducer(state, { type: 'resultSelected', id: c.id });
  state = queueReducer(state, { type: 'itemRemoved', id: a.id });
  assert.equal(state.activeResultId, c.id);
});

test('removing the active file selects the next result, else the last', () => {
  let state = withItems(['a.pdf', 'b.pdf', 'c.pdf']);
  const [a, b, c] = state.items;
  state = succeed(succeed(succeed(state, a.id), b.id), c.id);
  state = queueReducer(state, { type: 'resultSelected', id: b.id });
  state = queueReducer(state, { type: 'itemRemoved', id: b.id });
  assert.equal(state.activeResultId, c.id);
  state = queueReducer(state, { type: 'itemRemoved', id: c.id });
  assert.equal(state.activeResultId, a.id);
  state = queueReducer(state, { type: 'itemRemoved', id: a.id });
  assert.equal(state.activeResultId, null);
});

test('failed jobs are convertible again; restored sessions are not', () => {
  let state = withItems(['a.pdf', 'b.pdf']);
  const [a] = state.items;
  state = queueReducer(state, { type: 'jobFailed', id: a.id, message: 'boom' });
  state = queueReducer(state, {
    type: 'sessionLoaded',
    session: { id: 'sess-1', filename: 'x.md', original_name: 'x.pdf', content: '# X' },
  });
  const convertible = selectConvertible(state).map((i) => i.name);
  assert.deepEqual(convertible, ['a.pdf', 'b.pdf']);
  assert.equal(state.activeResultId, 'sess-1');
});

test('loading an already-open session only selects it', () => {
  const session = { id: 's', filename: 's.md', original_name: 's.pdf', content: 'S' };
  let state = queueReducer(initialQueueState, { type: 'sessionLoaded', session });
  state = queueReducer(state, { type: 'resultSelected', id: 's' });
  const again = queueReducer(state, { type: 'sessionLoaded', session });
  assert.equal(again.results.length, 1);
  assert.equal(again.items.length, 1);
});

test('contentUpdated returns the same state when nothing changed', () => {
  let state = withItems(['a.pdf']);
  const [a] = state.items;
  state = succeed(state, a.id, 'same');
  assert.equal(queueReducer(state, { type: 'contentUpdated', id: a.id, content: 'same' }), state);
  const edited = queueReducer(state, { type: 'contentUpdated', id: a.id, content: 'edited' });
  assert.equal(selectActiveResult(edited).content, 'edited');
});
