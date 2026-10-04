// Turns a post body into the pieces the Blog dialog draws. The dialog keeps
// its plain-Markdown reading style: text stays as written, in the monospace
// face, with headings tinted, **bold** set in bold, `code` tinted and links
// made clickable. Figure lines become inline visuals.
//
// Pure functions, no React and no HTML strings: the dialog maps these tokens
// to elements, so post text is never injected as markup.

import { VISUAL_PATH } from './blog.mjs';

const FIGURE_LINE = /^!\[([^\]]*)\]\((\S+?)(?:\s+"([^"]*)")?\)\s*$/;
const FENCE = /^\s*(```|~~~)/;
const HEADING = /^#{1,6}\s/;

/**
 * Splits a body into blocks: { type: 'text', lines: [{ kind, text }] } and
 * { type: 'figure', alt, src, caption }. Line kinds: 'heading', 'code'
 * (inside a fence, fence markers included) and 'text'. Blank lines at the
 * edges of a text block are dropped (the dialog spaces blocks itself).
 */
export function blogBlocks(content) {
  const blocks = [];
  let lines = [];
  let fence = null;

  const flush = () => {
    while (lines.length && !lines[0].text.trim()) lines.shift();
    while (lines.length && !lines[lines.length - 1].text.trim()) lines.pop();
    if (lines.length) blocks.push({ type: 'text', lines });
    lines = [];
  };

  for (const text of String(content || '').split('\n')) {
    const marker = FENCE.exec(text);
    if (marker) {
      if (!fence) fence = marker[1];
      else if (marker[1] === fence) {
        lines.push({ kind: 'code', text });
        fence = null;
        continue;
      }
    }
    if (fence) {
      lines.push({ kind: 'code', text });
      continue;
    }
    const figure = FIGURE_LINE.exec(text.trim());
    if (figure && VISUAL_PATH.test(figure[2])) {
      flush();
      blocks.push({ type: 'figure', alt: figure[1].trim(), src: figure[2], caption: (figure[3] || '').trim() });
      continue;
    }
    lines.push({ kind: HEADING.test(text) ? 'heading' : 'text', text });
  }
  flush();
  return blocks;
}

/** A link target the dialog may open: a site path or an http(s) URL. */
export function safeHref(href) {
  const value = String(href || '').trim();
  if (/^\/(?!\/)/.test(value)) return { href: value, external: false };
  if (/^https?:\/\/[^\s]+$/i.test(value)) return { href: value, external: true };
  return null;
}

const INLINE = /\*\*([^*\n]+)\*\*|`([^`\n]+)`|\[([^\]\n]+)\]\(([^)\s]+)\)/g;

/**
 * Inline tokens of one text line: { t: 'text', v }, { t: 'bold', v },
 * { t: 'code', v } and { t: 'link', v, href, external }. A link with an
 * unsafe target stays plain text.
 */
export function inlineTokens(line) {
  const tokens = [];
  let last = 0;
  const text = String(line || '');
  for (const match of text.matchAll(INLINE)) {
    if (match.index > last) tokens.push({ t: 'text', v: text.slice(last, match.index) });
    if (match[1] !== undefined) tokens.push({ t: 'bold', v: match[1] });
    else if (match[2] !== undefined) tokens.push({ t: 'code', v: match[2] });
    else {
      const target = safeHref(match[4]);
      tokens.push(target ? { t: 'link', v: match[3], ...target } : { t: 'text', v: match[0] });
    }
    last = match.index + match[0].length;
  }
  if (last < text.length) tokens.push({ t: 'text', v: text.slice(last) });
  return tokens;
}
