-- Atomic, replay-safe transitions. Apply before deploying the frontend changes.
-- Existing RPC signatures remain available for rolling deployments.
create or replace function public.start_uploaded_job(p_job_id uuid, p_bucket text, p_verified_size bigint)
returns public.work_items
language plpgsql set search_path = public as $$
declare
  j public.jobs; f public.file_objects; w public.work_items;
  v_task text; v_pool text; v_source text; v_profile text;
begin
  select * into j from public.jobs where job_id = p_job_id for update;
  if j.job_id is null or j.status not in ('UPLOADING','QUEUED') then return null; end if;
  select * into w from public.work_items where job_id = p_job_id and is_root;
  if w.work_item_id is not null then return w; end if;
  select * into f from public.file_objects where job_id = p_job_id and kind = 'INPUT' and bucket = p_bucket for update;
  if f.file_id is null or p_verified_size is null or p_verified_size <= 0 or f.size_bytes is distinct from p_verified_size then
    raise exception 'upload verification failed';
  end if;
  v_source := coalesce(j.source_type, case when j.source_extension = 'pdf' then 'PDF' when j.source_extension = 'zip' then 'ARCHIVE' when j.workload_type = 'OCR' then 'IMAGE' else 'DOCUMENT' end);
  v_task := case v_source when 'PDF' then 'PDF_ANALYZE' when 'ARCHIVE' then 'ARCHIVE_PROCESS' when 'IMAGE' then 'OCR_IMAGE' when 'DOCUMENT' then 'CONVERT' end;
  v_pool := case v_source when 'ARCHIVE' then 'archive' when 'IMAGE' then 'ocr' else 'normal' end;
  if v_task is null then raise exception 'invalid source type'; end if;
  v_profile := case j.profile when 'clean' then 'Clean' when 'compact' then 'Compact' when 'rag_ready' then 'RAG-ready' else 'Standard' end;
  perform public.confirm_upload(p_job_id);
  update public.file_objects set storage_status = 'ACTIVE', uploaded_at = coalesce(uploaded_at, now()) where file_id = f.file_id;
  select * into w from public.enqueue_root(p_job_id, v_task, v_pool, f.object_path,
    'jobs/' || p_job_id || '/output/' || case when v_source = 'ARCHIVE' then 'combined.md' else 'result.md' end,
    v_source, 'ROOT_FILE', true, jsonb_build_object('original_filename', coalesce(j.original_filename, 'source.' || j.source_extension), 'profile', v_profile));
  if w.work_item_id is null then raise exception 'root enqueue failed'; end if;
  insert into public.job_events(job_id, event_type, status, stage) values(p_job_id, 'QUEUED', 'QUEUED', v_task);
  return w;
end;
$$;

-- Can also repair outputs registered by a previous frontend after a lost response.
create or replace function public.finalize_job_outputs(p_job_id uuid, p_bucket text)
returns boolean language plpgsql set search_path = public as $$
declare j public.jobs; w public.work_items; o jsonb; outputs jsonb; v_path text;
begin
  select * into j from public.jobs where job_id = p_job_id for update;
  if j.job_id is null or j.status <> 'COMPLETED' or j.files_deleted_at is not null or j.cleanup_state in ('CLAIMED','DELETING','COMPLETE') then return false; end if;
  if not exists(select 1 from public.file_objects where job_id = p_job_id and kind = 'INPUT' and bucket = p_bucket) then raise exception 'invalid output bucket'; end if;
  select * into w from public.work_items where job_id = p_job_id and is_final and status = 'SUCCEEDED' order by completed_at desc, work_item_id limit 1;
  if w.work_item_id is null then raise exception 'missing successful final item'; end if;
  outputs := case when jsonb_typeof(w.result->'outputs') = 'array' and jsonb_array_length(w.result->'outputs') > 0 then w.result->'outputs'
    else jsonb_build_array(jsonb_build_object('path', w.output_path, 'bytes', w.result->'output_bytes')) end;
  for o in select value from jsonb_array_elements(outputs) loop
    v_path := o->>'path';
    if v_path is null or v_path !~ ('^jobs/' || p_job_id || '/output/[A-Za-z0-9_.-]+$') or v_path like '%..%' then raise exception 'invalid final output path'; end if;
    insert into public.file_objects(job_id,bucket,object_path,kind,extension,mime_type,size_bytes,storage_status,uploaded_at)
      values(p_job_id,p_bucket,v_path,case when o->>'kind' = 'EXPORT' then 'EXPORT' else 'OUTPUT' end,
        regexp_replace(v_path, '^.*\.', ''), case when v_path like '%.json' then 'application/json' else 'text/markdown' end,
        (o->>'bytes')::bigint, 'ACTIVE', now()) on conflict(bucket,object_path) do nothing;
  end loop;
  update public.jobs set engine = w.result->>'engine', backend_role = w.pool, estimated_tokens = (w.result->>'tokens_est')::bigint where job_id = p_job_id;
  insert into public.job_events(job_id,event_type,status,stage,backend_role,backend_instance)
    select p_job_id,'COMPLETED','COMPLETED',w.task_type,w.pool,lower(w.assigned_backend)
    where not exists(select 1 from public.job_events where job_id = p_job_id and event_type = 'COMPLETED');
  return true;
end;
$$;

-- Expansion, attempt completion, settlement and output registration share one commit.
create or replace function public.finish_work_item(
  p_work_item_id uuid, p_attempt integer, p_outcome text, p_bucket text,
  p_backend text default null, p_duration_ms bigint default null, p_result jsonb default null,
  p_error_code text default null, p_error_message text default null,
  p_nodes jsonb default '[]'::jsonb, p_items jsonb default '[]'::jsonb
)
returns text language plpgsql set search_path = public as $$
declare w public.work_items; j public.jobs; v_job_id uuid; v_status text; v_final boolean;
begin
  select job_id into v_job_id from public.work_items where work_item_id = p_work_item_id;
  if v_job_id is null then return 'not_found'; end if;
  select * into j from public.jobs where job_id = v_job_id for update;
  select * into w from public.work_items where work_item_id = p_work_item_id for update;
  if w.status <> 'RUNNING' or w.attempt_count <> p_attempt or w.lease_until is null or w.lease_until <= now() then return 'stale'; end if;
  if j.status not in ('QUEUED','PROCESSING','CANCEL_REQUESTED') then return 'stale'; end if;
  if p_outcome = 'SUCCEEDED' and j.status <> 'CANCEL_REQUESTED' then
    perform public.add_work_items(v_job_id, p_nodes, p_items);
    if jsonb_array_length(coalesce(p_items,'[]'::jsonb)) > 0 then v_final := false; end if;
  end if;
  v_status := public.complete_work_item(p_work_item_id,p_attempt,p_outcome,p_backend,p_duration_ms,p_result,p_error_code,p_error_message,v_final);
  if v_status = 'COMPLETED' then perform public.finalize_job_outputs(v_job_id,p_bucket); end if;
  return v_status;
end;
$$;

revoke all on function public.start_uploaded_job(uuid,text,bigint) from public,anon,authenticated;
revoke all on function public.finalize_job_outputs(uuid,text) from public,anon,authenticated;
revoke all on function public.finish_work_item(uuid,integer,text,text,text,bigint,jsonb,text,text,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.start_uploaded_job(uuid,text,bigint) to service_role;
grant execute on function public.finalize_job_outputs(uuid,text) to service_role;
grant execute on function public.finish_work_item(uuid,integer,text,text,text,bigint,jsonb,text,text,jsonb,jsonb) to service_role;
