-- Apply before the new frontend. Existing upload RPCs keep their signature.
-- Serializes upload forecasts; conversion expansion remains an estimate, not
-- enforcement on every worker write. No Storage-owned tables are modified.
create table if not exists public.job_storage_reservations (
  job_id uuid not null references public.jobs(job_id) on delete restrict,
  bucket text not null,
  input_path text not null,
  reserved_bytes bigint not null check (reserved_bytes > 0),
  upload_ceiling_bytes bigint not null check (upload_ceiling_bytes > 0),
  upload_guard_until timestamptz not null,
  primary key (job_id, bucket)
);
create index if not exists idx_storage_reservations_bucket on public.job_storage_reservations(bucket);
alter table public.job_storage_reservations enable row level security;
revoke all on public.job_storage_reservations from public, anon, authenticated;
grant select, insert, update, delete on public.job_storage_reservations to service_role;

-- Include in-flight uploads during rollout. Reapplying does not renew guards.
-- 3 h includes the 2 h signed URL lifetime plus signing/in-flight grace.
insert into public.job_storage_reservations(job_id,bucket,input_path,reserved_bytes,upload_ceiling_bytes,upload_guard_until)
select j.job_id, f.bucket, f.object_path,
  greatest(coalesce(b.file_size_limit,15728640),coalesce(f.size_bytes,0) * case when j.source_type in ('PDF','ARCHIVE') then 3 else 2 end),
  coalesce(b.file_size_limit,15728640), clock_timestamp() + interval '3 hours'
from public.jobs j join public.file_objects f on f.job_id=j.job_id and f.kind='INPUT'
join storage.buckets b on b.id=f.bucket
where j.status in ('UPLOADING','QUEUED','PROCESSING','CANCEL_REQUESTED') or j.created_at > clock_timestamp()-interval '3 hours'
on conflict (job_id,bucket) do nothing;

-- Fresh actual bytes plus unspent commitments. Every object, including
-- retained results, unknown prefixes and orphan files, counts toward usage.
create or replace function public.storage_capacity_snapshot(p_bucket text)
returns jsonb language plpgsql set search_path = public as $$
declare v_used bigint; v_pending bigint;
begin
  if not exists(select 1 from storage.buckets where id=p_bucket) then raise exception 'unknown storage bucket'; end if;
  if exists(select 1 from storage.objects where bucket_id=p_bucket
    and (metadata->>'size' is null or metadata->>'size' !~ '^[0-9]{1,18}$')) then
    raise exception 'storage size metadata unavailable';
  end if;
  select coalesce(sum((metadata->>'size')::bigint),0)::bigint into v_used from storage.objects where bucket_id=p_bucket;
  select coalesce(sum(case
    when j.status in ('UPLOADING','QUEUED','PROCESSING','CANCEL_REQUESTED') then greatest(0,r.reserved_bytes-coalesce(o.all_bytes,0),
      case when r.upload_guard_until > clock_timestamp() then r.upload_ceiling_bytes-coalesce(o.input_bytes,0) else 0 end)
    when r.upload_guard_until > clock_timestamp() then greatest(0,r.upload_ceiling_bytes-coalesce(o.input_bytes,0))
    else 0 end),0)::bigint into v_pending
  from public.job_storage_reservations r join public.jobs j on j.job_id=r.job_id
  left join lateral (
    select sum((s.metadata->>'size')::bigint) as all_bytes,
      sum(case when s.name=r.input_path then (s.metadata->>'size')::bigint else 0 end) as input_bytes
    from storage.objects s where s.bucket_id=r.bucket and s.name like 'jobs/' || r.job_id || '/%'
  ) o on true where r.bucket=p_bucket;
  return jsonb_build_object('used_bytes',v_used,'pending_bytes',v_pending,'committed_bytes',v_used+v_pending);
end;
$$;

