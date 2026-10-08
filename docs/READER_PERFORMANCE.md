# Deferred converter reader

Measured on 2026-10-08 with Node 22.16.0, Next 14.2.35 and the unchanged npm lockfile, using `npm run build` in a clean isolated worktree based on `28c22fe`. No mocked fonts or production source configuration was used.

| Production build measurement | Before | After |
| --- | ---: | ---: |
| Next converter first-load JS | 187 kB | 128 kB |
| Next converter route size | 76.5 kB | 16.3 kB |
| Initial layout + converter JS files, raw bytes | 665,239 | 459,401 |
| Same unique files, individually gzipped bytes | 196,740 | 131,899 |

The Next first-load estimate falls approximately 32%. The independently summed gzip file bytes fall 64,841 bytes (33%). These are build size measurements, not measured page latency, bandwidth consumption, interaction latency or a promise of the same percentage speed improvement. The manifest calculation unions `/layout` and `/page` JavaScript files, removes duplicate paths and compresses each file independently using Node's default gzip settings. It excludes CSS, fonts, prefetched pages and subsequently requested chunks.

`MarkdownViewer` retains its editor, status bar, empty/converting states and edit debounce. Its populated split/rendered view mounts a lazy Markdown renderer; raw-only, empty and busy views do not request that renderer. The renderer loads Prism and the existing language grammars only when a code block mounts. Source text and code copy remain available while highlighting loads. A failed renderer shows selectable plain text with an explanation; Raw mode and export remain outside that error boundary. A failed highlighter renders escaped React text instead of treating the source as HTML.

The existing desktop and mobile components share this viewer. Article pages continue to render Markdown on the server and are not converted into client-only pages. There are no database migrations, environment changes, new dependencies or worker changes.

## Validation

Focused runtime JSX tests use the existing Next compiler and React server renderer. They cover empty/busy/raw modes, initial split/rendered text fallback, GFM headings/tables/strikethrough, links, Unicode, escaped hostile source and highlighter languages/failure. Existing archive download/export model tests remain applicable. Lint and the production build pass.

The full six-job CI and browser interaction checks are required before merging. Large-document parsing, centralized statistics, immediate edit/export synchronization and worker-based preview parsing remain separate workstreams; this change does not claim to resolve them.
