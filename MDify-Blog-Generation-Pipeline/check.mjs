#!/usr/bin/env node
// Quality scan for one finished MDify article.
//
//   node MDify-Blog-Generation-Pipeline/check.mjs frontend/content/blog/{slug}.md
//
// Errors must be fixed before publishing (exit code 1). Warnings need a human
// decision. The report is printed and saved to Outputs/{slug}.check.txt.
// Frontmatter is validated by frontend/lib/blog.mjs, the same code the app
// build uses, so a post that passes here also passes `npm run blog:index`.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseFrontmatter, toDialogPost, wordCount } from '../frontend/lib/blog.mjs';

const PIPELINE_DIR = path.dirname(fileURLToPath(import.meta.url));

// Keep in sync with 01-STYLE-RULES.md.
const BANNED_WORDS = `peril fraught thwart dire vibrant bustling essential vital crucial soul crucible
tapestry landscape pesky reverberate enhance emphasise delve revolutionize folks foster labyrinthine
labyrinth remnant nestled symphony gossamer enigma metamorphosis indelible embark navigate navigating
mastering elevate unleash harness meticulous meticulously complexities realm tailored underpins
everchanging ever-evolving daunting amongst robust seamless seamlessly leverage unlock game-changer
revolutionary cutting-edge firstly moreover furthermore additionally consequently nonetheless notably
essentially subsequently arguably ultimately`.split(/\s+/);

const BANNED_PHRASES = ["in today's world", 'in today’s world', 'at the end of the day', 'needless to say',
  "it's worth noting", 'it’s worth noting', 'it is worth noting', 'that being said', 'it is advisable',
  'when it comes to', 'in conclusion', 'in order to', 'not only'];

const WORDS_MIN = 1200;
const WORDS_MAX = 2000;
const LONG_SENTENCE = 35;

/** Body text a reader sees as prose: no fenced code, inline code or link targets. */
function prose(body) {
  return body
    .replace(/^(```|~~~)[\s\S]*?^\1\s*$/gm, ' ')
    .replace(/`[^`\n]*`/g, ' ')
    .replace(/\]\([^)]*\)/g, ']');
}

function lineOf(text, index) {
  return text.slice(0, index).split('\n').length;
}

function sentences(text) {
  return text
    .replace(/^#{1,6}\s.*$/gm, '')
    .replace(/^\s*([-*+]|\d+\.)\s+/gm, '')
    .replace(/^\|.*\|$/gm, '')
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.replace(/\s+/g, ' ').trim())
    .filter((s) => /[a-z]/i.test(s));
}

