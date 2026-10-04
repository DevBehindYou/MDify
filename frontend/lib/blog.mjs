// Blog posts for the Blog dialog (components/BlogModal.js).
//
// Posts are Markdown files with a YAML frontmatter block in content/blog/,
// written by the MDify-Blog-Generation-Pipeline at the repo root.
// scripts/build-blog-index.mjs turns them into lib/blogPosts.generated.json,
// which the dialog imports. This module has no file-system access, so the
// build script, the tests and the pipeline's check script all share it.
//
// The frontmatter parser handles the subset the pipeline writes (quoted or
// bare strings, [flow, arrays], booleans, trailing # comments). It keeps the
// blog free of a YAML dependency.
//
// Visuals: a post may set a `banner` and place figures in its body as
// `![alt](/blog/{slug}/{name}.svg "caption")` on a line of their own. Both
// are first-party SVG files in public/blog/{slug}/ that the dialog draws
// inline, so they follow the app's light and dark theme.

export const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
export const VISUAL_PATH = /^\/blog\/([a-z0-9]+(?:-[a-z0-9]+)*)\/[a-z0-9]+(?:-[a-z0-9]+)*\.svg$/;
const FIGURE_LINE = /^!\[([^\]]*)\]\((\S+?)(?:\s+"([^"]*)")?\)\s*$/;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const WORDS_PER_MINUTE = 230;

// ── Frontmatter ────────────────────────────────────────────────────────────

function readQuoted(text, quote) {
  let out = '';
  for (let i = 1; i < text.length; i += 1) {
    const ch = text[i];
    if (quote === '"' && ch === '\\' && i + 1 < text.length) {
      const next = text[i + 1];
      out += next === 'n' ? '\n' : next;
      i += 1;
    } else if (ch === quote) {
      if (quote === "'" && text[i + 1] === "'") {
        out += "'";
        i += 1;
      } else {
        return { value: out, rest: text.slice(i + 1) };
      }
    } else {
      out += ch;
    }
  }
  throw new Error(`Unterminated ${quote} string`);
}

function stripComment(text) {
  const hash = text.search(/\s#/);
  return (hash === -1 ? text : text.slice(0, hash)).trim();
}

function scalar(raw) {
  const text = stripComment(raw);
  if (text === 'true') return true;
  if (text === 'false') return false;
  return text;
}

function parseArray(text) {
  const items = [];
  let rest = text.slice(1).trim();
  while (rest.length) {
    if (rest[0] === ']') return items;
    if (rest[0] === '"' || rest[0] === "'") {
      const { value, rest: after } = readQuoted(rest, rest[0]);
      items.push(value);
      rest = after.trim();
    } else {
      const end = rest.search(/[,\]]/);
      if (end === -1) break;
      const item = rest.slice(0, end).trim();
      if (item) items.push(item);
      rest = rest.slice(end);
    }
    if (rest[0] === ',') rest = rest.slice(1).trim();
  }
  throw new Error('Unterminated [array]');
}

function parseValue(raw) {
  const text = raw.trim();
  if (text.startsWith('"') || text.startsWith("'")) return readQuoted(text, text[0]).value;
  if (text.startsWith('[')) return parseArray(text);
  return scalar(text);
}

/** Splits a post file into { data, body }. Throws on malformed frontmatter. */
export function parseFrontmatter(source) {
  const text = source.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
  if (!text.startsWith('---\n')) throw new Error('Missing frontmatter block (the file must start with ---)');
  const end = text.indexOf('\n---', 4);
  if (end === -1) throw new Error('Frontmatter block is not closed with ---');
  const data = {};
  text
    .slice(4, end)
    .split('\n')
    .forEach((line, i) => {
      if (!line.trim() || line.trim().startsWith('#')) return;
      const match = /^([A-Za-z][A-Za-z0-9_]*):(.*)$/.exec(line);
      if (!match) throw new Error(`Frontmatter line ${i + 2} is not "key: value": ${line}`);
      try {
        data[match[1]] = parseValue(match[2]);
      } catch (err) {
        throw new Error(`Frontmatter "${match[1]}": ${err.message}`);
      }
    });
  const body = text.slice(end + 4).replace(/^[^\n]*\n/, '');
  return { data, body };
}

