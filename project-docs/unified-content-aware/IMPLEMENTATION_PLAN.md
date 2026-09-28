# MarkDify — Unified PDF + ZIP Implementation Plan

## Phase 1 — Data model
Add `content_nodes`, `work_items`, and root job counters.

## Phase 2 — Dispatcher
Implement atomic claiming, bounded dispatch, per-root fairness, and completion-triggered next-wave scheduling.

## Phase 3 — Hybrid PDF
Implement page analysis, native extraction, OCR-page processing, mixed-page image-region OCR, deduplication, and ordered merge.

## Phase 4 — Archive Project Converter
Implement safe inspection, tree building, recursive classification, nested archive handling, child materialization, and project merge.

## Phase 5 — Output builders
Implement `result.md`, `PROJECT_INDEX.md`, `manifest.json`, segmented combined output, and `converted-project.zip`.

## Phase 6 — Frontend
Preserve current UI. Add only the states required to represent analysis, child processing, warnings, and final outputs.

## Phase 7 — MDAdmin
Add root/child tree visibility, node status, backend assignment, timings, errors, warnings, and output references.

## Phase 8 — Testing
Run PDF, ZIP security, recursion, parallel four-backend, failover, large-output, retention, and performance suites.

## Definition of done
One real mixed PDF and one real complex project ZIP must pass end-to-end through production-like N1/N2/O1/O2 deployments and generate correct Supabase-backed outputs.
