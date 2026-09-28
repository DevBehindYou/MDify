-- MDify — durable work queue for background jobs, content tree, storage budget.
--
-- A job is split into work items (one per unit a backend processes). Items are
-- claimed atomically per pool with in-flight limits, leased, and completed by
-- the orchestrator (frontend server code). Merge items stay BLOCKED until every
-- other item of the job is finished. content_nodes records the logical tree
-- (PDF pages, archive entries) for results and the admin view.
--
-- Same access model as the init migration: SECURITY INVOKER functions,
-- executable by service_role only; anon/authenticated revoked explicitly.

-- ── Jobs: source type and progress counters ────────────────────────────────

alter table public.jobs
  add column if not exists source_type text
    check (source_type is null or source_type in ('DOCUMENT','IMAGE','PDF','ARCHIVE')),
  add column if not exists items_total integer not null default 0,
  add column if not exists items_done integer not null default 0,
  add column if not exists items_failed integer not null default 0,
  add column if not exists items_skipped integer not null default 0,
  add column if not exists warnings text[] not null default '{}';

-- ── Content tree ───────────────────────────────────────────────────────────

create table if not exists public.content_nodes (
    node_id uuid primary key default gen_random_uuid(),
    job_id uuid not null references public.jobs(job_id) on delete cascade,
    parent_node_id uuid references public.content_nodes(node_id) on delete cascade,
    node_type text not null check (node_type in (
      'ROOT_FILE','DIRECTORY','ARCHIVE_ENTRY','NESTED_ARCHIVE','PDF_SEGMENT','PDF_PAGE',
      'TEXT_FILE','CODE_FILE','DOCUMENT','IMAGE','BINARY'
    )),
    classification text check (classification is null or classification in (
      'DIRECT_TEXT','NORMAL_DOCUMENT','PDF_NATIVE','PDF_MIXED','PDF_OCR','OCR_IMAGE',
      'ARCHIVE','SKIP','UNSUPPORTED'
    )),
    logical_path text,
    page_from integer,
    page_to integer,
    sequence_index integer not null default 0,
    archive_depth smallint not null default 0,
    size_bytes bigint,
    status text not null default 'PENDING'
      check (status in ('PENDING','PROCESSING','DONE','FAILED','SKIPPED')),
    skip_reason text,
    engine text,
    backend_instance text,
    output_object_path text,
    duration_ms bigint,
    metadata jsonb not null default '{}'::jsonb,
    created_at timestamptz not null default now(),
    completed_at timestamptz
);

create index if not exists idx_content_nodes_job_seq on public.content_nodes (job_id, sequence_index);
create index if not exists idx_content_nodes_parent on public.content_nodes (parent_node_id);

-- ── Work items ─────────────────────────────────────────────────────────────

create table if not exists public.work_items (
    work_item_id uuid primary key default gen_random_uuid(),
    job_id uuid not null references public.jobs(job_id) on delete cascade,
    node_id uuid references public.content_nodes(node_id) on delete set null,
    task_type text not null check (task_type in (
      'CONVERT','OCR_IMAGE','PDF_ANALYZE','PDF_PAGE_OCR','PDF_MERGE','ARCHIVE_PROCESS','PROJECT_MERGE'
    )),
    pool text not null check (pool in ('normal','ocr','archive')),
    status text not null default 'QUEUED'
      check (status in ('BLOCKED','QUEUED','RUNNING','SUCCEEDED','FAILED','SKIPPED','CANCELLED')),
    is_root boolean not null default false,
    is_final boolean not null default false,
    priority smallint not null default 100,
    sequence_index integer not null default 0,
    attempt_count integer not null default 0 check (attempt_count >= 0),
    max_attempts integer not null default 2 check (max_attempts >= 1),
    assigned_backend text,
    input_path text,
    output_path text,
    payload jsonb not null default '{}'::jsonb,
    result jsonb,
    error_code text,
    error_message text,
    duration_ms bigint,
    created_at timestamptz not null default now(),
    claimed_at timestamptz,
    lease_until timestamptz,
    completed_at timestamptz,
    updated_at timestamptz not null default now()
);

