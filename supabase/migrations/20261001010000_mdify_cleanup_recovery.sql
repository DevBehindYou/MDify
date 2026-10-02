-- Lease ownership for cleanup. Pause the cleanup cron while migrating/deploying.
alter table public.jobs add column if not exists cleanup_token uuid;
alter table public.jobs add column if not exists cleanup_lease_until timestamptz;

create or replace function public.cleanup_is_due(j public.jobs)
returns boolean language sql stable set search_path = public as $$
  select j.files_deleted_at is null and j.status in ('COMPLETED','FAILED','CANCELLED')
    and ((j.retention_mode = 'AUTO' and j.auto_delete_at <= now())
      or (j.retention_mode = 'EXTEND' and j.retention_extended_until <= now()))
    and not exists(select 1 from public.work_items w where w.job_id = j.job_id and w.status = 'RUNNING' and w.lease_until > now());
$$;

create or replace function public.claim_cleanup_batch(
  batch_size integer default 100, p_claim_ttl interval default interval '30 minutes', p_max_attempts integer default 5
) returns setof public.jobs language plpgsql set search_path = public as $$
begin
  if p_claim_ttl is null or p_claim_ttl <= interval '0' or p_claim_ttl > interval '30 minutes' then raise exception 'invalid cleanup lease'; end if;
  update public.jobs j set cleanup_state = 'ERROR', cleanup_token = null, cleanup_lease_until = null,
    cleanup_last_error = coalesce(cleanup_last_error, 'max cleanup attempts reached')
    where public.cleanup_is_due(j) and cleanup_attempt_count >= p_max_attempts and cleanup_state <> 'ERROR'
      and (cleanup_state in ('IDLE','PARTIAL') or (cleanup_state in ('CLAIMED','DELETING')
        and coalesce(cleanup_lease_until, cleanup_claimed_at + p_claim_ttl, '-infinity'::timestamptz) <= now()));
  return query with candidates as (
    select j.job_id from public.jobs j where public.cleanup_is_due(j) and j.cleanup_attempt_count < p_max_attempts
      and (j.cleanup_state in ('IDLE','ERROR','PARTIAL') or (j.cleanup_state in ('CLAIMED','DELETING')
        and coalesce(j.cleanup_lease_until, j.cleanup_claimed_at + p_claim_ttl, '-infinity'::timestamptz) <= now()))
      order by coalesce(j.retention_extended_until,j.auto_delete_at) for update skip locked limit greatest(1,least(batch_size,500))
  ) update public.jobs j set cleanup_state = 'CLAIMED', cleanup_token = gen_random_uuid(),
      cleanup_claimed_at = now(), cleanup_lease_until = now() + p_claim_ttl,
      cleanup_attempt_count = j.cleanup_attempt_count + 1, cleanup_last_error = null
    from candidates c where j.job_id = c.job_id returning j.*;
end;
$$;

-- The admin path claims one due terminal job using the same ownership rules.
create or replace function public.claim_job_cleanup(p_job_id uuid)
returns public.jobs language plpgsql set search_path = public as $$
declare j public.jobs;
begin
  select * into j from public.jobs where job_id = p_job_id for update;
  if j.job_id is null or not coalesce(public.cleanup_is_due(j),false) or j.cleanup_state = 'COMPLETE'
    or (j.cleanup_state in ('CLAIMED','DELETING') and coalesce(j.cleanup_lease_until,j.cleanup_claimed_at + interval '30 minutes','-infinity'::timestamptz) > now()) then return null; end if;
  update public.jobs set cleanup_state = 'CLAIMED', cleanup_token = gen_random_uuid(), cleanup_claimed_at = now(),
    cleanup_lease_until = now() + interval '30 minutes', cleanup_attempt_count = cleanup_attempt_count + 1, cleanup_last_error = null
    where job_id = p_job_id returning * into j;
  return j;
end;
$$;

-- Renew before each Storage request. Retention cannot change once deletion begins.
create or replace function public.begin_job_cleanup(p_job_id uuid, p_token uuid)
returns boolean language plpgsql set search_path = public as $$
begin
  update public.jobs j set cleanup_state = 'DELETING', cleanup_lease_until = now() + interval '30 minutes'
    where job_id = p_job_id and cleanup_token = p_token and cleanup_lease_until > now()
      and cleanup_state in ('CLAIMED','DELETING') and public.cleanup_is_due(j);
  if not found then return false; end if;
  update public.file_objects set storage_status = 'DELETE_PENDING' where job_id = p_job_id and storage_status <> 'DELETED';
  return true;
end;
$$;

create or replace function public.finish_job_cleanup(p_job_id uuid, p_token uuid)
returns boolean language plpgsql set search_path = public as $$
declare j public.jobs;
begin
  select * into j from public.jobs where job_id = p_job_id for update;
  if j.cleanup_token is distinct from p_token or p_token is null or j.cleanup_lease_until is null or j.cleanup_lease_until <= now()
    or j.cleanup_state <> 'DELETING' or not coalesce(public.cleanup_is_due(j),false) then return false; end if;
  perform public.mark_job_files_deleted(p_job_id);
  update public.jobs set cleanup_token = null, cleanup_lease_until = null where job_id = p_job_id;
  return true;
end;
$$;

