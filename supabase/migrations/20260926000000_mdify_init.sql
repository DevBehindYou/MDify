-- MDify — initial schema (Supabase Postgres + Storage).
--
-- Based on project-docs/supabase/SUPABASE_SCHEMA.sql with the fixes from
-- project-docs/supabase/REVIEW.md:
--   P0  no SECURITY DEFINER functions; every function is callable only by
--       service_role (anon/authenticated revoked explicitly, not just PUBLIC)
--   P1  auto_delete_at set atomically by confirm_upload()
--   P1  sweep_stale_jobs() retires abandoned uploads and stuck processing
--   P1  claim_cleanup_batch() reclaims stale CLAIMED rows, caps attempts
--   P2  failed_today counted on completed_at; per-instance KPI; index on
--       completed_at; request_delete_now()
-- Enum values follow the package (profiles standard/clean/compact/rag_ready,
-- instances n1/n2/o1/o2/z1/z2); the application maps its own labels to these.

-- ── Tables ──────────────────────────────────────────────────────────────────

create table if not exists public.jobs (
    job_id uuid primary key default gen_random_uuid(),

    status text not null default 'UPLOADING'
      check (status in (
        'UPLOADING','QUEUED','PROCESSING','COMPLETED','FAILED',
        'CANCEL_REQUESTED','CANCELLED','DELETING','DELETED'
      )),
    workload_type text check (workload_type is null or workload_type in ('NORMAL','OCR','ARCHIVE')),
    profile text check (profile is null or profile in ('standard','clean','compact','rag_ready')),
    stage text,
    progress smallint not null default 0 check (progress between 0 and 100),

    source_extension text,
    source_mime text,
    original_filename text,

    engine text,
    backend_role text check (backend_role is null or backend_role in ('normal','ocr','archive')),
    backend_instance text check (backend_instance is null or backend_instance in ('n1','n2','o1','o2','z1','z2')),

    attempt_count integer not null default 0 check (attempt_count >= 0),
    max_attempts integer not null default 2 check (max_attempts >= 1),

    created_at timestamptz not null default now(),
    upload_completed_at timestamptz,
    queued_at timestamptz,
    started_at timestamptz,
    completed_at timestamptz,          -- set for COMPLETED, FAILED and CANCELLED
    updated_at timestamptz not null default now(),

    processing_ms bigint,
    total_ms bigint,
    estimated_tokens bigint,
    quality_score numeric(5,2),

    error_code text,
    error_message text,

    retention_mode text not null default 'AUTO' check (retention_mode in ('AUTO','KEEP','EXTEND')),
    auto_delete_at timestamptz,
    retention_extended_until timestamptz,
    files_deleted_at timestamptz,
    deleted_at timestamptz,

    cleanup_state text not null default 'IDLE'
      check (cleanup_state in ('IDLE','CLAIMED','DELETING','PARTIAL','COMPLETE','ERROR')),
    cleanup_claimed_at timestamptz,
    cleanup_attempt_count integer not null default 0,
    cleanup_last_error text,

    correlation_id uuid not null default gen_random_uuid(),
    request_id text,
    metadata jsonb not null default '{}'::jsonb
);

create table if not exists public.file_objects (
    file_id uuid primary key default gen_random_uuid(),
    job_id uuid not null references public.jobs(job_id) on delete cascade,
    bucket text not null,
    object_path text not null,
    kind text not null check (kind in ('INPUT','OUTPUT','EXPORT','PREVIEW')),
    original_filename text,
    extension text,
    mime_type text,
    size_bytes bigint check (size_bytes is null or size_bytes >= 0),
    checksum text,
    storage_status text not null default 'PENDING'
      check (storage_status in ('PENDING','ACTIVE','DELETE_PENDING','DELETED','ERROR')),
    created_at timestamptz not null default now(),
    uploaded_at timestamptz,
    deleted_at timestamptz,
    metadata jsonb not null default '{}'::jsonb,
    unique (bucket, object_path)
);

