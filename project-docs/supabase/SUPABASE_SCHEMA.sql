-- MarkDify Supabase schema
-- Review against the actual repository before applying to production.

create extension if not exists pgcrypto;

create table if not exists public.jobs (
    job_id uuid primary key default gen_random_uuid(),

    status text not null default 'UPLOADING'
      check (status in (
        'UPLOADING','QUEUED','PROCESSING','COMPLETED','FAILED',
        'CANCEL_REQUESTED','CANCELLED','DELETING','DELETED'
      )),

    workload_type text
      check (workload_type is null or workload_type in ('NORMAL','OCR')),

    profile text
      check (profile is null or profile in ('standard','clean','compact','rag_ready')),

    stage text,
    progress smallint not null default 0 check (progress between 0 and 100),

    source_extension text,
    source_mime text,
    original_filename text,

    engine text,
    backend_role text check (backend_role is null or backend_role in ('normal','ocr')),
    backend_instance text check (backend_instance is null or backend_instance in ('n1','n2','o1','o2')),

    attempt_count integer not null default 0 check (attempt_count >= 0),
    max_attempts integer not null default 2 check (max_attempts >= 1),

    created_at timestamptz not null default now(),
    upload_completed_at timestamptz,
    queued_at timestamptz,
    started_at timestamptz,
    completed_at timestamptz,
    updated_at timestamptz not null default now(),

    processing_ms bigint,
    total_ms bigint,

    estimated_tokens bigint,
    quality_score numeric(5,2),

    error_code text,
    error_message text,

    retention_mode text not null default 'AUTO'
      check (retention_mode in ('AUTO','KEEP','EXTEND')),

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

    unique(bucket, object_path)
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

create index if not exists idx_jobs_created_at
    on public.jobs(created_at desc);

create index if not exists idx_jobs_status_created
    on public.jobs(status, created_at desc);

create index if not exists idx_jobs_workload_created
    on public.jobs(workload_type, created_at desc);

create index if not exists idx_jobs_backend_created
    on public.jobs(backend_instance, created_at desc);

create index if not exists idx_jobs_cleanup_auto
    on public.jobs(auto_delete_at)
    where retention_mode = 'AUTO'
      and files_deleted_at is null;

create index if not exists idx_file_objects_job
    on public.file_objects(job_id);

create index if not exists idx_file_objects_status
    on public.file_objects(storage_status);

create index if not exists idx_job_events_job_created
    on public.job_events(job_id, created_at);

create index if not exists idx_audit_created
    on public.audit_logs(created_at desc);

create index if not exists idx_audit_action_created
    on public.audit_logs(action, created_at desc);

create or replace function public.markdify_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_jobs_updated_at on public.jobs;
create trigger trg_jobs_updated_at
before update on public.jobs
for each row
execute function public.markdify_set_updated_at();

create or replace function public.get_admin_kpis()
returns jsonb
language sql
stable
as $$
select jsonb_build_object(
  'jobs', jsonb_build_object(
    'today', (
      select count(*) from public.jobs
      where created_at >= date_trunc('day', now())
    ),
    'active', (
      select count(*) from public.jobs
      where deleted_at is null
    ),
    'processing', (
      select count(*) from public.jobs
      where status = 'PROCESSING'
    ),
    'queued', (
      select count(*) from public.jobs
      where status = 'QUEUED'
    ),
    'completed_today', (
      select count(*) from public.jobs
      where status = 'COMPLETED'
        and completed_at >= date_trunc('day', now())
    ),
    'failed_today', (
      select count(*) from public.jobs
      where status = 'FAILED'
        and updated_at >= date_trunc('day', now())
    )
  ),
  'workloads', jsonb_build_object(
    'normal_today', (
      select count(*) from public.jobs
      where workload_type = 'NORMAL'
        and created_at >= date_trunc('day', now())
    ),
    'ocr_today', (
      select count(*) from public.jobs
      where workload_type = 'OCR'
        and created_at >= date_trunc('day', now())
    )
  ),
  'storage', jsonb_build_object(
    'input_files', (
      select count(*) from public.file_objects
      where kind = 'INPUT' and storage_status = 'ACTIVE'
    ),
    'output_files', (
      select count(*) from public.file_objects
      where kind = 'OUTPUT' and storage_status = 'ACTIVE'
    ),
    'export_files', (
      select count(*) from public.file_objects
      where kind = 'EXPORT' and storage_status = 'ACTIVE'
    ),
    'active_bytes', (
      select coalesce(sum(size_bytes), 0) from public.file_objects
      where storage_status = 'ACTIVE'
    )
  ),
  'retention', jsonb_build_object(
    'expiring_6h', (
      select count(*) from public.jobs
      where files_deleted_at is null
        and retention_mode in ('AUTO','EXTEND')
        and coalesce(retention_extended_until, auto_delete_at)
            <= now() + interval '6 hours'
    ),
    'expiring_24h', (
      select count(*) from public.jobs
      where files_deleted_at is null
        and retention_mode in ('AUTO','EXTEND')
        and coalesce(retention_extended_until, auto_delete_at)
            <= now() + interval '24 hours'
    ),
    'kept', (
      select count(*) from public.jobs
      where retention_mode = 'KEEP'
        and files_deleted_at is null
    ),
    'cleanup_errors', (
      select count(*) from public.jobs
      where cleanup_state in ('PARTIAL','ERROR')
    )
  ),
  'performance', jsonb_build_object(
    'avg_processing_ms_today', (
      select coalesce(avg(processing_ms), 0) from public.jobs
      where completed_at >= date_trunc('day', now())
        and processing_ms is not null
    ),
    'p95_processing_ms_today', (
      select coalesce(
        percentile_cont(0.95) within group (order by processing_ms),
        0
      )
      from public.jobs
      where completed_at >= date_trunc('day', now())
        and processing_ms is not null
    )
  )
);
$$;

-- Browser roles should not have direct application-table access by default.
alter table public.jobs enable row level security;
alter table public.file_objects enable row level security;
alter table public.job_events enable row level security;
alter table public.audit_logs enable row level security;

revoke all on public.jobs from anon, authenticated;
revoke all on public.file_objects from anon, authenticated;
revoke all on public.job_events from anon, authenticated;
revoke all on public.audit_logs from anon, authenticated;

-- Cleanup claiming function.
-- Review terminal statuses against actual application behavior before deployment.
create or replace function public.claim_cleanup_batch(batch_size integer default 100)
returns setof public.jobs
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  with candidates as (
    select j.job_id
    from public.jobs j
    where j.files_deleted_at is null
      and j.cleanup_state in ('IDLE','ERROR','PARTIAL')
      and j.status in ('COMPLETED','FAILED','CANCELLED')
      and (
        (j.retention_mode = 'AUTO' and j.auto_delete_at is not null and j.auto_delete_at <= now())
        or
        (j.retention_mode = 'EXTEND'
          and j.retention_extended_until is not null
          and j.retention_extended_until <= now())
      )
    order by coalesce(j.retention_extended_until, j.auto_delete_at)
    for update skip locked
    limit greatest(1, least(batch_size, 500))
  )
  update public.jobs j
     set cleanup_state = 'CLAIMED',
         cleanup_claimed_at = now(),
         cleanup_attempt_count = cleanup_attempt_count + 1,
         cleanup_last_error = null
  from candidates c
  where j.job_id = c.job_id
  returning j.*;
end;
$$;

revoke all on function public.claim_cleanup_batch(integer) from public;
revoke all on function public.get_admin_kpis() from public;

-- Grant execution only to the trusted server role as appropriate for the project.
-- Supabase service_role bypasses RLS and should remain server-side.