create unique index if not exists uq_work_items_root on public.work_items (job_id) where is_root;
create index if not exists idx_work_items_claim on public.work_items (pool, status, priority, created_at);
create index if not exists idx_work_items_job on public.work_items (job_id, status);
create index if not exists idx_work_items_lease on public.work_items (lease_until) where status = 'RUNNING';

drop trigger if exists trg_work_items_updated_at on public.work_items;
create trigger trg_work_items_updated_at
before update on public.work_items
for each row execute function public.mdify_set_updated_at();

-- ── Enqueue ────────────────────────────────────────────────────────────────

-- Root item of a job, right after confirm_upload(). One per job (unique index),
-- so a double start can't queue the job twice.
create or replace function public.enqueue_root(
  p_job_id uuid,
  p_task_type text,
  p_pool text,
  p_input_path text,
  p_output_path text,
  p_source_type text,
  p_node_type text default 'ROOT_FILE',
  p_is_final boolean default true,
  p_payload jsonb default '{}'::jsonb
)
returns public.work_items
language plpgsql
set search_path = public
as $$
declare
  v_job public.jobs;
  v_node uuid;
  v_item public.work_items;
begin
  select * into v_job from public.jobs where job_id = p_job_id for update;
  if v_job.job_id is null or v_job.status <> 'QUEUED' then
    return null;
  end if;
  if exists (select 1 from public.work_items where job_id = p_job_id and is_root) then
    return null;
  end if;

  insert into public.content_nodes (job_id, node_type, logical_path, size_bytes)
  select p_job_id, p_node_type, v_job.original_filename,
         (select size_bytes from public.file_objects where job_id = p_job_id and kind = 'INPUT' limit 1)
  returning node_id into v_node;

  insert into public.work_items (job_id, node_id, task_type, pool, is_root, is_final,
                                 input_path, output_path, payload, priority)
  values (p_job_id, v_node, p_task_type, p_pool, true, p_is_final,
          p_input_path, p_output_path, p_payload, 50)
  returning * into v_item;

  update public.jobs
     set source_type = p_source_type,
         items_total = 1
   where job_id = p_job_id;
  return v_item;
end;
$$;

-- Children discovered while processing (PDF pages, archive images, merges).
-- p_nodes: [{node_id?, parent_node_id?, node_type, classification?, logical_path?,
--            page_from?, page_to?, sequence_index?, archive_depth?, size_bytes?,
--            status?, skip_reason?, output_object_path?, metadata?}]
-- p_items: [{node_id?, task_type, pool, status? (QUEUED|BLOCKED), is_final?,
--            sequence_index?, input_path?, output_path?, payload?, priority?}]
-- Returns the number of items added. Refuses jobs that are no longer running.
create or replace function public.add_work_items(p_job_id uuid, p_nodes jsonb, p_items jsonb)
returns integer
language plpgsql
set search_path = public
as $$
declare
  v_status text;
  v_count integer;
