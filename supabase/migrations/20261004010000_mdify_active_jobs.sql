-- Apply before the upload frontend. Existing jobs continue; no rows are deleted.
-- This bounds active roots, not physical Storage bytes or expanded child items.
create or replace function public.guard_active_job_capacity()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.status not in ('UPLOADING','QUEUED','PROCESSING','CANCEL_REQUESTED') then return new; end if;
  if tg_op = 'UPDATE' and old.status in ('UPLOADING','QUEUED','PROCESSING','CANCEL_REQUESTED') then return new; end if;
  perform pg_advisory_xact_lock(hashtext('mdify_active_job_capacity'));
  if (select count(*) from public.jobs where status in ('UPLOADING','QUEUED','PROCESSING','CANCEL_REQUESTED')) >= 32 then
    raise exception using errcode = 'PT503', message = 'MDify is handling many jobs. Please try again shortly.';
  end if;
  return new;
end;
$$;
drop trigger if exists mdify_active_job_capacity on public.jobs;
create trigger mdify_active_job_capacity before insert or update of status on public.jobs
for each row execute function public.guard_active_job_capacity();

create or replace function public.create_upload_job(
  p_bucket text, p_filename text, p_extension text, p_size bigint,
  p_mime text, p_profile text, p_source_type text, p_workload_type text
) returns jsonb language plpgsql set search_path = public as $$
declare j public.jobs;
begin
  if p_bucket is null or length(p_bucket) not between 1 and 100
    or p_filename is null or length(p_filename) not between 1 and 1024
    or p_extension is null or p_extension !~ '^[a-z0-9]{1,10}$'
    or p_size is null or p_size <= 0 or p_size > 15 * 1024 * 1024
    or p_source_type is null or p_source_type not in ('DOCUMENT','PDF','IMAGE','ARCHIVE')
    or p_workload_type is null or p_workload_type not in ('NORMAL','OCR','ARCHIVE')
    or (p_source_type = 'IMAGE' and p_size > 10 * 1024 * 1024) then
    raise exception 'invalid upload metadata';
  end if;
  insert into public.jobs(status,workload_type,source_type,profile,source_extension,source_mime,original_filename)
    values('UPLOADING',p_workload_type,p_source_type,p_profile,p_extension,p_mime,p_filename) returning * into j;
  insert into public.file_objects(job_id,bucket,object_path,kind,original_filename,extension,mime_type,size_bytes,storage_status)
    values(j.job_id,p_bucket,'jobs/' || j.job_id || '/input/source.' || p_extension,'INPUT',p_filename,p_extension,p_mime,p_size,'PENDING');
  return jsonb_build_object('allowed',true,'job_id',j.job_id);
exception when sqlstate 'PT503' then
  return jsonb_build_object('allowed',false,'retry_after',30);
end;
$$;

revoke all on function public.guard_active_job_capacity() from public,anon,authenticated;
revoke all on function public.create_upload_job(text,text,text,bigint,text,text,text,text) from public,anon,authenticated;
grant execute on function public.guard_active_job_capacity() to service_role;
grant execute on function public.create_upload_job(text,text,text,bigint,text,text,text,text) to service_role;
