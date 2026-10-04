# backendZ — archive pool (Z1, Z2)

FastAPI service that turns a ZIP file into one project document for MDify.
It opens the archive safely, lists every entry, converts code and text files
directly, runs documents inside the archive through MarkItDown, and hands
images to the OCR pool (`backendO`) as separate work items.

## What a ZIP becomes

| Output | Content |
|--------|---------|
| `output/combined.md` | Every converted file under its own `` ## `path` `` heading, in path order. Split into `combined-001.md`, `combined-002.md`, … above 4 MB. |
| `output/PROJECT_INDEX.md` | Summary, folder tree and a table with the status of every entry (converted, skipped and why, failed). |
| `output/manifest.json` | The same tree as data: path, type, size, status, engine. No file content. |

Code files are wrapped in fenced blocks with a language tag. Document
headings are shifted down so they sit under the file heading.

Each combined Markdown part is at most 4 MiB of UTF-8, including its
continuation title. Splits prefer file headings, then line endings. A single
larger file continues across parts at a UTF-8 character boundary; long lines
and code fences may span parts. For the full document, concatenate the parts
in number order after removing the added `# … (part N of M)` continuation
titles and their following blank line. No source text is truncated.

## Safety rules

- Entry names are normalised. Absolute paths, drive letters, `..` and
  control characters are refused; the name is shown only as a label.
- Symbolic links and encrypted entries are skipped, never read.
- For duplicate names (case-insensitive) only the first is converted; the
  others are listed as duplicates.
- Limits (env, defaults in `.env.example`): 2,000 files, 100 MB uncompressed,
  15 MB per entry, 10 MB per image, compression ratio 100:1, one level of
  nested ZIP (at most 10), 50 images for text recognition, 40 MB of output,
  100 s of work.
- Dependency and build folders (`node_modules`, `.git`, `dist`, `bin`, …)
  are listed in the index but not converted.
- Files that look like credentials (`.env`, private keys, certificates) are
  listed but their content is never read into the result.
- One file that fails to convert does not fail the archive.

## Endpoints

All require the `X-Internal-Secret` header.

| Endpoint | Used for |
|----------|----------|
| `POST /api/v1/internal/archive/process` | Work item `ARCHIVE_PROCESS`. Downloads `jobs/<id>/input/source.zip` from Supabase Storage. Without images it writes the outputs at once (`mode: "single"`). With images it stores them under `materialized/<node>/`, saves the converted entries as `nodes/archive-N/partial.json` and returns `mode: "split"` with one OCR item per image. |
| `POST /api/v1/internal/archive/merge` | Work item `PROJECT_MERGE`, after the OCR items finish. Loads the parts and the recognised text and writes the outputs. An image whose text never arrived is marked failed; the rest of the project is kept. |
| `POST /api/v1/internal/convert` | Multipart fallback for local development without Storage. Images are listed, not recognised. |
| `GET /api/v1/health`, `GET /api/v1/ready` | Health and readiness. |

Requests and responses carry object paths only, never file content. Node
records for the database hold statistics only.

## Local

backendZ uses the same packages as backendN, so the backendN virtual
environment works:

```bash
../backendN/.venv/Scripts/python -m pytest
../backendN/.venv/Scripts/python -m uvicorn app.main:app --port 8005
```

`app/main.py` reads `backendZ/.env` for local runs (process variables win).
Set `ARCHIVE_BACKEND_URLS=http://localhost:8005` in `frontend/.env.local`.

## Deploy (Vercel)

Create two Vercel projects with **Root Directory = `backendZ`**. `vercel.json`
sets `maxDuration` to 300 s.

| Project | Env |
|---------|-----|
| Z1 | `BACKEND_INSTANCE=Z1`, `INTERNAL_SHARED_SECRET=<shared>`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` |
| Z2 | `BACKEND_INSTANCE=Z2`, same others |

Then list both URLs in the frontend's `ARCHIVE_BACKEND_URLS`.

## Shared core

`app/common/` is identical in `backendN`, `backendO` and `backendZ`. Change
all copies together; `tests/test_common.py` fails if any present copy differs.