begin
  select status into v_status from public.jobs where job_id = p_job_id for update;
  if v_status is null or v_status not in ('QUEUED','PROCESSING') then
    return 0;
  end if;

  insert into public.content_nodes (
    node_id, job_id, parent_node_id, node_type, classification, logical_path,
    page_from, page_to, sequence_index, archive_depth, size_bytes, status,
    skip_reason, output_object_path, metadata, completed_at
  )
  select coalesce(n.node_id, gen_random_uuid()), p_job_id, n.parent_node_id, n.node_type,
         n.classification, n.logical_path, n.page_from, n.page_to,
         coalesce(n.sequence_index, 0), coalesce(n.archive_depth, 0), n.size_bytes,
         coalesce(n.status, 'PENDING'), n.skip_reason, n.output_object_path,
         coalesce(n.metadata, '{}'::jsonb),
         case when coalesce(n.status, 'PENDING') in ('DONE','FAILED','SKIPPED') then now() end
    from jsonb_to_recordset(coalesce(p_nodes, '[]'::jsonb)) as n(
      node_id uuid, parent_node_id uuid, node_type text, classification text, logical_path text,
      page_from integer, page_to integer, sequence_index integer, archive_depth smallint,
      size_bytes bigint, status text, skip_reason text, output_object_path text, metadata jsonb
    );

  insert into public.work_items (
    job_id, node_id, task_type, pool, status, is_final, sequence_index,
    input_path, output_path, payload, priority
  )
  select p_job_id, i.node_id, i.task_type, i.pool, coalesce(i.status, 'QUEUED'),
         coalesce(i.is_final, false), coalesce(i.sequence_index, 0),
         i.input_path, i.output_path, coalesce(i.payload, '{}'::jsonb), coalesce(i.priority, 100)
    from jsonb_to_recordset(coalesce(p_items, '[]'::jsonb)) as i(
      node_id uuid, task_type text, pool text, status text, is_final boolean,
      sequence_index integer, input_path text, output_path text, payload jsonb, priority smallint
    )
   where coalesce(i.status, 'QUEUED') in ('QUEUED','BLOCKED');
  get diagnostics v_count = row_count;

  update public.jobs
     set items_total = items_total + v_count,
         items_skipped = items_skipped + (
           select count(*) from jsonb_to_recordset(coalesce(p_nodes, '[]'::jsonb)) as n(status text)
            where n.status = 'SKIPPED')
   where job_id = p_job_id;
  return v_count;
end;
$$;

-- ── Claim ──────────────────────────────────────────────────────────────────

-- Claims up to p_limit QUEUED items of one pool while keeping the pool's
-- in-flight count at or below p_capacity. A per-pool advisory lock makes the
-- capacity check and the claim atomic across concurrent orchestrators.
-- Fairness: each job's next item goes first (round-robin across jobs).
-- p_job_id limits the claim to one job (a browser advancing its own upload).
create or replace function public.claim_work_items(
  p_pool text,
  p_capacity integer,
  p_limit integer default 4,
  p_job_id uuid default null,
  p_lease interval default interval '6 minutes'
)
returns setof public.work_items
language plpgsql
set search_path = public
as $$
declare
  v_inflight integer;
  v_slots integer;
begin
  perform pg_advisory_xact_lock(hashtext('mdify_claim_' || p_pool));

  select count(*) into v_inflight
    from public.work_items
   where pool = p_pool and status = 'RUNNING' and lease_until > now();
  v_slots := least(greatest(p_limit, 0), greatest(p_capacity - v_inflight, 0));
  if v_slots = 0 then
    return;
  end if;

  return query
  with ranked as (
    select w.work_item_id,
           row_number() over (partition by w.job_id order by w.priority, w.sequence_index, w.created_at) as rn,
           j.created_at as job_created
      from public.work_items w
      join public.jobs j on j.job_id = w.job_id
     where w.pool = p_pool
       and w.status = 'QUEUED'
       and j.status in ('QUEUED','PROCESSING')
       and (p_job_id is null or w.job_id = p_job_id)
  ),
  picked as (
    select w.work_item_id
      from public.work_items w
      join ranked r on r.work_item_id = w.work_item_id
     order by r.rn, r.job_created, w.priority, w.sequence_index
     limit v_slots
       for update of w skip locked
  ),
  claimed as (
    update public.work_items w
       set status = 'RUNNING',
           attempt_count = w.attempt_count + 1,
           claimed_at = now(),
           lease_until = now() + p_lease,
           error_code = null,
           error_message = null
      from picked p
     where w.work_item_id = p.work_item_id
    returning w.*
  ),
  -- Data-modifying CTEs run exactly once whether or not the final SELECT reads them.
  touched as (
    update public.jobs j
       set status = 'PROCESSING',
           started_at = coalesce(j.started_at, now())
     where j.job_id in (select c.job_id from claimed c)
    returning j.job_id
  ),
  nodes as (
    update public.content_nodes n
       set status = 'PROCESSING'
      from claimed c
     where n.node_id = c.node_id and n.status = 'PENDING'
    returning n.node_id
  )
  select c.* from claimed c;
end;
$$;

-- ── Settle: unblock merges, finish or cancel the job ───────────────────────

