# 03. Brand Entity and Claims Policy

## What MDify is

MDify is a free, open-source (GPL-3.0) **document-to-Markdown converter** for
AI, RAG and developer workflows, built by DevBehindYou
(<https://github.com/DevBehindYou/MDify>, devbehindyou@gmail.com). It turns
documents and images into clean, structured Markdown, with processing
profiles, a token estimate, batch conversion and a hosted interface. No
sign-up. The site is <https://mdify-app.vercel.app>.

The product name is **MDify**. Some source files still carry an older
"MarkDify" prefix (for example `MarkDifyHeader.js`). Never write "MarkDify" in
an article. `check.mjs` flags it.

## Entity separation

- **MDify** is the product. It is the only entity an article promotes.
- **Don't name the engines or hosting behind MDify** (owner's decision,
  28 September 2026). Describe what MDify does: "converts", "reads scanned
  pages with text recognition". The Terms of Service (`/terms`, section 10)
  credit the open-source components; link it if a reader asks what MDify runs on.
  `check.mjs` rejects an article that names them.

## What MDify can do (verified against the code)

Check `frontend/lib/formats.js` before each article in case this list changed.

- **Documents:** PDF, DOCX, XLSX, XLS, PPTX, EPUB, HTML/HTM, CSV, TSV, JSON,
  XML, TXT and Markdown.
- **Scanned PDFs:** text pages are read directly, pages that are only pictures
  go through text recognition (up to 100 scanned pages per file).
- **Images** (text recognition, English): JPG/JPEG, PNG, WebP, TIFF, BMP and GIF
  (first frame only). Pages rotated by 90, 180 or 270 degrees are turned
  upright automatically.
- **ZIP files:** code projects and document folders become one Markdown file,
  a `PROJECT_INDEX.md` with the folder tree, and a `manifest.json`. Build
  folders are listed but skipped, files that look like credentials are never read.
- **Profiles:** Standard, Clean, Compact and RAG-ready.
- **Limits:** 15 MB per document or ZIP file, 10 MB per image (25 MP, WebP 12 MP),
  2,000 files inside a ZIP, up to 20 files in one batch.
- **Output tools:** copy to clipboard, download `.md`, download all results as
  a `.zip`, a token and quality read-out (estimates).
- **Recent conversions:** the last 5 results stay in your browser's local
  storage so you can reopen them.
- **API:** `POST /api/convert` with multipart fields `file` and `profile`.
  Read `frontend/app/api/convert/route.js` before you document anything more.
- **Privacy:** uploads and results are deleted within 48 hours, and files are
  never used to train AI models. Quote the Privacy Policy (`/privacy`) and link
  it rather than paraphrasing.

## What MDify can't do (don't claim it)

- More than 100 scanned pages in one PDF. Pages past that limit are skipped
  and the result says so.
- Legacy `.doc` or `.ppt` files, and reverse conversion (Markdown to PDF or Word).
- Languages other than English for OCR.
- Accounts, team workspaces, or anything that needs a login.
- Guaranteed token savings. The approved headline is **"Cut PDF token costs by
  70%"**, and it always comes with its method: a typical 500-word page is about
  667 tokens as Markdown against about 2,235 as a PDF read as text plus a page
  image (80% on high-resolution models). Figures and sources live in
  `frontend/lib/siteContent.js`; reuse them, don't invent new ones.

## Voice

Technical, direct, useful. Show trade-offs and limits, not only benefits.
Opinions are welcome when earned.

## Claims policy (don't break it)

- Token and size numbers are estimates, framed as "in this example" or "up to".
- Only mention features listed above, and confirm them in the repo.
- No fabricated expert quotes, statistics, benchmarks, case studies or authors.
- The byline is `DevBehindYou` unless a real, named person wrote the piece.

## Call to action

Link naturally to the converter (`/`) and the "Why Use It" page (`/usecase`).
One clear call to action per article, not a wall of links.
