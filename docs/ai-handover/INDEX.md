# AI Project Handover

## Project

**MDify** (repository folder `MDify-Pro`, mirrored into `MDify`): a free web app that converts PDF, Word, PowerPoint, Excel, HTML, images and ZIP files into clean Markdown for AI and RAG use. Live URL (old version deployed; new version NOT deployed): https://mdify-app.vercel.app

## Last Updated

2026-09-28, end of Claude Code session `cffeaeb4-6a02-4861-addd-654c4c853f0f` (sessions ran 2026-09-25 to 2026-09-28; an earlier duplicate session `e880fe6f-…` only contains the first prompt).

## Handover Purpose

This directory contains the project state and AI-session context required for another AI agent to continue development without reviewing the entire previous conversation.

## Recommended Reading Order

1. `HANDOVER.md`
2. `PROJECT_CONTEXT.md`
3. `CURRENT_STATE.md`
4. `CHANGES_MADE.md`
5. `ERRORS_AND_FIXES.md`
6. `PENDING_TASKS.md`
7. `NEXT_AGENT_INSTRUCTIONS.md`

Then as needed: `DECISIONS.md`, `ARCHITECTURE.md`, `TESTING_STATUS.md`, `FILES_CHANGED.md`, `COMMANDS_AND_LOGS.md`, `SESSION_HISTORY.md`.

## Documents

| File | Purpose |
|---|---|
| `HANDOVER.md` | Executive handover: status, blockers, warnings, next action |
| `PROJECT_CONTEXT.md` | Goals, requirements, stack, user preferences and constraints (verbatim where wording matters) |
| `SESSION_HISTORY.md` | Chronological history of every user request, finding and result, including user corrections |
| `CURRENT_STATE.md` | What exists now, feature by feature, with verification status; git, env and deployment state |
| `CHANGES_MADE.md` | Every meaningful change: problem, root cause, solution, verification |
| `FILES_CHANGED.md` | File-level record of created, modified, deleted and renamed files |
| `ERRORS_AND_FIXES.md` | Every error, root cause, fix, and failed approaches not to repeat |
| `COMMANDS_AND_LOGS.md` | Commands to build, test, run, verify, sync; important log excerpts |
| `ARCHITECTURE.md` | Existing architecture (as built) and clearly separated proposed architecture |
| `DECISIONS.md` | Technical and product decisions with reasons and status |
| `TESTING_STATUS.md` | What was tested, how, results, and gaps |
| `PENDING_TASKS.md` | Prioritized, executable task list (P0–P3) |
| `NEXT_AGENT_INSTRUCTIONS.md` | Exact continuation instructions and definition of done |

## Other documentation in the repository (still valid, more detail)

| Path | Content |
|---|---|
| `docs/ARCHITECTURE.md` | As-built architecture with status labels |
| `docs/GO_LIVE.md` | Step-by-step deployment checklist |
| `docs/BACKGROUND_JOBS.md` | Durable work queue design |
| `docs/ADMIN_ARCHITECTURE.md` | `/mdify-controller` admin design and status |
| `docs/RETENTION_AND_CLEANUP.md` | 48-hour retention and cleanup |
| `docs/SUPABASE_STORAGE_ARCHITECTURE.md`, `docs/SUPABASE_DATABASE_ARCHITECTURE.md` | Storage and database design |
| `docs/testing/*.md` | Load, OCR, performance, failover, Supabase and capacity reports (measured locally) |
| `project-docs/NEXT_AGENT_INSTRUCTIONS.md` | Older handover with dated status snapshots (2026-09-26, 2026-09-27) |
| `project-docs/unified-content-aware/` | Owner-supplied architecture proposal + `REVIEW.md` |
| `backendN/README.md`, `backendO/README.md`, `backendZ/README.md` | Per-backend run/deploy notes |
| `MDify-Blog-Generation-Pipeline/README.md` | Blog writing pipeline |

## Status labels used throughout

`VERIFIED` (tested and observed working) · `PARTIALLY VERIFIED` · `IMPLEMENTED BUT UNTESTED` · `BROKEN` · `NOT IMPLEMENTED` · `UNKNOWN`. "VERIFIED" means verified **locally** unless it says otherwise. Nothing of the new architecture is deployed.
