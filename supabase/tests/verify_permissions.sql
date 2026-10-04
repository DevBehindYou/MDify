-- Run after applying the migration (SQL editor or `supabase db execute`).
-- Every row must show ok = true. Checks the P0 requirement: browser roles
-- (anon, authenticated) can reach no MarkDify table or function; service_role
-- can call every function.

with fns(sig) as (
  values
    ('public.confirm_upload(uuid, interval)'),
    ('public.sweep_stale_jobs(interval, interval)'),
    ('public.claim_cleanup_batch(integer, interval, integer)'),
    ('public.request_delete_now(uuid)'),
    ('public.get_admin_kpis()'),
    ('public.start_uploaded_job(uuid,text,bigint)'),
    ('public.finalize_job_outputs(uuid,text)'),
    ('public.finish_work_item(uuid,integer,text,text,text,bigint,jsonb,text,text,jsonb,jsonb)'),
    ('public.cleanup_is_due(public.jobs)'),
    ('public.claim_job_cleanup(uuid)'),
    ('public.begin_job_cleanup(uuid,uuid)'),
    ('public.finish_job_cleanup(uuid,uuid)'),
    ('public.fail_job_cleanup(uuid,uuid)'),
    ('public.settle_cancelled_jobs()'),
    ('public.admit_public_request(text,text)'),
    ('public.release_public_multipart(uuid)'),
    ('public.prune_public_admission()')
),
roles(role, should_execute) as (
  values ('anon', false), ('authenticated', false), ('service_role', true)
)
select 'function' as kind, f.sig as object, r.role,
       has_function_privilege(r.role, f.sig, 'execute') as can_execute,
       has_function_privilege(r.role, f.sig, 'execute') = r.should_execute as ok
  from fns f cross join roles r

union all

select 'table', t.tbl, r.role,
       has_table_privilege(r.role, t.tbl, 'select'),
       has_table_privilege(r.role, t.tbl, 'select') = (r.role = 'service_role')
  from (values ('public.jobs'), ('public.file_objects'), ('public.job_events'), ('public.audit_logs'), ('public.public_request_budgets'), ('public.public_multipart_leases')) t(tbl)
 cross join (values ('anon'), ('authenticated'), ('service_role')) r(role)

union all

-- No SECURITY DEFINER function may exist in the exposed schema.
select 'security_definer', p.proname, '-', p.prosecdef, not p.prosecdef
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public'
   and p.proname in ('confirm_upload','sweep_stale_jobs','claim_cleanup_batch','request_delete_now','get_admin_kpis','mdify_set_updated_at',
     'start_uploaded_job','finalize_job_outputs','finish_work_item','cleanup_is_due','claim_job_cleanup',
     'begin_job_cleanup','finish_job_cleanup','fail_job_cleanup','settle_cancelled_jobs','admit_public_request','release_public_multipart','prune_public_admission')

union all

select 'bucket', 'mdify-pro-files', '-', b.public, not b.public
  from storage.buckets b
 where b.id = 'mdify-pro-files'

union all

select 'audit_append_only', 'public.audit_logs', 'service_role',
       has_table_privilege('service_role','public.audit_logs',p.privilege),
       not has_table_privilege('service_role','public.audit_logs',p.privilege)
  from (values ('UPDATE'),('DELETE'),('TRUNCATE')) p(privilege)

order by ok, kind, object, role;