create table if not exists public.job_events (
    event_id uuid primary key default gen_random_uuid(),
    job_id uuid not null references public.jobs(job_id) on delete cascade,
    event_type text not null,
    status text,
    stage text,
    backend_role text,
    backend_instance text,
    message text,
    details jsonb not null default '{}'::jsonb,
    created_at timestamptz not null default now()
);

-- No foreign key to jobs: audit rows must survive a hard job delete.
create table if not exists public.audit_logs (
    audit_id uuid primary key default gen_random_uuid(),
    actor_type text not null check (actor_type in ('ADMIN','SYSTEM','SERVICE')),
    actor_id text,
    action text not null,
    target_type text,
    target_id text,
    job_id uuid,
    request_id text,
    details jsonb not null default '{}'::jsonb,
    created_at timestamptz not null default now()
);

-- ── Indexes (match the queries below and the admin list views) ─────────────

create index if not exists idx_jobs_created_at on public.jobs (created_at desc);
create index if not exists idx_jobs_status_created on public.jobs (status, created_at desc);
create index if not exists idx_jobs_workload_created on public.jobs (workload_type, created_at desc);
create index if not exists idx_jobs_backend_created on public.jobs (backend_instance, created_at desc);
create index if not exists idx_jobs_completed_at on public.jobs (completed_at);
create index if not exists idx_jobs_cleanup_auto on public.jobs (auto_delete_at)
    where retention_mode = 'AUTO' and files_deleted_at is null;
create index if not exists idx_file_objects_job on public.file_objects (job_id);
create index if not exists idx_file_objects_status on public.file_objects (storage_status);
create index if not exists idx_job_events_job_created on public.job_events (job_id, created_at);
create index if not exists idx_audit_created on public.audit_logs (created_at desc);
create index if not exists idx_audit_action_created on public.audit_logs (action, created_at desc);

-- ── updated_at trigger ──────────────────────────────────────────────────────

create or replace function public.mdify_set_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_jobs_updated_at on public.jobs;
create trigger trg_jobs_updated_at
before update on public.jobs
for each row execute function public.mdify_set_updated_at();

-- ── Job lifecycle functions (SECURITY INVOKER; service_role only) ──────────

-- Upload finished: start the 48-hour clock and queue the job, atomically.
create or replace function public.confirm_upload(p_job_id uuid, p_retention interval default interval '48 hours')
returns public.jobs
language sql
set search_path = public
as $$
  update public.jobs
     set status = 'QUEUED',
         upload_completed_at = now(),
         queued_at = now(),
         auto_delete_at = now() + p_retention
   where job_id = p_job_id
     and status = 'UPLOADING'
  returning *;
$$;

-- Retire jobs that can never finish, so their objects become cleanable.
-- Signed upload URLs expire after 2 hours (Supabase), so an UPLOADING job
-- older than that is abandoned.
create or replace function public.sweep_stale_jobs(
  p_upload_ttl interval default interval '2 hours',
  p_processing_ttl interval default interval '15 minutes'
)
returns table (job_id uuid, new_status text)
language sql
set search_path = public
as $$
  with abandoned as (
    update public.jobs j
       set status = 'CANCELLED',
           completed_at = now(),
           error_code = 'UPLOAD_ABANDONED',
           auto_delete_at = now()
     where j.status = 'UPLOADING'
       and j.created_at < now() - p_upload_ttl
    returning j.job_id, j.status
  ),
  stuck as (
    update public.jobs j
       set status = 'FAILED',
           completed_at = now(),
           error_code = 'STALE',
           error_message = 'No backend finished this job in time',
           auto_delete_at = coalesce(j.auto_delete_at, now())
     where j.status in ('QUEUED','PROCESSING')
       and coalesce(j.started_at, j.queued_at, j.created_at) < now() - p_processing_ttl
    returning j.job_id, j.status
  )
  select * from abandoned
  union all
  select * from stuck;
$$;