// ── Validation ─────────────────────────────────────────────────────────────

const REQUIRED_STRINGS = ['title', 'slug', 'description', 'excerpt', 'date', 'author', 'category', 'primaryKeyword'];

/** Returns a list of problems with a post's frontmatter (empty when valid). */
export function validatePost(data, { fileSlug } = {}) {
  const errors = [];
  for (const key of REQUIRED_STRINGS) {
    if (typeof data[key] !== 'string' || !data[key].trim()) errors.push(`"${key}" is required`);
  }
  if (data.slug && !SLUG_PATTERN.test(data.slug)) errors.push('"slug" must be lowercase words joined by hyphens');
  if (fileSlug && data.slug && data.slug !== fileSlug) errors.push(`"slug" (${data.slug}) must match the file name (${fileSlug}.md)`);
  if (typeof data.description === 'string' && data.description.length > 170) {
    errors.push(`"description" is ${data.description.length} characters (max 170)`);
  }
  for (const key of ['date', 'updated']) {
    if (data[key] !== undefined && !(typeof data[key] === 'string' && DATE_PATTERN.test(data[key]) && !Number.isNaN(Date.parse(data[key])))) {
      errors.push(`"${key}" must be an ISO date (YYYY-MM-DD)`);
    }
  }
  if (data.updated && data.date && data.updated < data.date) errors.push('"updated" is earlier than "date"');
  if (!Array.isArray(data.tags) || data.tags.length < 3 || data.tags.length > 6) errors.push('"tags" needs 3 to 6 entries');
  if (data.secondaryKeywords !== undefined && (!Array.isArray(data.secondaryKeywords) || data.secondaryKeywords.length > 4)) {
    errors.push('"secondaryKeywords" must be a list of at most 4');
  }
  if (data.draft !== undefined && typeof data.draft !== 'boolean') errors.push('"draft" must be true or false');
  if (data.featured !== undefined && typeof data.featured !== 'boolean') errors.push('"featured" must be true or false');
  if (data.banner !== undefined) {
    const owner = typeof data.banner === 'string' ? VISUAL_PATH.exec(data.banner) : null;
    if (!owner) errors.push('"banner" must be a path like /blog/{slug}/banner.svg');
    else if (data.slug && owner[1] !== data.slug) errors.push(`"banner" must live in /blog/${data.slug}/`);
    if (typeof data.bannerAlt !== 'string' || !data.bannerAlt.trim()) errors.push('"bannerAlt" is required with a banner');
  }
  return errors;
}

/**
 * Figures placed in a post body: lines of the form ![alt](src "caption"),
 * outside code fences. Returns [{ alt, src, caption, line }] in order.
 */
