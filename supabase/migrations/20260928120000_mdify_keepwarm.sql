-- MDify keep-warm for the OCR backends (O1, O2 on Render Free).
--
-- Render Free services sleep after 15 idle minutes and need about a minute
-- to wake. Supabase Cron calls keepwarm_ping() every 10 minutes during the
-- active window (supabase/cron.sql). Each call sends one GET to
-- /api/v1/health on every backend listed in Vault; that route does no
-- conversion work and needs no secret.
--
-- The backend URLs live in Vault, never in SQL or in the repository. One
-- secret per backend, base URL only:
--   mdify_keepwarm_url_o1   https://<O1 host>
--   mdify_keepwarm_url_o2   https://<O2 host>
-- Another mdify_keepwarm_url_<name> secret adds a backend; nothing else changes.
--
-- pg_net is asynchronous: keepwarm_ping() only queues the requests. Each
-- backend is queued in its own exception block, so a missing URL or a failed
-- request never stops the others. keepwarm_pings keeps the outcome only
-- (status code, timeout or error, never the response body). The next run
-- copies it from pg_net, and keepwarm_record() does so once more after the
-- window closes, because pg_net keeps responses for 6 hours only.
-- Retention: successes 1 day, failures 14 days.
--
-- Called only by Supabase Cron (the postgres role). No API role has access.

create table if not exists public.keepwarm_pings (
  id bigint generated always as identity primary key,
  instance text not null,
  request_id bigint unique,          -- pg_net request id; null when not sent
  requested_at timestamptz not null default now(),
  status_code integer,
  error text,                        -- null on success
  recorded_at timestamptz            -- set once the outcome is known
);

create index if not exists keepwarm_pings_instance_time
  on public.keepwarm_pings (instance, requested_at desc);

-- ── Outcomes ───────────────────────────────────────────────────────────────

-- Copies finished pg_net responses into keepwarm_pings and trims old rows.
-- Returns the number of outcomes recorded.
create or replace function public.keepwarm_record()
returns integer
language plpgsql
set search_path = ''
as $$
declare
  v_recorded integer;
begin
  update public.keepwarm_pings p
     set status_code = r.status_code,
         error = case
                   when r.timed_out then 'timeout'
                   when r.error_msg is not null then left(r.error_msg, 200)
                   when r.status_code not between 200 and 299 then 'HTTP ' || r.status_code
                 end,
         recorded_at = now()
    from net._http_response r
   where r.id = p.request_id
     and p.recorded_at is null;
  get diagnostics v_recorded = row_count;

  -- pg_net has dropped the response by now: the outcome is lost.
  update public.keepwarm_pings
     set error = 'no response recorded', recorded_at = now()
   where recorded_at is null
     and requested_at < now() - interval '6 hours';

  delete from public.keepwarm_pings
   where recorded_at is not null
     and ((error is null and requested_at < now() - interval '1 day')
          or requested_at < now() - interval '14 days');

  return v_recorded;
end;
$$;

-- ── Ping ───────────────────────────────────────────────────────────────────

-- Queues one health check per backend. An instance pinged within the last
-- 20 minutes is awake and answers at once, so a short timeout is enough; the
-- first ping after a gap (overnight, a skipped day) waits for the wake-up.
-- Returns the number of requests queued.
create or replace function public.keepwarm_ping()
returns integer
language plpgsql
set search_path = ''
as $$
declare
  c_prefix constant text := 'mdify_keepwarm_url_';
  c_awake_timeout_ms constant integer := 10000;
  c_wake_timeout_ms constant integer := 90000;
  v_backend record;
  v_instance text;
  v_url text;
  v_last timestamptz;
  v_request bigint;
  v_queued integer := 0;
begin
  -- Bookkeeping must never block the pings.
  begin
    perform public.keepwarm_record();
  exception when others then
    raise warning 'keepwarm_record failed: %', sqlerrm;
  end;

  for v_backend in
    select name, decrypted_secret
      from vault.decrypted_secrets
     where name like 'mdify\_keepwarm\_url\_%'
     order by name
  loop
    v_instance := upper(substr(v_backend.name, length(c_prefix) + 1));
    begin
      v_url := rtrim(btrim(coalesce(v_backend.decrypted_secret, '')), '/');
      if v_url = '' then
        raise exception 'empty URL in Vault secret %', v_backend.name;
      end if;

      select max(requested_at) into v_last
        from public.keepwarm_pings
       where instance = v_instance and request_id is not null;

      v_request := net.http_get(
        url := v_url || '/api/v1/health',
        timeout_milliseconds := case
          when v_last > now() - interval '20 minutes' then c_awake_timeout_ms
          else c_wake_timeout_ms
        end
      );
      insert into public.keepwarm_pings (instance, request_id) values (v_instance, v_request);
      v_queued := v_queued + 1;
    exception when others then
      insert into public.keepwarm_pings (instance, error, recorded_at)
      values (v_instance, left('not sent: ' || sqlerrm, 200), now());
    end;
  end loop;

  if not found then
    insert into public.keepwarm_pings (instance, error, recorded_at)
    values ('-', 'not sent: no mdify_keepwarm_url_* secret in Vault', now());
  end if;

  return v_queued;
end;
$$;

-- ── Access control ─────────────────────────────────────────────────────────

alter table public.keepwarm_pings enable row level security;
revoke all on public.keepwarm_pings from public, anon, authenticated;

revoke all on function public.keepwarm_record() from public, anon, authenticated;
revoke all on function public.keepwarm_ping() from public, anon, authenticated;
