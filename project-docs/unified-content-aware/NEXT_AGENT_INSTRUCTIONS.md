# AI Agent — Next Instructions: Unified Content-Aware PDF + ZIP

Continue the existing MarkDify repository. Do not restart it.

Read:
1. `UNIFIED_CONTENT_AWARE_ARCHITECTURE.md`
2. `IMPLEMENTATION_PLAN.md`
3. existing converter registry
4. Supabase Storage/Postgres integration
5. current tests

## Required additions

Implement:

```text
HybridPdfConverter
ArchiveProjectConverter
ContentAnalyzer
content_nodes
work_items
bounded durable dispatcher
OrderedPdfMerger
ProjectMerger
```

## PDF

Analyze each page and classify:

```text
NATIVE_TEXT
MIXED
IMAGE_ONLY
EMPTY
UNSUPPORTED
```

Native → N1/N2.

Image-only → O1/O2.

Mixed → native extraction plus OCR only for meaningful image regions, then conservative deduplication and ordered merge.

Test 0/90/180/270 orientation.

## ZIP

Implement:

```text
safe inspect
→ directory tree
→ recursive classify
→ code/text / document / image / nested ZIP
→ bounded parallel processing
→ project merge
```

Protect against:

```text
path traversal
absolute paths
archive bombs
oversized entries
too many entries
excessive nesting
unsafe links
```

## Scheduling

Do not launch all children at once.

Use durable work items, atomic claiming, per-pool limits, fair root-job scheduling, and completion-triggered dispatch ticks.

All four backends must be able to work concurrently.

## Storage

Always keep the original upload.

Materialize child source files only when distributed processing requires it.

Store all large/final outputs in Supabase Storage.

## Outputs

PDF:
```text
result.md
```

Project ZIP:
```text
PROJECT_INDEX.md
manifest.json
converted-project.zip
combined.md or segmented combined output
```

Never return giant results inline.

## Required report

Report:
- migrations
- files changed
- PDF analyzer
- mixed-page processing
- OCR page handling
- archive safety
- recursion
- dispatcher
- merger
- Supabase Storage/Postgres status
- four-backend parallel result
- security tests
- performance results
- unresolved risks

Use:
```text
VERIFIED
IMPLEMENTED BUT UNTESTED
PARTIALLY VERIFIED
BROKEN
NOT IMPLEMENTED
UNKNOWN
```

Do not claim production readiness from code inspection alone.
