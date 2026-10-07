import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { dateLabel, figureRefs, inspectSvg, parseFrontmatter, sortPosts, splitTldr, toDialogPost, validatePost } from '../lib/blog.mjs';
import { blogBlocks, inlineTokens, safeHref } from '../lib/blogRender.mjs';
import { buildIndex, collectVisuals, OUTPUT_FILE, PUBLIC_DIR, serialize } from '../scripts/build-blog-index.mjs';

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
    assert.deepEqual(Object.keys(posts[0]), ['id', 'title', 'tag', 'date', 'publishedAt', 'description', 'readTime', 'summary', 'author', 'tldr', 'content', 'banner', 'bannerAlt', 'visuals']);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('index: committed JSON matches content/blog (run npm run blog:index)', () => {
  assert.equal(fs.readFileSync(OUTPUT_FILE, 'utf8'), serialize(buildIndex()));
});

// ── Visuals ────────────────────────────────────────────────────────────────

const SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 300" width="600" height="300"><rect width="10" height="10" style="fill:var(--bf-s1,#b45309)"/></svg>';

const WITH_VISUALS = VALID.replace('draft: false', 'draft: false\nbanner: "/blog/word-to-markdown/banner.svg"\nbannerAlt: "A Word file turning into Markdown"\nfeatured: true')
  .replace('## Step one\n', '## Step one\n\n![Flow from upload to download](/blog/word-to-markdown/flow.svg "Source: [MDify](/)")\n\n```md\n![not a figure](/blog/word-to-markdown/code.svg)\n```\n');

test('figures: parsed from their own lines, never inside code fences', () => {
  const post = toDialogPost('word-to-markdown.md', WITH_VISUALS);
  assert.equal(post.banner, '/blog/word-to-markdown/banner.svg');
  assert.equal(post.bannerAlt, 'A Word file turning into Markdown');
  assert.equal(post.featured, true);
  assert.deepEqual(post.figures, ['/blog/word-to-markdown/flow.svg']);
  const [fig] = figureRefs(parseFrontmatter(WITH_VISUALS).body);
  assert.equal(fig.caption, 'Source: [MDify](/)');
});

test('figures: paths must stay in the post folder and need alt text', () => {
  const foreign = WITH_VISUALS.replace('/blog/word-to-markdown/flow.svg', '/blog/other-post/flow.svg');
  assert.throws(() => toDialogPost('word-to-markdown.md', foreign), /must live in \/blog\/word-to-markdown\//);
  const remote = WITH_VISUALS.replace('/blog/word-to-markdown/flow.svg', 'https://example.com/x.svg');
  assert.throws(() => toDialogPost('word-to-markdown.md', remote), /must be a path like/);
  const noAlt = WITH_VISUALS.replace('![Flow from upload to download]', '![]');
  assert.throws(() => toDialogPost('word-to-markdown.md', noAlt), /needs alt text/);
  const { data } = parseFrontmatter(WITH_VISUALS);
  assert.match(validatePost({ ...data, bannerAlt: '' }).join(), /bannerAlt/);
  assert.match(validatePost({ ...data, banner: '/blog/elsewhere/banner.svg' }).join(), /must live in/);
  assert.match(validatePost({ ...data, featured: 'yes' }).join(), /featured/);
});

test('sort: featured posts first, then newest first', () => {
  const posts = [
    { title: 'B', isoDate: '2026-10-03' },
    { title: 'A', isoDate: '2026-09-01', featured: true },
    { title: 'C', isoDate: '2026-10-03' },
  ];
  assert.deepEqual(sortPosts(posts).map((p) => p.title), ['A', 'B', 'C']);
});

test('inspectSvg: accepts plain drawings, refuses anything that runs or loads', () => {
  assert.deepEqual(inspectSvg(SVG), { problems: [], width: 600, height: 300 });
  assert.equal(inspectSvg(SVG.replace('<rect', '<defs><linearGradient id="g"/></defs><rect fill="url(#g)"')).problems.length, 0);
  for (const bad of [
    SVG.replace('<rect', '<script>alert(1)</script><rect'),
    SVG.replace('<rect', '<rect onload="x()"'),
    SVG.replace('<rect', '<image href="https://example.com/a.png"/><rect'),
    SVG.replace('<rect', '<foreignObject></foreignObject><rect'),
    SVG.replace('fill:var', 'fill:url(https://example.com/x);x:var'),
    '<!DOCTYPE svg><svg viewBox="0 0 1 1"></svg>',
    '<div>no</div>',
  ]) {
    assert.ok(inspectSvg(bad).problems.length > 0, bad);
  }
});

test('index: visuals must exist, pass inspection and carry their size', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mdify-blog-'));
  try {
    const content = path.join(dir, 'content');
    const pub = path.join(dir, 'public', 'blog', 'word-to-markdown');
    fs.mkdirSync(content);
    fs.mkdirSync(pub, { recursive: true });
    fs.writeFileSync(path.join(content, 'word-to-markdown.md'), WITH_VISUALS);
    assert.throws(() => buildIndex(content, path.join(dir, 'public')), /banner\.svg does not exist/);
    fs.writeFileSync(path.join(pub, 'banner.svg'), SVG.replace('600 300', '1200 400'));
    fs.writeFileSync(path.join(pub, 'flow.svg'), SVG.replace('<rect', '<script></script><rect'));
    assert.throws(() => buildIndex(content, path.join(dir, 'public')), /flow\.svg contains <script>/);
    fs.writeFileSync(path.join(pub, 'flow.svg'), SVG);
    const [post] = buildIndex(content, path.join(dir, 'public'));
    assert.deepEqual(post.visuals, { '/blog/word-to-markdown/banner.svg': [1200, 400], '/blog/word-to-markdown/flow.svg': [600, 300] });
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('every shipped blog visual is safe to draw inline', () => {
  const root = path.join(PUBLIC_DIR, 'blog');
  if (!fs.existsSync(root)) return;
  for (const slug of fs.readdirSync(root)) {
    for (const file of fs.readdirSync(path.join(root, slug))) {
      const { problems } = inspectSvg(fs.readFileSync(path.join(root, slug, file), 'utf8'));
      assert.deepEqual(problems, [], `public/blog/${slug}/${file}`);
    }
  }
  for (const post of buildIndex()) {
    assert.deepEqual(collectVisuals({ id: post.id, banner: post.banner, figures: Object.keys(post.visuals).filter((s) => s !== post.banner) }).errors, []);
  }
});

// ── Dialog rendering ───────────────────────────────────────────────────────

test('blocks: text, figures and code fences', () => {
  const blocks = blogBlocks('## Why\nText **bold**.\n\n![Chart](/blog/a-post/chart.svg "Source: x")\n\n```py\n![x](/blog/a-post/y.svg)\n```\nAfter.');
  assert.deepEqual(blocks.map((b) => b.type), ['text', 'figure', 'text']);
  assert.equal(blocks[0].lines[0].kind, 'heading');
  assert.deepEqual(blocks[1], { type: 'figure', alt: 'Chart', src: '/blog/a-post/chart.svg', caption: 'Source: x' });
  assert.deepEqual(blocks[2].lines.map((l) => l.kind), ['code', 'code', 'code', 'text']);
  assert.equal(blogBlocks('![x](https://example.com/a.svg)')[0].type, 'text');
});

test('inline: bold, code and only safe links', () => {
  assert.deepEqual(inlineTokens('Use **Compact** with `md` and [the converter](/).'), [
    { t: 'text', v: 'Use ' },
    { t: 'bold', v: 'Compact' },
    { t: 'text', v: ' with ' },
    { t: 'code', v: 'md' },
    { t: 'text', v: ' and ' },
    { t: 'link', v: 'the converter', href: '/', external: false },
    { t: 'text', v: '.' },
  ]);
  assert.deepEqual(inlineTokens('[docs](https://example.com/a)')[0], { t: 'link', v: 'docs', href: 'https://example.com/a', external: true });
  assert.deepEqual(inlineTokens('[x](javascript:alert(1))')[0].t, 'text');
  assert.equal(safeHref('//evil.example'), null);
  assert.equal(safeHref('data:text/html,hi'), null);
});
