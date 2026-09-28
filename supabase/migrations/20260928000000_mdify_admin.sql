-- MDify admin (/mdify-controller): list pages, retention changes and the one
-- place that records a job's files as deleted. Called only by the Next.js
-- admin routes and the cleanup function with the service role key.

-- ── Job list (keyset pagination, newest first) ─────────────────────────────

-- p_before / p_before_id: the created_at and job_id of the last row of the
-- previous page. Filters are optional. Returns one JSON array of list rows.
create or replace function public.admin_list_jobs(
  p_limit integer default 50,
  p_before timestamptz default null,
  p_before_id uuid default null,
  p_status text default null,
  p_source text default null
)
returns jsonb
language sql
stable
set search_path = public
as $$
  select coalesce(jsonb_agg(page.row order by page.created_at desc, page.job_id desc), '[]'::jsonb)
    from (
      select j.created_at, j.job_id, jsonb_build_object(
           'job_id', j.job_id,
           'status', j.status,
           'source_type', j.source_type,
           'source_extension', j.source_extension,
           'original_filename', j.original_filename,
           'profile', j.profile,
           'progress', j.progress,
           'backend_instance', j.backend_instance,
           'engine', j.engine,
           'items_total', j.items_total,
           'items_done', j.items_done,
           'items_failed', j.items_failed,
           'items_skipped', j.items_skipped,
           'warnings', j.warnings,
           'error_code', j.error_code,
           'created_at', j.created_at,
           'completed_at', j.completed_at,
           'processing_ms', j.processing_ms,
           'retention_mode', j.retention_mode,
           'delete_at', coalesce(j.retention_extended_until, j.auto_delete_at),
           'files_deleted_at', j.files_deleted_at,
           'cleanup_state', j.cleanup_state,
           'cleanup_last_error', j.cleanup_last_error,
           'input_bytes', (select sum(f.size_bytes) from public.file_objects f
                            where f.job_id = j.job_id and f.kind = 'INPUT'),
           'output_bytes', (select sum(f.size_bytes) from public.file_objects f
                             where f.job_id = j.job_id and f.kind = 'OUTPUT')
         ) as row
    from public.jobs j
   where (p_status is null or j.status = p_status
          or (p_status = 'CLEANUP_ERROR' and j.cleanup_state in ('PARTIAL','ERROR')))
     and (p_source is null or j.source_type = p_source)
     and (p_before is null
          or j.created_at < p_before
          or (j.created_at = p_before and j.job_id < p_before_id))
   order by j.created_at desc, j.job_id desc
   limit least(greatest(coalesce(p_limit, 50), 1), 200)
    ) page;
$$;

-- Stored files and the audit log, newest first, same cursor scheme.
create or replace function public.admin_list_files(
  p_limit integer default 100,
  p_before timestamptz default null,
  p_before_id uuid default null,
  p_status text default 'ACTIVE'
)
returns jsonb
language sql
stable
set search_path = public
as $$
  select coalesce(jsonb_agg(to_jsonb(page) order by page.created_at desc, page.file_id desc), '[]'::jsonb)
    from (
      select f.file_id, f.job_id, f.kind, f.object_path, f.extension, f.size_bytes, f.storage_status,
             f.created_at, f.deleted_at
        from public.file_objects f
       where (p_status is null or f.storage_status = p_status)
         and (p_before is null
              or f.created_at < p_before
              or (f.created_at = p_before and f.file_id < p_before_id))
       order by f.created_at desc, f.file_id desc
       limit least(greatest(coalesce(p_limit, 100), 1), 200)
    ) page;
$$;

create or replace function public.admin_list_audit(
  p_limit integer default 100,
  p_before timestamptz default null,
  p_before_id uuid default null
)
returns jsonb
language sql
stable
set search_path = public
as $$
  select coalesce(jsonb_agg(to_jsonb(page) order by page.created_at desc, page.audit_id desc), '[]'::jsonb)
    from (
      select a.audit_id, a.actor_type, a.actor_id, a.action, a.target_type, a.job_id, a.details, a.created_at
        from public.audit_logs a
       where p_before is null
          or a.created_at < p_before
          or (a.created_at = p_before and a.audit_id < p_before_id)
       order by a.created_at desc, a.audit_id desc
       limit least(greatest(coalesce(p_limit, 100), 1), 200)
    ) page;