create or replace function public.settle_job(p_job_id uuid)
returns text
language plpgsql
set search_path = public
as $$
declare
  v_job public.jobs;
  v_active integer;
  v_blocked integer;
  v_final public.work_items;
begin
  select * into v_job from public.jobs where job_id = p_job_id for update;
  if v_job.job_id is null then
    return 'not_found';
  end if;
  if v_job.status not in ('QUEUED','PROCESSING','CANCEL_REQUESTED') then
    return v_job.status;
  end if;

  select count(*) filter (where status in ('QUEUED','RUNNING')),
         count(*) filter (where status = 'BLOCKED')
    into v_active, v_blocked
    from public.work_items where job_id = p_job_id;

  if v_job.status = 'CANCEL_REQUESTED' then
    if exists (select 1 from public.work_items where job_id = p_job_id and status = 'RUNNING' and lease_until > now()) then
      return 'CANCEL_REQUESTED';
    end if;
    update public.work_items set status = 'CANCELLED', completed_at = now()
     where job_id = p_job_id and status in ('QUEUED','BLOCKED','RUNNING');
    update public.jobs
       set status = 'CANCELLED', completed_at = now(), auto_delete_at = now()
     where job_id = p_job_id;
    return 'CANCELLED';
  end if;

  if v_active > 0 then
    return v_job.status;
  end if;

  if v_blocked > 0 then
    update public.work_items set status = 'QUEUED'
     where job_id = p_job_id and status = 'BLOCKED';
    return v_job.status;
  end if;

  if not exists (select 1 from public.work_items where job_id = p_job_id) then
    return v_job.status; -- not enqueued yet
  end if;

  select * into v_final from public.work_items
   where job_id = p_job_id and is_final
   order by created_at desc limit 1;

  if v_final.work_item_id is not null and v_final.status = 'SUCCEEDED' then
    update public.jobs
       set status = 'COMPLETED',
           stage = 'COMPLETE',
           progress = 100,
           completed_at = now(),
           total_ms = round(extract(epoch from (now() - coalesce(queued_at, created_at))) * 1000),
           processing_ms = coalesce((select sum(duration_ms) from public.work_items where job_id = p_job_id), 0),
           backend_instance = coalesce(lower(v_final.assigned_backend), backend_instance)
     where job_id = p_job_id;
    update public.content_nodes set status = 'DONE', completed_at = coalesce(completed_at, now())
     where job_id = p_job_id and node_type = 'ROOT_FILE' and status in ('PENDING','PROCESSING');
    return 'COMPLETED';
  end if;

  update public.content_nodes set status = 'FAILED', completed_at = coalesce(completed_at, now())
   where job_id = p_job_id and node_type = 'ROOT_FILE' and status in ('PENDING','PROCESSING');

  update public.jobs
     set status = 'FAILED',
         stage = 'FAILED',
         completed_at = now(),
         total_ms = round(extract(epoch from (now() - coalesce(queued_at, created_at))) * 1000),
         error_code = coalesce(v_final.error_code, case when v_final.work_item_id is null then 'NO_FINAL_ITEM' end, error_code),
         error_message = coalesce(v_final.error_message, error_message)
   where job_id = p_job_id;
  return 'FAILED';
end;
$$;

-- ── Complete ───────────────────────────────────────────────────────────────