export function figureRefs(body) {
  const figures = [];
  let fence = null;
  body.split('\n').forEach((line, i) => {
    const marker = /^\s*(```|~~~)/.exec(line);
    if (marker) {
      if (!fence) fence = marker[1];
      else if (marker[1] === fence) fence = null;
      return;
    }
    if (fence) return;
    const match = FIGURE_LINE.exec(line.trim());
    if (match) figures.push({ alt: match[1].trim(), src: match[2], caption: (match[3] || '').trim(), line: i + 1 });
  });
  return figures;
}

/**
 * Problems that keep an SVG file from being drawn inline in the dialog: it
 * must be a plain <svg> with a viewBox and nothing that runs or loads code.
 * Returns { problems, width, height }.
 */
export function inspectSvg(text) {
  const problems = [];
  const source = String(text).replace(/^﻿/, '').trim();
  if (!source.startsWith('<svg')) problems.push('must start with <svg');
  const box = /<svg\b[^>]*\bviewBox="\s*0\s+0\s+(\d+(?:\.\d+)?)\s+(\d+(?:\.\d+)?)\s*"/.exec(source);
  if (!box) problems.push('needs viewBox="0 0 W H" on the <svg> element');
  if (/<script\b/i.test(source)) problems.push('contains <script>');
  if (/<foreignObject\b/i.test(source)) problems.push('contains <foreignObject>');
  if (/\son[a-z]+\s*=/i.test(source)) problems.push('contains an on* event attribute');
  if (/(?:href|src)\s*=\s*["']\s*(?!#)/i.test(source)) problems.push('links to another resource (only #fragment links are allowed)');
  if (/url\(\s*["']?\s*(?!#)/i.test(source)) problems.push('uses url() with a non-fragment target');
  if (/<!DOCTYPE|<!ENTITY/i.test(source)) problems.push('contains a DOCTYPE or ENTITY');
  return { problems, width: box ? Number(box[1]) : null, height: box ? Number(box[2]) : null };
}

/** Problems with a post's figures: each needs alt text and a path in /blog/{slug}/. */
export function validateFigures(figures, slug) {
  const errors = [];
  for (const fig of figures) {
    const owner = VISUAL_PATH.exec(fig.src);
    if (!owner) errors.push(`figure "${fig.src}" must be a path like /blog/${slug}/{name}.svg`);
    else if (owner[1] !== slug) errors.push(`figure "${fig.src}" must live in /blog/${slug}/`);
    if (!fig.alt) errors.push(`figure "${fig.src}" needs alt text`);
  }
  return errors;
}

// ── Dialog post ─────────────────────────────────────────────────────────────

export function wordCount(body) {
  return body
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/[#>*_`|[\]()-]/g, ' ')
    .split(/\s+/)
    .filter(Boolean).length;
}

export function readingMinutes(body) {
  return Math.max(1, Math.round(wordCount(body) / WORDS_PER_MINUTE));
}

const TLDR_LINE = /^\*\*TL;DR:?\*\*:?\s*(.+)$/;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "2026-03-12" -> "Mar 12", the dialog's date style. */
export function dateLabel(isoDate) {
  const [, month, day] = isoDate.split('-').map(Number);
  return `${MONTHS[month - 1]} ${day}`;
}

/** Leading "**TL;DR:** ..." line, split from the rest of the body. */
export function splitTldr(body) {
  const lines = body.replace(/^\n+/, '').split('\n');
  const match = TLDR_LINE.exec(lines[0] || '');
  if (!match) return { tldr: '', content: body.trim() };
  return { tldr: match[1].trim(), content: lines.slice(1).join('\n').trim() };
}

/**
 * Parses and validates one post file and returns the shape BlogModal reads.
 * Throws with the file name and every problem when the post is invalid.
 */
export function toDialogPost(fileName, source) {
  const fileSlug = fileName.replace(/\.md$/, '');
  let parsed;
  try {
    parsed = parseFrontmatter(source);
  } catch (err) {
    throw new Error(`content/blog/${fileName}: ${err.message}`);
  }
  const { data, body } = parsed;
  const errors = validatePost(data, { fileSlug });
  const { tldr, content } = splitTldr(body);
  if (!tldr) errors.push('the body must start with a "**TL;DR:** ..." line');
  const figures = figureRefs(content);
  errors.push(...validateFigures(figures, data.slug || fileSlug));
  if (errors.length) throw new Error(`content/blog/${fileName}: ${errors.join('; ')}`);
  return {
    id: data.slug,
    title: data.title,
    tag: data.category,
    date: dateLabel(data.date),
    isoDate: data.date,
    updated: data.updated || null,
    readTime: `${readingMinutes(body)} min`,
    summary: data.excerpt,
    description: data.description,
    author: data.author,
    tags: data.tags,
    tldr,
    content,
    banner: data.banner || null,
    bannerAlt: data.banner ? data.bannerAlt : null,
    figures: figures.map((fig) => fig.src),
    featured: data.featured === true,
    draft: data.draft === true,
  };
}

/** Featured posts first, then newest first; ties by title so the order is stable. */
export function sortPosts(posts) {
  return [...posts].sort((a, b) => {
    if (Boolean(a.featured) !== Boolean(b.featured)) return a.featured ? -1 : 1;
    return a.isoDate < b.isoDate ? 1 : a.isoDate > b.isoDate ? -1 : a.title.localeCompare(b.title);
  });
}