create or replace function public.fail_job_cleanup(p_job_id uuid, p_token uuid)
returns boolean language plpgsql set search_path = public as $$
begin
  update public.jobs set cleanup_state = 'PARTIAL', cleanup_last_error = 'Storage or metadata cleanup failed', cleanup_token = null, cleanup_lease_until = null
    where job_id = p_job_id and p_token is not null and cleanup_token = p_token and cleanup_lease_until > now() and cleanup_state in ('CLAIMED','DELETING');
  return found;
end;
$$;

create or replace function public.admin_set_retention(p_job_id uuid,p_mode text,p_hours integer default null)
returns text language plpgsql set search_path = public as $$
declare j public.jobs;
begin
  if p_mode not in ('KEEP','EXTEND','AUTO') then raise exception 'unknown retention mode'; end if;
  if p_mode = 'EXTEND' and (p_hours is null or p_hours < 1 or p_hours > 2160) then raise exception 'invalid extension'; end if;
  select * into j from public.jobs where job_id = p_job_id for update;
  if j.job_id is null then return 'not_found'; end if;
  if j.files_deleted_at is not null then return 'files_deleted'; end if;
  if j.cleanup_state in ('DELETING','PARTIAL') or exists(select 1 from public.file_objects where job_id = p_job_id and storage_status = 'DELETE_PENDING') then return 'cleanup_in_progress'; end if;
  update public.jobs set retention_mode = p_mode,
    retention_extended_until = case when p_mode = 'EXTEND' then now() + make_interval(hours => p_hours) else null end,
    auto_delete_at = case when p_mode = 'AUTO' then greatest(coalesce(upload_completed_at,created_at) + interval '48 hours',now()) else auto_delete_at end,
    cleanup_state = 'IDLE', cleanup_token = null, cleanup_lease_until = null where job_id = p_job_id;
  return 'ok';
end;
$$;

create or replace function public.request_delete_now(p_job_id uuid)
returns text language plpgsql set search_path = public as $$
declare j public.jobs; v_status text;
begin
  select * into j from public.jobs where job_id = p_job_id for update;
  if j.job_id is null then return 'not_found'; end if;
  if j.files_deleted_at is not null then return 'files_deleted'; end if;
  if j.cleanup_state in ('CLAIMED','DELETING') and coalesce(j.cleanup_lease_until,j.cleanup_claimed_at + interval '30 minutes','-infinity'::timestamptz) > now() then return 'cleanup_in_progress'; end if;
  update public.jobs set retention_mode = 'AUTO', auto_delete_at = now(), retention_extended_until = null,
    cleanup_state = 'IDLE', cleanup_token = null, cleanup_lease_until = null where job_id = p_job_id;
  if j.status in ('UPLOADING','QUEUED','PROCESSING','CANCEL_REQUESTED') then
    update public.jobs set status = 'CANCEL_REQUESTED' where job_id = p_job_id;
    v_status := public.settle_job(p_job_id);
    if v_status = 'CANCEL_REQUESTED' then return 'cancel_requested'; end if;
  end if;
  return 'due_now';
end;
$$;

-- Catch cancellation requests that had no live work and therefore no future completion.
create or replace function public.settle_cancelled_jobs()
returns integer language plpgsql set search_path = public as $$
declare j record; n integer := 0;
begin
  for j in select job_id from public.jobs where status = 'CANCEL_REQUESTED' for update skip locked loop
    if public.settle_job(j.job_id) = 'CANCELLED' then n := n + 1; end if;
  end loop;
  return n;
end;
$$;

create or replace function public.forget_job_details(p_job_id uuid)
returns void language sql set search_path = public as $$
  update public.jobs set original_filename = null, metadata = '{}'::jsonb, warnings = '{}'::text[], error_message = null, cleanup_last_error = null where job_id = p_job_id;
  update public.file_objects set original_filename = null, metadata = '{}'::jsonb where job_id = p_job_id;
  update public.content_nodes set logical_path = null, metadata = '{}'::jsonb, skip_reason = null where job_id = p_job_id;
  update public.work_items set payload = '{}'::jsonb, error_message = null,
    result = case when result is null then null else coalesce((select jsonb_object_agg(key,value) from jsonb_each(result) where key in ('char_count','word_count','tokens_est','output_bytes','engine','backend_role','backend_instance','mode')), '{}'::jsonb) end where job_id = p_job_id;
  update public.job_events set message = null, details = '{}'::jsonb where job_id = p_job_id;
$$;

-- Some Supabase projects grant broad default table privileges to service_role.
revoke update, delete, truncate on public.audit_logs from service_role;
revoke all on function public.cleanup_is_due(public.jobs) from public,anon,authenticated;
grant execute on function public.cleanup_is_due(public.jobs) to service_role;
revoke all on function public.claim_job_cleanup(uuid) from public,anon,authenticated;
grant execute on function public.claim_job_cleanup(uuid) to service_role;
revoke all on function public.begin_job_cleanup(uuid,uuid) from public,anon,authenticated;
grant execute on function public.begin_job_cleanup(uuid,uuid) to service_role;
revoke all on function public.finish_job_cleanup(uuid,uuid) from public,anon,authenticated;
grant execute on function public.finish_job_cleanup(uuid,uuid) to service_role;
revoke all on function public.fail_job_cleanup(uuid,uuid) from public,anon,authenticated;
grant execute on function public.fail_job_cleanup(uuid,uuid) to service_role;
revoke all on function public.settle_cancelled_jobs() from public,anon,authenticated;
grant execute on function public.settle_cancelled_jobs() to service_role;