-- Records one attempt's outcome. p_outcome: SUCCEEDED | FAILED | RETRY (a
-- transient failure: requeued while attempts remain) | SKIPPED. p_attempt
-- must match the claim, so a late answer from an expired lease is ignored.
-- p_is_final can promote/demote the item (a PDF analysis that spawned pages
-- is no longer the job's final step). Returns the job status after settling.
create or replace function public.complete_work_item(
  p_work_item_id uuid,
  p_attempt integer,
  p_outcome text,
  p_backend text default null,
  p_duration_ms bigint default null,
  p_result jsonb default null,
  p_error_code text default null,
  p_error_message text default null,
  p_is_final boolean default null
)
returns text
language plpgsql
set search_path = public
as $$
declare
  v_item public.work_items;
  v_new_status text;
begin
  select * into v_item from public.work_items
   where work_item_id = p_work_item_id for update;
  if v_item.work_item_id is null then
    return 'not_found';
  end if;
  if v_item.status <> 'RUNNING' or v_item.attempt_count <> p_attempt then
    return 'stale';
  end if;

  v_new_status := case
    when p_outcome = 'RETRY' and v_item.attempt_count < v_item.max_attempts then 'QUEUED'
    when p_outcome = 'RETRY' then 'FAILED'
    else p_outcome
  end;
  if v_new_status not in ('QUEUED','SUCCEEDED','FAILED','SKIPPED') then
    raise exception 'invalid outcome %', p_outcome;
  end if;

  update public.work_items
     set status = v_new_status,
         assigned_backend = coalesce(p_backend, assigned_backend),
         duration_ms = coalesce(duration_ms, 0) + coalesce(p_duration_ms, 0),
         result = coalesce(p_result, result),
         error_code = p_error_code,
         error_message = left(p_error_message, 500),
         is_final = coalesce(p_is_final, is_final),
         lease_until = null,
         completed_at = case when v_new_status = 'QUEUED' then null else now() end
   where work_item_id = p_work_item_id;

  if v_new_status <> 'QUEUED' then
    -- A root node stays open while its children run; settle_job closes it.
    update public.content_nodes
       set status = case v_new_status when 'SUCCEEDED' then 'DONE' when 'SKIPPED' then 'SKIPPED' else 'FAILED' end,
           backend_instance = coalesce(p_backend, backend_instance),
           engine = coalesce(p_result->>'engine', engine),
           duration_ms = coalesce(p_duration_ms, duration_ms),
           output_object_path = coalesce(v_item.output_path, output_object_path),
           skip_reason = case when v_new_status in ('FAILED','SKIPPED') then left(p_error_message, 300) else skip_reason end,
           completed_at = now()
     where node_id = v_item.node_id
       and not (v_item.is_root and v_new_status = 'SUCCEEDED');
    update public.content_nodes
       set backend_instance = coalesce(p_backend, backend_instance),
           engine = coalesce(p_result->>'engine', engine),
           duration_ms = coalesce(p_duration_ms, duration_ms)
     where node_id = v_item.node_id
       and v_item.is_root and v_new_status = 'SUCCEEDED';

    update public.jobs
       set items_done = items_done + (v_new_status = 'SUCCEEDED')::int,
           items_failed = items_failed + (v_new_status = 'FAILED')::int,
           items_skipped = items_skipped + (v_new_status = 'SKIPPED')::int,
           progress = least(99, round(100.0 * (items_done + items_failed + items_skipped + 1) / greatest(items_total, 1)))
     where job_id = v_item.job_id;
  end if;

  return public.settle_job(v_item.job_id);
end;
$$;

-- ── Leases and stale jobs ──────────────────────────────────────────────────

-- Items whose lease ran out (the orchestrator died mid-request) go back to
-- QUEUED while attempts remain, then FAILED. Affected jobs are settled.
create or replace function public.requeue_expired_work_items()
returns integer
language plpgsql
set search_path = public
as $$
declare
  v_row record;
  v_jobs integer := 0;
begin
  for v_row in
    with expired as (
      update public.work_items
         set status = case when attempt_count < max_attempts then 'QUEUED' else 'FAILED' end,
             error_code = 'LEASE_EXPIRED',
             error_message = 'No result before the lease ran out',
             lease_until = null,
             completed_at = case when attempt_count < max_attempts then null else now() end
       where status = 'RUNNING' and lease_until <= now()
      returning job_id, status
    )
    select e.job_id, count(*) filter (where e.status = 'FAILED') as failed
      from expired e group by e.job_id
  loop
    update public.jobs set items_failed = items_failed + v_row.failed where job_id = v_row.job_id;
    perform public.settle_job(v_row.job_id);
    v_jobs := v_jobs + 1;
  end loop;
  return v_jobs;
end;
$$;

-- Replaces the init version: a multi-item job is stuck only when nothing
-- happened to it for p_processing_ttl (Render Free OCR of a long scan can take
-- longer than that in total, but every finished item bumps jobs.updated_at).
create or replace function public.sweep_stale_jobs(
  p_upload_ttl interval default interval '2 hours',
  p_processing_ttl interval default interval '15 minutes'
)
returns table (job_id uuid, new_status text)
language plpgsql
set search_path = public
as $$
begin
  return query
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
       and j.updated_at < now() - p_processing_ttl
       and not exists (
         select 1 from public.work_items w
          where w.job_id = j.job_id and w.status = 'RUNNING' and w.lease_until > now())
    returning j.job_id, j.status
  )
  select a.job_id, a.status from abandoned a
  union all
  select s.job_id, s.status from stuck s;

  update public.work_items w
     set status = 'CANCELLED', completed_at = now()
    from public.jobs j
   where w.job_id = j.job_id
     and j.status in ('FAILED','CANCELLED')
     and w.status in ('QUEUED','BLOCKED');
