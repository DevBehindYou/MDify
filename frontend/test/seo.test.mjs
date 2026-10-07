// Public copy, SEO files and structured data (lib/siteContent.js, app/robots.js,
// app/sitemap.js, public/llms.txt, README.md).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { FAQS, TOKEN_EXAMPLE, faqJsonLd, savedPercent, siteJsonLd } from '../lib/siteContent.js';
import robots from '../app/robots.js';
import sitemap from '../app/sitemap.js';

const FRONTEND = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => fs.readFileSync(path.resolve(FRONTEND, rel), 'utf8');

// Owner's rule: public pages describe features, not the engines or hosting
// behind them. Only the Terms and Privacy Policy credit the open-source engines.
const PUBLIC_COPY = [
  '../README.md',
  'public/llms.txt',
  'app/layout.js',
  'app/usecase/page.js',
  'app/usecase/UseCaseClient.js',
  'components/converter/LandingWorkspace.js',
  'components/converter/MobileWorkspace.js',
  'components/MarkDifyFooter.js',
  'components/MarkdownSkeleton.js',
  'lib/models/sessionRepository.js',
  'lib/siteContent.js',
];

test('public copy names no conversion engine or backend service', () => {
  for (const file of PUBLIC_COPY) {
    const text = read(file);
    for (const pattern of [/markitdown/i, /tesseract/i, /supabase/i, /Render Free|render\.com|onrender/i, /110K/]) {
      assert.doesNotMatch(text, pattern, `${file} mentions ${pattern}`);
    }
  }
  assert.doesNotMatch(JSON.stringify(siteJsonLd()), /MarkItDown|Tesseract|Supabase/);
});

test('the 70% claim follows from the cited arithmetic', () => {
  assert.equal(TOKEN_EXAMPLE.markdown, Math.round((500 * 100) / 75)); // 100 tokens ≈ 75 words
  assert.equal(savedPercent(TOKEN_EXAMPLE.pdfStandard), 70);
  assert.equal(savedPercent(TOKEN_EXAMPLE.pdfHighRes), 80);
  const readme = read('../README.md');
  for (const figure of ['667', '2,235', '3,381', '70%', '80%']) assert.ok(readme.includes(figure), figure);
});

test('FAQ structured data matches the visible FAQ', () => {
  const data = faqJsonLd();
  assert.equal(data['@type'], 'FAQPage');
  assert.deepEqual(data.mainEntity.map((q) => q.name), FAQS.map((f) => f.q));
  for (const { q, a } of FAQS) {
    assert.ok(!/[—;]/.test(q + a), `no em dash or semicolon: ${q}`);
    const words = a.split(/\s+/).length;
    assert.ok(words >= 30 && words <= 70, `${q}: ${words} words`);
  }
});

test('crawlers may read public pages, never the admin or the API', () => {
  const { rules, sitemap: map } = robots();
  for (const rule of rules) {
    assert.ok(rule.disallow.includes('/mdify-controller') && rule.disallow.includes('/api/'));
  }
  const agents = rules.flatMap((r) => [].concat(r.userAgent));
  for (const bot of ['GPTBot', 'OAI-SearchBot', 'PerplexityBot', 'ClaudeBot', 'Google-Extended']) assert.ok(agents.includes(bot), bot);
  assert.ok(map.endsWith('/sitemap.xml'));
  const urls = sitemap().map((e) => e.url);
  assert.ok(urls.every((u) => u.startsWith('https://mdify.devbehindyou.com')));
  assert.ok(!urls.some((u) => u.includes('mdify-controller')));
});

test('site structured data describes a free web app', () => {
  const graph = siteJsonLd()['@graph'];
  const app = graph.find((n) => n['@type'] === 'WebApplication');
  assert.equal(app.offers.price, '0');
  assert.equal(app.isAccessibleForFree, true);
  assert.ok(graph.some((n) => n['@type'] === 'WebSite') && graph.some((n) => n['@type'] === 'Organization'));
});