-- Atomically claim a batch of expired jobs for file cleanup.
-- Reclaims claims older than p_claim_ttl (a crashed cleanup run) and stops
-- after p_max_attempts, leaving the job in ERROR for an admin retry.
create or replace function public.claim_cleanup_batch(
  batch_size integer default 100,
  p_claim_ttl interval default interval '30 minutes',
  p_max_attempts integer default 5
)
returns setof public.jobs
language plpgsql
set search_path = public
as $$
begin
  update public.jobs
     set cleanup_state = 'ERROR',
         cleanup_last_error = coalesce(cleanup_last_error, 'max cleanup attempts reached')
   where files_deleted_at is null
     and cleanup_state in ('IDLE','ERROR','PARTIAL','CLAIMED')
     and cleanup_attempt_count >= p_max_attempts
     and cleanup_state <> 'ERROR';

  return query
  with candidates as (
    select j.job_id
      from public.jobs j
     where j.files_deleted_at is null
       and j.cleanup_attempt_count < p_max_attempts
       and (
         j.cleanup_state in ('IDLE','ERROR','PARTIAL')
         or (j.cleanup_state = 'CLAIMED' and j.cleanup_claimed_at < now() - p_claim_ttl)
       )
       and j.status in ('COMPLETED','FAILED','CANCELLED')
       and (
         (j.retention_mode = 'AUTO' and j.auto_delete_at is not null and j.auto_delete_at <= now())
         or (j.retention_mode = 'EXTEND' and j.retention_extended_until is not null
             and j.retention_extended_until <= now())
       )
     order by coalesce(j.retention_extended_until, j.auto_delete_at)
     for update skip locked
     limit greatest(1, least(batch_size, 500))
  )
  update public.jobs j
     set cleanup_state = 'CLAIMED',
         cleanup_claimed_at = now(),
         cleanup_attempt_count = j.cleanup_attempt_count + 1,
         cleanup_last_error = null
    from candidates c
   where j.job_id = c.job_id
  returning j.*;
end;
$$;

-- Admin DELETE_NOW. Active jobs are asked to cancel first (files are never
-- deleted mid-processing); finished jobs become due immediately, even KEEP.
create or replace function public.request_delete_now(p_job_id uuid)
returns text
language plpgsql
set search_path = public
as $$
declare
  v_status text;
begin
  select status into v_status from public.jobs where job_id = p_job_id for update;
  if v_status is null then
    return 'not_found';
  elsif v_status in ('UPLOADING','QUEUED','PROCESSING') then
    update public.jobs set status = 'CANCEL_REQUESTED' where job_id = p_job_id;
    return 'cancel_requested';
  else
    update public.jobs
       set retention_mode = 'AUTO',
           auto_delete_at = now(),
           retention_extended_until = null,
           cleanup_state = case when cleanup_state = 'COMPLETE' then cleanup_state else 'IDLE' end
     where job_id = p_job_id;
    return 'due_now';
  end if;
end;
$$;

-- ── KPIs ────────────────────────────────────────────────────────────────────