end;
$$;

-- ── Storage budget ─────────────────────────────────────────────────────────

-- Bytes currently stored in a bucket (Supabase Free: 1 GB for the project).
create or replace function public.storage_usage_bytes(p_bucket text)
returns bigint
language sql
stable
set search_path = public
as $$
  select coalesce(sum((o.metadata->>'size')::bigint), 0)::bigint
    from storage.objects o
   where o.bucket_id = p_bucket;
$$;

-- ── After deletion: forget names ───────────────────────────────────────────

-- Called by the cleanup function once a job's files are gone from Storage.
-- Keeps the statistics (types, sizes, counts, timings) and drops everything
-- that could name the user's files: the upload name, paths inside archives,
-- per-item payloads and the name fields of results.
create or replace function public.forget_job_details(p_job_id uuid)
returns void
language sql
set search_path = public
as $$
  update public.jobs set original_filename = null where job_id = p_job_id;
  update public.content_nodes set logical_path = null where job_id = p_job_id;
  update public.work_items
     set payload = '{}'::jsonb,
         result = case when result is null then null
                       else result - 'filename' - 'original_name' - 'outputs' - 'primary_output' end
   where job_id = p_job_id;
$$;

-- ── Admin: one job's tree ──────────────────────────────────────────────────

create or replace function public.get_job_tree(p_job_id uuid)
returns jsonb
language sql
stable
set search_path = public
as $$
  select jsonb_build_object(
    'job', (select to_jsonb(j) - 'metadata' from public.jobs j where j.job_id = p_job_id),
    'nodes', coalesce((
      select jsonb_agg(to_jsonb(n) - 'metadata' order by n.sequence_index, n.created_at)
        from public.content_nodes n where n.job_id = p_job_id), '[]'::jsonb),
    'items', coalesce((
      select jsonb_agg(to_jsonb(w) - 'payload' - 'result' order by w.created_at)
        from public.work_items w where w.job_id = p_job_id), '[]'::jsonb),
    'events', coalesce((
      select jsonb_agg(to_jsonb(e) order by e.created_at)
        from public.job_events e where e.job_id = p_job_id), '[]'::jsonb)
  );
$$;

