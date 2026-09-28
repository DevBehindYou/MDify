# MDify Blog-Generation Pipeline

A repeatable, human-in-the-loop workflow for writing accurate MDify articles
and publishing them in the **Blog dialog** of the app (the popup behind the
"Blog" link in the header and footer).

This is a content tool you run in your editor or Claude Code. Nothing in this
folder ships to the browser. The app only reads the finished Markdown files in
`frontend/content/blog/`.

Adapted from the DevBehindYou blog builders (8-phase SOP, GEO strategy and
humanization rules), tuned for MDify's product, voice and publishing path.

## The pipeline (run the phases in order)

```
Topic -> Keyword research -> Outline -> Source research -> Draft ->
Code examples -> SEO/GEO metadata -> Fact check -> Internal links ->
Quality check (check.mjs) -> Output (frontend/content/blog/{slug}.md) ->
Publish (npm run blog:index, commit, push)
```

1. **Topic.** Pick one from `topics.md` or propose one for MDify's readers
   (AI/RAG/LLM builders, developers, document workflows). Fix a URL-safe
   `{slug}` now and never change it. Create the working folder
   `Blogs/{slug}/`.
2. **Keyword research.** Confirm one primary keyword and up to 4 secondaries
   against live search results (see `02-SEO-GEO.md`). Save the notes in
   `Blogs/{slug}/research.md`: queries, date, what competing pages cover and
   the gap MDify can fill.
3. **Outline.** Title, TL;DR, 4 to 6 `##` sections (each opening with a 25 to
   40 word answer), 5 or 6 FAQs, and the frontmatter from `04-OUTPUT-FORMAT.md`.
   Save as `Blogs/{slug}/outline.md`.
4. **Source research.** Collect a primary source for every claim. Prefer
   official docs and the MDify repo itself (research only: articles never name
   the engines behind MDify) and
   references dated 2024 to 2026. List them in `Blogs/{slug}/sources.md`.
5. **Draft.** 1,200 to 2,000 words, following `01-STYLE-RULES.md`. The Blog
   dialog shows the Markdown as plain monospace text, so write for that: short
   paragraphs, `###` headings, code blocks, and simple tables. No images.
6. **Code examples.** Real, runnable snippets only. Before you show an API call,
   read `frontend/app/api/convert/route.js` and use the fields it actually
   accepts (`file`, `profile`). Never invent endpoints, flags or response fields.
7. **SEO and GEO metadata.** Fill the frontmatter: title, description (170
   characters max), excerpt, keywords, tags, category, dates.
8. **Fact check.** Check every number and capability against a source or the
   code. Token and size figures are **estimates or examples**, never
   guarantees. Do not fabricate quotes, benchmarks, authors or statistics.
   Use `03-BRAND-ENTITY.md` as the list of what MDify can and can't do.
9. **Internal links.** Point readers to the converter (`/`), "Why Use It"
   (`/usecase`) and, where privacy comes up, the Privacy Policy (`/privacy`).
   One clear call to action per article.
10. **Quality check.** Run the scan from the repo root and fix every error:
    ```bash
    node MDify-Blog-Generation-Pipeline/check.mjs frontend/content/blog/{slug}.md
    ```
    It validates the frontmatter with the same code the app uses, then scans
    for em dashes, semicolons, banned words, brand mistakes and missing
    sections. The report is saved to `Outputs/{slug}.check.txt`. Then read the
    article aloud once.
11. **Output.** The finished file lives at `frontend/content/blog/{slug}.md`.
    Keep `draft: true` until you're ready.
12. **Publish.** Set `draft: false`, then from `frontend/`:
    ```bash
    npm run blog:index
    ```
    This rebuilds `frontend/lib/blogPosts.generated.json`, the list the Blog
    dialog imports. Commit both files and push. `npm run build` also runs the
    index step, and `npm test` fails if the JSON is out of date.

## How it maps to the app

| Piece | Where |
|---|---|
| Post files (Markdown + YAML frontmatter) | `frontend/content/blog/{slug}.md` |
| Parser and validation (shared with `check.mjs`) | `frontend/lib/blog.mjs` |
| Index builder (`npm run blog:index`, runs before `dev` and `build`) | `frontend/scripts/build-blog-index.mjs` |
| Generated post list | `frontend/lib/blogPosts.generated.json` |
| Blog dialog (featured card, 3-up grid, reader view) | `frontend/components/BlogModal.js` |
| Tests | `frontend/test/blog.test.mjs` |

The dialog shows the newest post as the featured card and the rest in the
grid. In the reader view it shows the TL;DR card, then the article body as
plain Markdown text. Drafts never appear.

## Files in this pack

| File | Purpose |
|---|---|
| `01-STYLE-RULES.md` | Voice, structure, punctuation and humanization rules |
| `02-SEO-GEO.md` | Keyword strategy, on-page and answer-engine guidance, current limits |
| `03-BRAND-ENTITY.md` | What MDify is, what it can and can't do, claims policy |
| `04-OUTPUT-FORMAT.md` | The exact frontmatter schema and body rules the app expects |
| `topics.md` | Backlog of accurate MDify article ideas |
| `check.mjs` | Quality scan for a finished article |
| `Blogs/` | One working folder per article (research, outline, sources) |
| `Outputs/` | Quality-check reports written by `check.mjs` |
