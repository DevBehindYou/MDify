import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { dateLabel, parseFrontmatter, splitTldr, toDialogPost, validatePost } from '../lib/blog.mjs';
import { buildIndex, OUTPUT_FILE, serialize } from '../scripts/build-blog-index.mjs';

const VALID = `---
title: "Convert Word to Markdown"   # H1
slug: "word-to-markdown"
description: "How to convert DOCX to Markdown # without losing headings."
excerpt: 'It''s quicker than you think.'
date: "2026-09-20"
updated: 2026-09-25
author: "DevBehindYou"
category: "GUIDE"
tags: ["Word", 'DOCX', Markdown]
primaryKeyword: "Word to Markdown"
secondaryKeywords: []
draft: false
---

**TL;DR:** Upload the file, pick a profile, download the Markdown.

## Step one
Text.
`;

test('frontmatter: quotes, comments, arrays and booleans', () => {
  const { data, body } = parseFrontmatter(VALID);
  assert.equal(data.title, 'Convert Word to Markdown');
  assert.equal(data.description, 'How to convert DOCX to Markdown # without losing headings.');
  assert.equal(data.excerpt, "It's quicker than you think.");
  assert.equal(data.updated, '2026-09-25');
  assert.deepEqual(data.tags, ['Word', 'DOCX', 'Markdown']);
  assert.deepEqual(data.secondaryKeywords, []);
  assert.equal(data.draft, false);
  assert.ok(body.startsWith('\n**TL;DR:**'));
});

test('frontmatter: CRLF line endings and a byte-order mark', () => {
  const { data } = parseFrontmatter(`﻿${VALID.replace(/\n/g, '\r\n')}`);
  assert.equal(data.slug, 'word-to-markdown');
});

test('frontmatter: missing or unclosed block is an error', () => {
  assert.throws(() => parseFrontmatter('# Title\n'), /must start with ---/);
  assert.throws(() => parseFrontmatter('---\ntitle: "x"\n'), /not closed/);
  assert.throws(() => parseFrontmatter('---\ntitle: "x\n---\n'), /Unterminated/);
});

test('validation lists every problem', () => {
  const { data } = parseFrontmatter(VALID);
  assert.deepEqual(validatePost(data, { fileSlug: 'word-to-markdown' }), []);
  const errors = validatePost(
    { ...data, slug: 'Word_To_MD', description: 'x'.repeat(171), date: '20-09-2026', tags: ['one'], draft: 'no' },
    { fileSlug: 'word-to-markdown' }
  );
  assert.equal(errors.length, 6, errors.join('\n'));
  assert.deepEqual(validatePost({}).filter((e) => e.endsWith('is required')).length, 8);
});

test('dialog post: TL;DR split, date label and reading time', () => {
  const post = toDialogPost('word-to-markdown.md', VALID);
  assert.equal(post.tldr, 'Upload the file, pick a profile, download the Markdown.');
  assert.ok(post.content.startsWith('## Step one'));
  assert.equal(post.date, 'Sep 20');
  assert.equal(post.tag, 'GUIDE');
  assert.equal(post.readTime, '1 min');
  assert.equal(dateLabel('2026-01-05'), 'Jan 5');
  assert.deepEqual(splitTldr('No summary here.'), { tldr: '', content: 'No summary here.' });
});

test('dialog post: errors name the file', () => {
  const noTldr = VALID.replace('**TL;DR:** ', '');
  assert.throws(() => toDialogPost('word-to-markdown.md', noTldr), /content\/blog\/word-to-markdown\.md: .*TL;DR/);
  assert.throws(() => toDialogPost('other-name.md', VALID), /must match the file name/);
});

test('index: drafts are left out and posts are newest first', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mdify-blog-'));
  try {
    const older = VALID.replace(/word-to-markdown/g, 'older-post').replace('"2026-09-20"', '"2026-01-02"').replace('updated: 2026-09-25\n', '');
    const draft = VALID.replace(/word-to-markdown/g, 'draft-post').replace('draft: false', 'draft: true');
    fs.writeFileSync(path.join(dir, 'older-post.md'), older);
    fs.writeFileSync(path.join(dir, 'word-to-markdown.md'), VALID);
    fs.writeFileSync(path.join(dir, 'draft-post.md'), draft);
    fs.writeFileSync(path.join(dir, 'README.md'), 'not a post');
    const posts = buildIndex(dir);
    assert.deepEqual(posts.map((p) => p.id), ['word-to-markdown', 'older-post']);
    assert.deepEqual(Object.keys(posts[0]), ['id', 'title', 'tag', 'date', 'readTime', 'summary', 'author', 'tldr', 'content']);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('index: committed JSON matches content/blog (run npm run blog:index)', () => {
  assert.equal(fs.readFileSync(OUTPUT_FILE, 'utf8'), serialize(buildIndex()));
});
