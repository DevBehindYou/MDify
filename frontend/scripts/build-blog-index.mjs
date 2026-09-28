// Compiles content/blog/*.md into lib/blogPosts.generated.json, the post list
// the Blog dialog (components/BlogModal.js) imports.
//
//   node scripts/build-blog-index.mjs          write the file
//   node scripts/build-blog-index.mjs --check  exit 1 if the file is stale
//
// Runs automatically before `npm run dev` and `npm run build`. Drafts
// (draft: true) are left out. An invalid post stops the build with a message
// that names the file and every problem.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { sortPosts, toDialogPost } from '../lib/blog.mjs';

const FRONTEND = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const CONTENT_DIR = path.join(FRONTEND, 'content', 'blog');
export const OUTPUT_FILE = path.join(FRONTEND, 'lib', 'blogPosts.generated.json');

// Only what the dialog renders; keeps its lazily loaded chunk small.
const DIALOG_FIELDS = ['id', 'title', 'tag', 'date', 'readTime', 'summary', 'author', 'tldr', 'content'];

function isPostFile(name) {
  return name.endsWith('.md') && !name.startsWith('_') && name.toLowerCase() !== 'readme.md';
}

/** Published posts, newest first, in the dialog's shape. Throws on invalid posts. */
export function buildIndex(contentDir = CONTENT_DIR) {
  const files = fs.existsSync(contentDir) ? fs.readdirSync(contentDir).filter(isPostFile).sort() : [];
  const posts = [];
  const errors = [];
  for (const name of files) {
    try {
      posts.push(toDialogPost(name, fs.readFileSync(path.join(contentDir, name), 'utf8')));
    } catch (err) {
      errors.push(err.message);
    }
  }
  if (errors.length) throw new Error(`Invalid blog posts:\n  ${errors.join('\n  ')}`);
  return sortPosts(posts.filter((post) => !post.draft)).map((post) =>
    Object.fromEntries(DIALOG_FIELDS.map((key) => [key, post[key]]))
  );
}

export function serialize(posts) {
  return `${JSON.stringify(posts, null, 2)}\n`;
}

function main(argv) {
  let output;
  try {
    output = serialize(buildIndex());
  } catch (err) {
    console.error(err.message);
    return 1;
  }
  const current = fs.existsSync(OUTPUT_FILE) ? fs.readFileSync(OUTPUT_FILE, 'utf8') : null;
  const relative = path.relative(FRONTEND, OUTPUT_FILE);
  if (argv.includes('--check')) {
    if (current === output) return 0;
    console.error(`${relative} is out of date. Run: npm run blog:index`);
    return 1;
  }
  if (current !== output) fs.writeFileSync(OUTPUT_FILE, output);
  console.log(`${relative}: ${JSON.parse(output).length} published post(s)`);
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = main(process.argv.slice(2));
}
