import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import React from 'react';
import { renderToStaticMarkup, renderToString } from 'react-dom/server';
import { createRequire } from 'node:module';
import { highlightCode } from '../lib/highlightCode.js';

// Exercise the actual JSX components using Next's already-pinned compiler,
// without introducing a second renderer or new test dependencies.
const require = createRequire(import.meta.url);
const { transform } = require('next/dist/build/swc');
const generated = fs.mkdtempSync(path.join(path.dirname(fileURLToPath(import.meta.url)), '.reader-runtime-'));
after(() => fs.rmSync(generated, { recursive: true, force: true }));
const components = ['MarkdownViewer', 'RenderedMarkdown', 'PreviewBoundary', 'OutputStatusBar', 'MarkdownSkeleton'];
for (const name of components) {
  let source = fs.readFileSync(new URL(`../components/${name}.js`, import.meta.url), 'utf8');
  for (const component of components) source = source.replaceAll(`'./${component}'`, `'./${component}.mjs'`);
  source = source.replaceAll("'../lib/highlightCode'", JSON.stringify(new URL('../lib/highlightCode.js', import.meta.url).href));
  const compiled = await transform(source, { filename: `${name}.js`, jsc: { parser: { syntax: 'ecmascript', jsx: true }, transform: { react: { runtime: 'automatic' } } }, module: { type: 'es6' } });
  fs.writeFileSync(path.join(generated, `${name}.mjs`), compiled.code);
}
const load = async name => (await import(pathToFileURL(path.join(generated, `${name}.mjs`)))).default;
const Viewer = await load('MarkdownViewer');
const RenderedMarkdown = await load('RenderedMarkdown');
const { PlainTextPreview } = await import(pathToFileURL(path.join(generated, 'PreviewBoundary.mjs')));
const render = (Component, props) => renderToStaticMarkup(React.createElement(Component, props));

test('empty, busy and raw viewer modes keep their existing shell without starting a formatted preview', () => {
  assert.match(render(Viewer, {}), /Your Markdown appears here/);
  const busy = render(Viewer, { isLoading: true, loadingFileName: 'report.pdf', content: '# stale' });
  assert.doesNotMatch(busy, /stale|Loading formatted preview/);
  const raw = render(Viewer, { content: '# 原文 🙂\n<script>alert(1)</script>', viewMode: 'raw' });
  assert.match(raw, /<textarea/);
  assert.match(raw, /原文 🙂/);
  assert.match(raw, /&lt;script&gt;/);
  assert.doesNotMatch(raw, /Loading formatted preview|<h1/);
});

test('the first formatted/split preview preserves selectable escaped text while its module loads', () => {
  for (const viewMode of ['rendered', 'split']) {
    const html = renderToString(React.createElement(Viewer, { viewMode, content: '# 原文\n<script>alert(1)</script>' }));
    assert.match(html, /Loading formatted preview/);
    assert.match(html, /# 原文/);
    assert.match(html, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
    assert.doesNotMatch(html, /<script>alert/);
    assert.equal(html.includes('<textarea'), viewMode === 'split');
  }
});

test('loaded renderer preserves headings, GFM tables, strikethrough, links and Unicode code text', () => {
  const html = render(RenderedMarkdown, { content: '# Heading\n\n~~removed~~\n\n| A | B |\n| - | - |\n| 漢字 | 🙂 |\n\n[link](https://example.test)\n\n```python\nprint("漢字 🙂")\n```' });
  assert.match(html, /<h1[^>]*>Heading<\/h1>/);
  assert.match(html, /<del>removed<\/del>/);
  assert.match(html, /<table/);
  assert.match(html, /漢字/);
  assert.match(html, /🙂/);
  assert.match(html, /rel="noopener noreferrer"/);
  assert.match(html, /Copy code snippet/);
  assert.match(html, /print\(&quot;漢字 🙂&quot;\)/);
});

test('unhighlighted code and failed-preview fallback cannot inject HTML', () => {
  const text = '<img src=x onerror=alert(1)> & 原文';
  const code = render(RenderedMarkdown, { content: '```html\n' + text + '\n```' });
  const failed = render(PlainTextPreview, { content: text });
  for (const html of [code, failed]) {
    assert.match(html, /&lt;img/);
    assert.doesNotMatch(html, /<img src=x/);
  }
  assert.match(failed, /Formatted preview is unavailable/);
  assert.match(failed, /still edit in Raw mode and export/);
  assert.doesNotMatch(render(RenderedMarkdown, { content: '[bad](javascript:alert(1))\n\n<script>alert(1)</script>' }), /href="javascript:|<script>/);
});

test('lazy highlighter retains supported languages and aliases while escaping source', () => {
  for (const language of ['js', 'ts', 'py', 'sh', 'shell', 'zsh', 'yml', 'md', 'html', 'xml', 'svg', 'json', 'sql', 'unknown']) {
    const html = highlightCode('<script> const x = "漢字🙂"; </script>', language);
    assert.equal(typeof html, 'string', language);
    assert.doesNotMatch(html, /<script>/, language);
    assert.match(html, /漢字🙂/, language);
  }
});

test('a highlighter failure requests the safe React text fallback', () => {
  const Prism = require('prismjs');
  const original = Prism.highlight;
  try {
    Prism.highlight = () => { throw new Error('synthetic optional highlighter failure'); };
    assert.equal(highlightCode('<img src=x onerror=alert(1)>', 'html'), null);
  } finally { Prism.highlight = original; }
});
