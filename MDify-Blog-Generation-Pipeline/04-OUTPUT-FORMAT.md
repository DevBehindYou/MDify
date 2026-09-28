# 04. Output Format

Write the finished article to `frontend/content/blog/{slug}.md`: a YAML
frontmatter block, then the Markdown body. `frontend/lib/blog.mjs` parses and
validates it, and the build fails with a clear message if anything is wrong.

## Frontmatter schema

```yaml
---
title: "How to Convert PDF to Markdown for RAG"   # dialog card title
slug: "pdf-to-markdown-for-rag"        # must equal the file name. Fix at outline, never change.
description: "..."                     # required, 170 characters max, includes the primary keyword
excerpt: "..."                         # required, 1-2 sentences, shown on the featured card
date: "2026-09-26"                     # required, ISO date of first publication
updated: "2026-09-26"                  # optional, ISO date of the last real update
author: "DevBehindYou"                 # required
category: "RAG"                        # required, short label shown as the card badge (RAG, GUIDE, API, OCR)
tags: ["PDF to Markdown", "RAG", "LLM"]   # required, 3 to 6 entries
primaryKeyword: "PDF to Markdown for RAG" # required
secondaryKeywords: ["RAG-ready Markdown"] # optional, up to 4
draft: true                            # true keeps it out of the dialog
---
```

Supported YAML: quoted or bare strings, `[flow, lists]`, `true`/`false`, and
trailing `# comments`. Nothing else (no multi-line strings or nested maps).

## Body rules

- The first line must be `**TL;DR:** ...`. The dialog lifts it into its own
  card and shows the rest as the article.
- Use `##` for sections and `###` for sub-points.
- Fenced code blocks with a language tag (` ```bash `, ` ```python `, ` ```json `).
- Simple GFM tables. Inline links as `[text](url)`.
- No images or diagrams. The dialog shows the body as plain Markdown text.
- End with `## Frequently Asked Questions` (each question as `###`) and a CTA
  line linking to `/` and `/usecase`.

## How it appears in the Blog dialog

| Dialog element | Comes from |
|---|---|
| Featured card (newest post) title, badge, date, read time, text | `title`, `category`, `date`, computed read time, `excerpt` |
| Grid cards | `category`, `title`, `date`, computed read time |
| Reader view header | `category`, `date`, read time, `author`, `title` |
| TL;DR card | the `**TL;DR:**` line |
| Article text | the rest of the body, as plain Markdown |
| "N posts published" | the number of posts with `draft: false` |

Posts are ordered by `date`, newest first. Read time is the word count divided
by 230, rounded, with a minimum of 1 minute.

## Publishing

From `frontend/`:

```bash
npm run blog:index
```

This writes `frontend/lib/blogPosts.generated.json`. Commit it together with
the `.md` file. `npm run dev` and `npm run build` run the same step
automatically, and `npm test` fails if the committed JSON is stale.
