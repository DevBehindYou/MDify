# MarkDify Architecture Documentation Package

> **Decision update — 2026-09-26:** Storage and metadata move from Cloudflare to **Supabase**.
> Cloudflare R2 → **Supabase Storage** (private bucket, S3-compatible API, signed URLs).
> Cloudflare D1 + Worker API → **Supabase Postgres** (jobs, audit_logs, job_events; accessed server-side only).
> Everything else below still applies; read "R2" as Supabase Storage and "D1 / Worker" as Supabase Postgres until this document is rewritten.


This package contains the updated planning and architecture documents for **MarkDify**.

## Final Hosting Decision

```text
Frontend:
- Vercel

Normal Backends:
- N1 → Vercel
- N2 → Vercel

OCR Backends:
- O1 → Render
- O2 → Render

Storage:
- Cloudflare R2

Metadata / KPIs / Audit / Admin:
- Cloudflare D1 + Cloudflare Worker API
```

## Retention Model

**Hybrid retention model (Option C):**

- By default, files are scheduled for automatic deletion after **48 hours**
- Admin can:
  - delete immediately
  - extend retention
  - mark selected jobs/files as `KEEP`

## Admin Panel

Protected admin route:

```text
/mdify-controller
```

Protected by **two secret keys**.

## Included Files

- `ARCHITECTURE.md`
- `CODEBASE_STRUCTURE.md` — repo layout, frontend MVVM, dispatcher, backend contract
- `DATA_FLOW_DIAGRAMS.md`
- `BUGS_RISKS_AND_GAPS.md`
- `TESTING_QA_CHECKLIST.md`
- `PERFORMANCE_OPTIMIZATION.md`
- `IMPLEMENTATION_PLAN.md`
- `NEXT_AGENT_INSTRUCTIONS.md`