export function checkArticle(filePath, source) {
  const errors = [];
  const warnings = [];
  const fileName = path.basename(filePath);

  let post = null;
  try {
    post = toDialogPost(fileName, source);
  } catch (err) {
    errors.push(err.message.replace(/^content\/blog\/[^:]+: /, 'Frontmatter: '));
  }

  let data = {};
  let body = source;
  try {
    ({ data, body } = parseFrontmatter(source));
  } catch {
    // Already reported above.
  }
  const text = prose(body);
  const visible = [data.title, data.description, data.excerpt, text].filter(Boolean).join('\n');

  // Punctuation.
  const dashes = [...visible.matchAll(/—/g)].length;
  if (dashes) errors.push(`${dashes} em dash(es). Use a colon, period, comma or "and".`);
  const semis = [...text.replace(/TL;DR/g, '').matchAll(/;/g)].map((m) => lineOf(text, m.index));
  if (semis.length) errors.push(`${semis.length} semicolon(s) in prose, body lines ${semis.join(', ')}.`);

  // Vocabulary and brand.
  const lower = visible.toLowerCase();
  const words = BANNED_WORDS.filter((w) => new RegExp(`(^|[^a-z-])${w}($|[^a-z-])`, 'i').test(visible));
  const phrases = BANNED_PHRASES.filter((p) => lower.includes(p));
  if (words.length || phrases.length) errors.push(`Banned vocabulary: ${[...words, ...phrases].join(', ')}.`);
  if (/markdify/i.test(source)) errors.push('Brand: write "MDify", never "MarkDify".');
  // Owner's rule (2026-09-28): articles describe what MDify does, never the
  // engines or hosting behind it. Only the Terms and Privacy Policy credit them.
  const engines = ['MarkItDown', 'Tesseract', 'Supabase', 'Render.com', 'onrender'].filter((n) => new RegExp(n.replace('.', '\\.'), 'i').test(source));
  if (engines.length) errors.push(`Don't name the engines or hosting behind MDify: ${engines.join(', ')}.`);
  if (/\]\(https?:\/\/(www\.)?markdify\./i.test(source)) errors.push('Links point to markdify.com, which is not MDify.');

  // Structure.
  if (/!\[[^\]]*\]\(/.test(text)) errors.push('Images do not render in the Blog dialog. Remove them.');
  if (!/^## Frequently Asked Questions\s*$/m.test(body)) errors.push('Missing "## Frequently Asked Questions" section.');
  const faqStart = body.search(/^## Frequently Asked Questions\s*$/m);
  if (faqStart !== -1) {
    const faqs = body.slice(faqStart).split(/^## /m)[1] || '';
    const count = (faqs.match(/^### /gm) || []).length;
    if (count < 5 || count > 6) warnings.push(`${count} FAQ question(s). Aim for 5 or 6.`);
  }
  if (!/\]\(\/\)/.test(body)) warnings.push('No link to the converter "(/)".');
  if (!/\]\(\/usecase\)/.test(body)) warnings.push('No link to "(/usecase)".');

  // Length and rhythm.
  const count = wordCount(body);
  if (count < WORDS_MIN || count > WORDS_MAX) warnings.push(`${count} words. Target ${WORDS_MIN} to ${WORDS_MAX}.`);
  const list = sentences(text);
  const long = list.filter((s) => s.split(' ').length > LONG_SENTENCE);
  if (long.length) warnings.push(`${long.length} sentence(s) over ${LONG_SENTENCE} words, e.g. "${long[0].slice(0, 80)}..."`);
  const lengths = list.map((s) => s.split(' ').length);
  for (let i = 2; i < lengths.length; i += 1) {
    const window = lengths.slice(i - 2, i + 1);
    if (Math.max(...window) - Math.min(...window) <= 2) {
      warnings.push(`Three sentences in a row of similar length, starting "${list[i - 2].slice(0, 60)}..."`);
      break;
    }
  }

  // Metadata.
  if (typeof data.title === 'string' && data.title.length > 60) warnings.push(`Title is ${data.title.length} characters. Aim for 60 or fewer.`);
  if (data.primaryKeyword && data.description && !data.description.toLowerCase().includes(String(data.primaryKeyword).toLowerCase())) {
    warnings.push('Description does not contain the primary keyword.');
  }
  if (data.author && data.author !== 'DevBehindYou') warnings.push(`Author is "${data.author}". Use a real, named person or DevBehindYou.`);
  if (data.draft === true) warnings.push('draft: true. The post stays out of the Blog dialog until you set it to false.');

  return { post, errors, warnings, words: count };
}

function report(filePath, result) {
  const lines = [
    `MDify article check: ${filePath}`,
    `Date: ${new Date().toISOString()}`,
    `Words: ${result.words}${result.post ? `, read time ${result.post.readTime}` : ''}`,
    '',
    `Errors (${result.errors.length}):`,
    ...(result.errors.length ? result.errors.map((e) => `  x ${e}`) : ['  none']),
    '',
    `Warnings (${result.warnings.length}):`,
    ...(result.warnings.length ? result.warnings.map((w) => `  ! ${w}`) : ['  none']),
    '',
    result.errors.length ? 'RESULT: FAIL. Fix every error, then run the check again.' : 'RESULT: PASS',
  ];
  return `${lines.join('\n')}\n`;
}

function main(argv) {
  const target = argv.find((arg) => !arg.startsWith('--'));
  if (!target) {
    console.error('Usage: node MDify-Blog-Generation-Pipeline/check.mjs frontend/content/blog/{slug}.md [--no-report]');
    return 2;
  }
  if (!fs.existsSync(target)) {
    console.error(`File not found: ${target}`);
    return 2;
  }
  const result = checkArticle(target, fs.readFileSync(target, 'utf8'));
  const text = report(target, result);
  process.stdout.write(text);
  if (!argv.includes('--no-report')) {
    const out = path.join(PIPELINE_DIR, 'Outputs', `${path.basename(target, '.md')}.check.txt`);
    fs.writeFileSync(out, text);
    console.log(`Saved ${path.relative(process.cwd(), out)}`);
  }
  return result.errors.length ? 1 : 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = main(process.argv.slice(2));
}