create or replace function public.create_reserved_upload_job(
  p_bucket text, p_filename text, p_extension text, p_size bigint,
  p_mime text, p_profile text, p_source_type text, p_workload_type text,
  p_budget_bytes bigint default 838860800
) returns jsonb language plpgsql set search_path = public as $$
declare j public.jobs; v_ceiling bigint; v_needed bigint; v_snapshot jsonb; v_budget bigint;
begin
  if p_bucket is null or length(p_bucket) not between 1 and 100
    or p_filename is null or length(p_filename) not between 1 and 1024
    or p_extension is null or p_extension !~ '^[a-z0-9]{1,10}$'
    or p_size is null or p_size <= 0 or p_size > 15728640
    or p_source_type is null or p_source_type not in ('DOCUMENT','PDF','IMAGE','ARCHIVE')
    or p_workload_type is null or p_workload_type not in ('NORMAL','OCR','ARCHIVE')
    or (p_source_type = 'IMAGE' and p_size > 10485760)
    or p_budget_bytes is null or p_budget_bytes <= 0 then raise exception 'invalid upload metadata'; end if;
  -- Every deployment shares an 800 MiB ceiling; an environment can lower it.
  v_budget := least(p_budget_bytes,838860800);
  perform pg_advisory_xact_lock(hashtext('mdify_storage_capacity'),hashtext(p_bucket));
  select file_size_limit into v_ceiling from storage.buckets where id=p_bucket;
  -- Signed tokens do not enforce the declared length. Reserve the bucket's
  -- actual single-object ceiling and refuse an unknown/raised upload limit.
  if v_ceiling is null or v_ceiling <= 0 or v_ceiling > 15728640 then raise exception 'unsupported bucket upload limit'; end if;
  if p_size > v_ceiling then raise exception 'upload exceeds bucket limit'; end if;
  delete from public.job_storage_reservations r using public.jobs existing_job
    where r.bucket=p_bucket and existing_job.job_id=r.job_id and r.upload_guard_until<=clock_timestamp()
      and existing_job.status not in ('UPLOADING','QUEUED','PROCESSING','CANCEL_REQUESTED');
  v_needed := greatest(v_ceiling,p_size * case when p_source_type in ('PDF','ARCHIVE') then 3 else 2 end);
  v_snapshot := public.storage_capacity_snapshot(p_bucket);
  if (v_snapshot->>'committed_bytes')::bigint + v_needed > v_budget then
    return jsonb_build_object('allowed',false,'reason','storage_capacity','retry_after',30);
  end if;
  insert into public.jobs(status,workload_type,source_type,profile,source_extension,source_mime,original_filename)
    values('UPLOADING',p_workload_type,p_source_type,p_profile,p_extension,p_mime,p_filename) returning * into j;
  insert into public.file_objects(job_id,bucket,object_path,kind,original_filename,extension,mime_type,size_bytes,storage_status)
    values(j.job_id,p_bucket,'jobs/' || j.job_id || '/input/source.' || p_extension,'INPUT',p_filename,p_extension,p_mime,p_size,'PENDING');
  insert into public.job_storage_reservations(job_id,bucket,input_path,reserved_bytes,upload_ceiling_bytes,upload_guard_until)
    values(j.job_id,p_bucket,'jobs/' || j.job_id || '/input/source.' || p_extension,v_needed,v_ceiling,clock_timestamp()+interval '3 hours');
  return jsonb_build_object('allowed',true,'job_id',j.job_id);
exception when sqlstate 'PT503' then
  return jsonb_build_object('allowed',false,'reason','active_jobs','retry_after',30);
end;
$$;

-- Rolling deployments and rollback use the same reservations via the old RPC.
create or replace function public.create_upload_job(
  p_bucket text, p_filename text, p_extension text, p_size bigint,
  p_mime text, p_profile text, p_source_type text, p_workload_type text
) returns jsonb language sql set search_path = public as $$
  select public.create_reserved_upload_job(p_bucket,p_filename,p_extension,p_size,p_mime,p_profile,p_source_type,p_workload_type,838860800);
$$;
revoke all on function public.storage_capacity_snapshot(text) from public,anon,authenticated;
revoke all on function public.create_reserved_upload_job(text,text,text,bigint,text,text,text,text,bigint) from public,anon,authenticated;
revoke all on function public.create_upload_job(text,text,text,bigint,text,text,text,text) from public,anon,authenticated;
grant execute on function public.storage_capacity_snapshot(text) to service_role;
grant execute on function public.create_reserved_upload_job(text,text,text,bigint,text,text,text,text,bigint) to service_role;
grant execute on function public.create_upload_job(text,text,text,bigint,text,text,text,text) to service_role;
