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

export const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
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
    draft: data.draft === true,
  };
}

/** Newest first; ties by title so the order is stable. */
export function sortPosts(posts) {
  return [...posts].sort((a, b) =>
    a.isoDate < b.isoDate ? 1 : a.isoDate > b.isoDate ? -1 : a.title.localeCompare(b.title)
  );
}
