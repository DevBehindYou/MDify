# MarkDify — Supabase Storage & Database Package

This package replaces the previous Cloudflare R2 + D1 storage/metadata design with **Supabase Storage (S3-compatible) + Supabase Postgres**.

## Final infrastructure

```text
Frontend:
- Vercel

Normal Backends:
- N1 → Vercel
- N2 → Vercel

OCR Backends:
- O1 → Render
- O2 → Render

File Storage:
- Supabase Storage
- private bucket
- S3-compatible server access
- signed / resumable browser upload

Jobs / KPIs / Audit:
- Supabase Postgres

Retention:
- default AUTO deletion of file objects after 48 hours
- admin can KEEP / EXTEND / DELETE_NOW

Admin:
- /mdify-controller
- protected by two secret keys
```

## Included documents

- `SUPABASE_STORAGE_ARCHITECTURE.md`
- `SUPABASE_JOBS_KPIS_AUDIT.md`
- `SUPABASE_RETENTION_CLEANUP.md`
- `MIGRATION_PLAN_CLOUDFLARE_TO_SUPABASE.md`
- `SUPABASE_SCHEMA.sql`

## Important architectural change

The Cloudflare D1 proxy Worker is no longer required for MarkDify job metadata.

The target path is now:

```text
Vercel / Render services
        │
        ├── Supabase Storage
        │      └── input/output files
        │
        └── Supabase Postgres
               └── jobs/KPIs/audit
```