$$;

-- ── Retention ──────────────────────────────────────────────────────────────

-- KEEP: never deleted automatically. EXTEND: deleted p_hours from now.
-- AUTO: back to the default deadline (48 h after upload), or now if that
-- has passed. Files already deleted cannot come back.
create or replace function public.admin_set_retention(p_job_id uuid, p_mode text, p_hours integer default null)
returns text
language plpgsql
set search_path = public
as $$
declare
  v_job public.jobs;
begin
  if p_mode not in ('KEEP','EXTEND','AUTO') then
    raise exception 'unknown retention mode %', p_mode;
  end if;
  select * into v_job from public.jobs where job_id = p_job_id for update;
  if v_job.job_id is null then
    return 'not_found';
  elsif v_job.files_deleted_at is not null then
    return 'files_deleted';
  end if;

  if p_mode = 'KEEP' then
    update public.jobs set retention_mode = 'KEEP', retention_extended_until = null where job_id = p_job_id;
  elsif p_mode = 'EXTEND' then
    if p_hours is null or p_hours < 1 or p_hours > 24 * 90 then
      raise exception 'extension must be between 1 hour and 90 days';
    end if;
    update public.jobs
       set retention_mode = 'EXTEND',
           retention_extended_until = now() + make_interval(hours => p_hours)
     where job_id = p_job_id;
  else
    update public.jobs
       set retention_mode = 'AUTO',
           retention_extended_until = null,
           auto_delete_at = greatest(coalesce(upload_completed_at, created_at) + interval '48 hours', now())
     where job_id = p_job_id;
  end if;
  return 'ok';
end;
$$;

-- A job whose cleanup gave up (ERROR) or stopped half way (PARTIAL) gets a
-- fresh set of attempts on the next cleanup run.
create or replace function public.admin_retry_cleanup(p_job_id uuid)
returns text
language sql
set search_path = public
as $$
  update public.jobs
     set cleanup_state = 'IDLE', cleanup_attempt_count = 0, cleanup_last_error = null
   where job_id = p_job_id and cleanup_state in ('PARTIAL','ERROR') and files_deleted_at is null
  returning 'ok';
$$;

-- ── Files deleted ──────────────────────────────────────────────────────────

-- The Storage objects under jobs/<id>/ are gone (removed by the cleanup
-- function or an admin DELETE_NOW): record it and forget the names.
create or replace function public.mark_job_files_deleted(p_job_id uuid)
returns void
language plpgsql
set search_path = public
as $$
begin
  update public.file_objects
     set storage_status = 'DELETED', deleted_at = coalesce(deleted_at, now())
   where job_id = p_job_id and storage_status <> 'DELETED';
  update public.jobs
     set cleanup_state = 'COMPLETE',
         files_deleted_at = coalesce(files_deleted_at, now()),
         cleanup_last_error = null
   where job_id = p_job_id;
  perform public.forget_job_details(p_job_id);
end;
$$;

-- ── Access control ─────────────────────────────────────────────────────────

revoke all on function public.admin_list_jobs(integer, timestamptz, uuid, text, text) from public, anon, authenticated;
revoke all on function public.admin_list_files(integer, timestamptz, uuid, text) from public, anon, authenticated;
revoke all on function public.admin_list_audit(integer, timestamptz, uuid) from public, anon, authenticated;
revoke all on function public.admin_set_retention(uuid, text, integer) from public, anon, authenticated;
revoke all on function public.admin_retry_cleanup(uuid) from public, anon, authenticated;
revoke all on function public.mark_job_files_deleted(uuid) from public, anon, authenticated;

grant execute on function public.admin_list_jobs(integer, timestamptz, uuid, text, text) to service_role;
grant execute on function public.admin_list_files(integer, timestamptz, uuid, text) to service_role;
grant execute on function public.admin_list_audit(integer, timestamptz, uuid) to service_role;
grant execute on function public.admin_set_retention(uuid, text, integer) to service_role;
grant execute on function public.admin_retry_cleanup(uuid) to service_role;
grant execute on function public.mark_job_files_deleted(uuid) to service_role;
