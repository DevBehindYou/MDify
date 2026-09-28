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
    ('public.get_admin_kpis()')
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
  from (values ('public.jobs'), ('public.file_objects'), ('public.job_events'), ('public.audit_logs')) t(tbl)
 cross join (values ('anon'), ('authenticated'), ('service_role')) r(role)

union all

-- No SECURITY DEFINER function may exist in the exposed schema.
select 'security_definer', p.proname, '-', p.prosecdef, not p.prosecdef
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public'
   and p.proname in ('confirm_upload','sweep_stale_jobs','claim_cleanup_batch','request_delete_now','get_admin_kpis','mdify_set_updated_at')

union all

select 'bucket', 'mdify-pro-files', '-', b.public, not b.public
  from storage.buckets b
 where b.id = 'mdify-pro-files'

order by ok, kind, object, role;