-- ── KPIs (replaces the init version, adds the content-aware numbers) ───────

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
    'failed_today',     (select count(*) from public.jobs where status = 'FAILED' and completed_at >= date_trunc('day', now())),
    'partial_today',    (select count(*) from public.jobs where status = 'COMPLETED' and completed_at >= date_trunc('day', now())
                           and (items_failed > 0 or items_skipped > 0 or cardinality(warnings) > 0))
  ),
  'workloads', jsonb_build_object(
    'normal_today',  (select count(*) from public.jobs where workload_type = 'NORMAL' and created_at >= date_trunc('day', now())),
    'ocr_today',     (select count(*) from public.jobs where workload_type = 'OCR' and created_at >= date_trunc('day', now())),
    'archive_today', (select count(*) from public.jobs where source_type = 'ARCHIVE' and created_at >= date_trunc('day', now())),
    'pdf_today',     (select count(*) from public.jobs where source_type = 'PDF' and created_at >= date_trunc('day', now())),
    'hybrid_pdf_today', (select count(distinct w.job_id) from public.work_items w join public.jobs j on j.job_id = w.job_id
                          where w.task_type = 'PDF_PAGE_OCR' and j.created_at >= date_trunc('day', now()))
  ),
  'nodes', jsonb_build_object(
    'processed_today', (select count(*) from public.content_nodes where completed_at >= date_trunc('day', now()) and status = 'DONE'),
    'ocr_today',       (select count(*) from public.work_items where task_type in ('OCR_IMAGE','PDF_PAGE_OCR')
                          and status = 'SUCCEEDED' and completed_at >= date_trunc('day', now())),
    'skipped_today',   (select count(*) from public.content_nodes where status = 'SKIPPED' and created_at >= date_trunc('day', now())),
    'nested_archives', (select count(*) from public.content_nodes where node_type = 'NESTED_ARCHIVE' and created_at >= date_trunc('day', now())),
    'avg_per_archive', (select coalesce(round(avg(c.n), 1), 0) from (
                          select count(*) as n from public.content_nodes n join public.jobs j on j.job_id = n.job_id
                           where j.source_type = 'ARCHIVE' and j.created_at >= date_trunc('day', now())
                           group by n.job_id) c),
    'pdf_ocr_page_ratio', (select coalesce(round(
                             count(*) filter (where classification = 'PDF_OCR')::numeric
                             / nullif(count(*) filter (where node_type in ('PDF_PAGE','PDF_SEGMENT')), 0), 3), 0)
                             from public.content_nodes where created_at >= date_trunc('day', now()))
  ),
  'queue', jsonb_build_object(
    'queued',  (select count(*) from public.work_items where status = 'QUEUED'),
    'running', (select count(*) from public.work_items where status = 'RUNNING' and lease_until > now()),
    'by_pool', coalesce((select jsonb_object_agg(pool, n) from (
                 select pool, count(*) as n from public.work_items where status in ('QUEUED','RUNNING') group by pool) q), '{}'::jsonb)
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

-- ── Access control ─────────────────────────────────────────────────────────

alter table public.content_nodes enable row level security;
alter table public.work_items enable row level security;

revoke all on public.content_nodes, public.work_items from public, anon, authenticated;
grant select, insert, update, delete on public.content_nodes, public.work_items to service_role;

revoke all on function public.enqueue_root(uuid, text, text, text, text, text, text, boolean, jsonb) from public, anon, authenticated;
revoke all on function public.add_work_items(uuid, jsonb, jsonb) from public, anon, authenticated;
revoke all on function public.claim_work_items(text, integer, integer, uuid, interval) from public, anon, authenticated;
revoke all on function public.settle_job(uuid) from public, anon, authenticated;
revoke all on function public.complete_work_item(uuid, integer, text, text, bigint, jsonb, text, text, boolean) from public, anon, authenticated;
revoke all on function public.requeue_expired_work_items() from public, anon, authenticated;
revoke all on function public.sweep_stale_jobs(interval, interval) from public, anon, authenticated;
revoke all on function public.storage_usage_bytes(text) from public, anon, authenticated;
revoke all on function public.get_job_tree(uuid) from public, anon, authenticated;
revoke all on function public.forget_job_details(uuid) from public, anon, authenticated;
revoke all on function public.get_admin_kpis() from public, anon, authenticated;

grant execute on function public.enqueue_root(uuid, text, text, text, text, text, text, boolean, jsonb) to service_role;
grant execute on function public.add_work_items(uuid, jsonb, jsonb) to service_role;
grant execute on function public.claim_work_items(text, integer, integer, uuid, interval) to service_role;
grant execute on function public.settle_job(uuid) to service_role;
grant execute on function public.complete_work_item(uuid, integer, text, text, bigint, jsonb, text, text, boolean) to service_role;
grant execute on function public.requeue_expired_work_items() to service_role;
grant execute on function public.sweep_stale_jobs(interval, interval) to service_role;
grant execute on function public.storage_usage_bytes(text) to service_role;
grant execute on function public.get_job_tree(uuid) to service_role;
grant execute on function public.forget_job_details(uuid) to service_role;
grant execute on function public.get_admin_kpis() to service_role;