create or replace function public.get_admin_kpis()
returns jsonb
language sql
stable
set search_path = public
as $$
select jsonb_build_object(
  'jobs', jsonb_build_object(
    'today',            (select count(*) from public.jobs where created_at >= date_trunc('day', now())),
    'with_files',       (select count(*) from public.jobs where files_deleted_at is null and deleted_at is null),
    'processing',       (select count(*) from public.jobs where status = 'PROCESSING'),
    'queued',           (select count(*) from public.jobs where status = 'QUEUED'),
    'completed_today',  (select count(*) from public.jobs where status = 'COMPLETED' and completed_at >= date_trunc('day', now())),
    'failed_today',     (select count(*) from public.jobs where status = 'FAILED' and completed_at >= date_trunc('day', now()))
  ),
  'workloads', jsonb_build_object(
    'normal_today', (select count(*) from public.jobs where workload_type = 'NORMAL' and created_at >= date_trunc('day', now())),
    'ocr_today',    (select count(*) from public.jobs where workload_type = 'OCR' and created_at >= date_trunc('day', now()))
  ),
  'instances_today', coalesce((
    select jsonb_object_agg(backend_instance, n)
      from (select backend_instance, count(*) as n
              from public.jobs
             where created_at >= date_trunc('day', now()) and backend_instance is not null
             group by backend_instance) t
  ), '{}'::jsonb),
  'storage', jsonb_build_object(
    'input_files',  (select count(*) from public.file_objects where kind = 'INPUT'  and storage_status = 'ACTIVE'),
    'output_files', (select count(*) from public.file_objects where kind = 'OUTPUT' and storage_status = 'ACTIVE'),
    'export_files', (select count(*) from public.file_objects where kind = 'EXPORT' and storage_status = 'ACTIVE'),
    'active_bytes', (select coalesce(sum(size_bytes), 0) from public.file_objects where storage_status = 'ACTIVE')
  ),
  'retention', jsonb_build_object(
    'expiring_6h',  (select count(*) from public.jobs where files_deleted_at is null and retention_mode in ('AUTO','EXTEND')
                       and coalesce(retention_extended_until, auto_delete_at) <= now() + interval '6 hours'),
    'expiring_24h', (select count(*) from public.jobs where files_deleted_at is null and retention_mode in ('AUTO','EXTEND')
                       and coalesce(retention_extended_until, auto_delete_at) <= now() + interval '24 hours'),
    'kept',         (select count(*) from public.jobs where retention_mode = 'KEEP' and files_deleted_at is null),
    'cleanup_errors', (select count(*) from public.jobs where cleanup_state in ('PARTIAL','ERROR'))
  ),
  'performance', jsonb_build_object(
    'avg_processing_ms_today', (select coalesce(avg(processing_ms), 0) from public.jobs
                                 where completed_at >= date_trunc('day', now()) and processing_ms is not null),
    'p95_processing_ms_today', (select coalesce(percentile_cont(0.95) within group (order by processing_ms), 0)
                                  from public.jobs
                                 where completed_at >= date_trunc('day', now()) and processing_ms is not null)
  )
);
$$;

-- ── Access control ──────────────────────────────────────────────────────────
-- Browsers never touch these tables or functions; only server code using the
-- service_role key does. Supabase grants anon/authenticated privileges by
-- default, so they are revoked explicitly (revoking PUBLIC alone is not enough).

alter table public.jobs enable row level security;
alter table public.file_objects enable row level security;
alter table public.job_events enable row level security;
alter table public.audit_logs enable row level security;

revoke all on public.jobs, public.file_objects, public.job_events, public.audit_logs from public, anon, authenticated;
grant select, insert, update, delete on public.jobs, public.file_objects, public.job_events to service_role;
-- Audit log is append-only for the application.
grant select, insert on public.audit_logs to service_role;

revoke all on function public.mdify_set_updated_at() from public, anon, authenticated;
revoke all on function public.confirm_upload(uuid, interval) from public, anon, authenticated;
revoke all on function public.sweep_stale_jobs(interval, interval) from public, anon, authenticated;
revoke all on function public.claim_cleanup_batch(integer, interval, integer) from public, anon, authenticated;
revoke all on function public.request_delete_now(uuid) from public, anon, authenticated;
revoke all on function public.get_admin_kpis() from public, anon, authenticated;

grant execute on function public.confirm_upload(uuid, interval) to service_role;
grant execute on function public.sweep_stale_jobs(interval, interval) to service_role;
grant execute on function public.claim_cleanup_batch(integer, interval, integer) to service_role;
grant execute on function public.request_delete_now(uuid) to service_role;
grant execute on function public.get_admin_kpis() to service_role;

-- ── Storage bucket ──────────────────────────────────────────────────────────
-- Private bucket; the 15 MB limit mirrors MAX_FILE_SIZE so the storage layer
-- also refuses oversize uploads. MIME types are not restricted here because
-- browsers label some supported files inconsistently; backends re-validate
-- the bytes of every file anyway.

insert into storage.buckets (id, name, public, file_size_limit)
values ('mdify-pro-files', 'mdify-pro-files', false, 15728640)
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit;
