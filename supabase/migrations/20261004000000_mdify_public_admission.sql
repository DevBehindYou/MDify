-- Shared public admission; additive and inactive until the frontend calls it.
begin;

create table if not exists public.public_request_budgets (
  scope text not null check (scope in ('create','process','wake')),
  client_key text not null check (client_key = '*' or client_key ~ '^[a-f0-9]{64}$'),
  tokens numeric not null check (tokens >= 0),
  updated_at timestamptz not null,
  expires_at timestamptz not null,
  primary key (scope, client_key)
);
create index if not exists public_request_budgets_expiry on public.public_request_budgets(scope,expires_at);
alter table public.public_request_budgets enable row level security;
revoke all on public.public_request_budgets from public,anon,authenticated;
grant select,insert,update,delete on public.public_request_budgets to service_role;

create table if not exists public.public_multipart_leases (
  lease_id uuid primary key default gen_random_uuid(),
  expires_at timestamptz not null
);
alter table public.public_multipart_leases enable row level security;
revoke all on public.public_multipart_leases from public,anon,authenticated;
grant select,insert,delete on public.public_multipart_leases to service_role;

-- Token buckets: capacity and refill per minute are fixed across deployments.
-- Upload creation and multipart share a budget. All locks use global -> client
-- order. The global row serializes competing server instances and lease claims.
create or replace function public.admit_public_request(p_action text,p_client_hash text)
returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare
  v_scope text; v_global integer; v_client integer; v_now timestamptz;
  g public.public_request_budgets; c public.public_request_budgets;
  gt numeric; ct numeric; lease uuid; wait_s integer;
begin
  if p_client_hash is null or p_client_hash !~ '^[a-f0-9]{64}$' then
    raise exception 'Invalid admission key';
  end if;
  case p_action
    when 'upload' then v_scope:='create'; v_global:=60; v_client:=10;
    when 'convert' then v_scope:='create'; v_global:=60; v_client:=10;
    when 'start' then v_scope:='process'; v_global:=600; v_client:=120;
    when 'advance' then v_scope:='process'; v_global:=600; v_client:=120;
    when 'wake' then v_scope:='wake'; v_global:=30; v_client:=6;
    else raise exception 'Invalid admission action';
  end case;
  insert into public.public_request_budgets values(v_scope,'*',v_global,clock_timestamp(),'infinity')
    on conflict do nothing;
  select * into g from public.public_request_budgets
    where scope=v_scope and client_key='*' for update;
  v_now:=clock_timestamp();
  gt:=least(v_global,g.tokens + greatest(0,extract(epoch from v_now-g.updated_at))*v_global/60);
  -- Retain keyed client data for at most one idle hour. Cleanup is scoped to
  -- this lock's budget to avoid deadlocks between unrelated actions.
  delete from public.public_request_budgets where scope=v_scope and client_key<>'*' and expires_at<=v_now;
  if gt<1 then
    return jsonb_build_object('allowed',false,'status',503,'retry_after',greatest(1,ceil((1-gt)*60/v_global)::integer));
  end if;
  -- Count globally even if a client/lease check later rejects the request.
  -- Otherwise rotating clients while multipart is full could grow state
  -- without spending any global allowance.
  update public.public_request_budgets set tokens=gt-1,updated_at=v_now
    where scope=v_scope and client_key='*';
  insert into public.public_request_budgets values(v_scope,p_client_hash,v_client,v_now,v_now+interval '1 hour')
    on conflict do nothing;
  select * into c from public.public_request_budgets
    where scope=v_scope and client_key=p_client_hash for update;
  ct:=least(v_client,c.tokens + greatest(0,extract(epoch from v_now-c.updated_at))*v_client/60);
  if ct<1 then
    return jsonb_build_object('allowed',false,'status',429,'retry_after',greatest(1,ceil((1-ct)*60/v_client)::integer));
  end if;
  if p_action='convert' then
    delete from public.public_multipart_leases where expires_at<=v_now;
    if (select count(*) from public.public_multipart_leases)>=2 then
      select greatest(1,ceil(extract(epoch from min(expires_at)-v_now))::integer) into wait_s
        from public.public_multipart_leases;
      return jsonb_build_object('allowed',false,'status',503,'retry_after',wait_s);
    end if;
    -- Longer than the 300 second function ceiling; aborted requests cannot
    -- immediately free capacity while their backend call may still be running.
    insert into public.public_multipart_leases(expires_at) values(v_now+interval '330 seconds') returning lease_id into lease;
  end if;
  update public.public_request_budgets set tokens=ct-1,updated_at=v_now,expires_at=v_now+interval '1 hour'
    where scope=v_scope and client_key=p_client_hash;
  return jsonb_build_object('allowed',true,'lease_id',lease);
end $$;

create or replace function public.release_public_multipart(p_lease_id uuid)
returns boolean language sql security invoker set search_path=public,pg_temp as $$
  with removed as (delete from public.public_multipart_leases where lease_id=p_lease_id returning lease_id)
  select exists(select 1 from removed);
$$;

-- The authenticated minute tick prunes even when public traffic is idle.
create or replace function public.prune_public_admission()
returns void language plpgsql security invoker set search_path=public,pg_temp as $$
begin
  perform 1 from public.public_request_budgets where client_key='*' order by scope for update;
  delete from public.public_request_budgets where client_key<>'*' and expires_at<=clock_timestamp();
  delete from public.public_multipart_leases where expires_at<=clock_timestamp();
end $$;
revoke all on function public.admit_public_request(text,text),public.release_public_multipart(uuid),public.prune_public_admission() from public,anon,authenticated;
grant execute on function public.admit_public_request(text,text),public.release_public_multipart(uuid),public.prune_public_admission() to service_role;
commit;
