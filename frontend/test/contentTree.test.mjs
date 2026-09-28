// Admin tree view model (lib/models/contentTree.js).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildContentTree, worstStatus } from '../lib/models/contentTree.js';

const node = (id, fields) => ({ node_id: id, status: 'DONE', ...fields });
const names = (entry) => entry.children.map((c) => c.name);

test('archive paths become folders; a nested ZIP is a file with children', () => {
  const { root, counts } = buildContentTree([
    node('r', { node_type: 'ROOT_FILE', logical_path: 'project.zip' }),
    node('a', { node_type: 'CODE_FILE', logical_path: 'src/app.py' }),
    node('b', { node_type: 'TEXT_FILE', logical_path: 'README.md' }),
    node('c', { node_type: 'IMAGE', logical_path: 'docs/img/logo.png', status: 'FAILED' }),
    node('d', { node_type: 'NESTED_ARCHIVE', logical_path: 'vendor.zip' }),
    node('e', { node_type: 'CODE_FILE', logical_path: 'vendor.zip/lib/util.py', status: 'SKIPPED' }),
  ]);
  assert.equal(root.name, 'project.zip');
  assert.deepEqual(names(root), ['docs', 'src', 'README.md', 'vendor.zip'], 'folders first, then files');
  const vendor = root.children.find((c) => c.name === 'vendor.zip');
  assert.equal(vendor.node.node_id, 'd');
  assert.deepEqual(names(vendor), ['lib']);
  assert.equal(worstStatus(root.children[0]), 'FAILED', 'folder shows its worst child');
  assert.equal(counts.total, 5);
  assert.equal(counts.DONE, 3);
});

test('PDF pages are listed in page order with their kind', () => {
  const { root } = buildContentTree([
    node('r', { node_type: 'ROOT_FILE', logical_path: 'scan.pdf' }),
    node('p5', { node_type: 'PDF_PAGE', classification: 'PDF_OCR', page_from: 5, page_to: 5 }),
    node('s1', { node_type: 'PDF_SEGMENT', classification: 'PDF_NATIVE', page_from: 1, page_to: 4 }),
  ]);
  assert.deepEqual(names(root), ['Pages 1–4 · text', 'Page 5 · image, text recognition']);
});

test('after deletion, nodes without names still show up', () => {
  const { root } = buildContentTree(
    [
      node('r', { node_type: 'ROOT_FILE', logical_path: null }),
      node('a', { node_type: 'CODE_FILE', logical_path: null, sequence_index: 0 }),
      node('b', { node_type: 'IMAGE', logical_path: null, sequence_index: 1 }),
    ],
    { source_type: 'ARCHIVE' }
  );
  assert.equal(root.name, 'archive (name removed)');
  assert.deepEqual(names(root), ['code file #1', 'image #2']);
});

test('empty input gives an empty tree', () => {
  const { root, counts } = buildContentTree(undefined, { original_filename: 'a.docx' });
  assert.equal(root.name, 'a.docx');
  assert.equal(root.children.length, 0);
  assert.equal(counts.total, 0);
});
