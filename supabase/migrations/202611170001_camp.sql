-- Run once with `supabase db push` or in the Supabase SQL editor.
create table public.camp_rooms (
  id uuid primary key default gen_random_uuid(), version bigint not null default 1, channel_epoch bigint not null default 1, tent_index int not null unique default 0,
  fire_lit boolean not null default false, wood_at timestamptz not null default now(),
  started_at timestamptz not null default now(), weather_override jsonb,
  last_active timestamptz not null default now(), created_at timestamptz not null default now()
);
create table public.camp_members (
  room_id uuid not null references public.camp_rooms on delete cascade,
  user_id uuid not null references auth.users on delete cascade,
  seat smallint not null check (seat in (0,1,2,3)), last_seen timestamptz not null default now(),
  primary key (room_id,user_id), unique (room_id,seat)
);
create table public.camp_invites (
  token_hash text primary key check (token_hash ~ '^[a-f0-9]{64}$'),
  room_id uuid not null references public.camp_rooms on delete cascade,
  expires_at timestamptz not null default now() + interval '30 minutes',
  used_by uuid references auth.users on delete set null
);
create table public.camp_events (
  id uuid primary key, room_id uuid not null references public.camp_rooms on delete cascade,
  user_id uuid not null references auth.users on delete cascade,
  kind text not null check (kind in ('wave','marshmallow','skip')),
  value smallint not null default 0 check (value between 0 and 5), created_at timestamptz not null default now()
);
create index camp_events_room_time on public.camp_events(room_id,created_at);
create table public.camp_requests (
  room_id uuid not null references public.camp_rooms on delete cascade,
  user_id uuid not null references auth.users on delete cascade,
  request_id uuid not null, created_at timestamptz not null default now(),
  primary key(room_id,user_id,request_id)
);
create table public.camp_limits (
  user_id uuid not null references auth.users on delete cascade, bucket text not null,
  window_at timestamptz not null default now(), hits int not null default 1,
  primary key(user_id,bucket)
);
create table public.camp_weather (
  camp_id text primary key, payload jsonb, updated_at timestamptz,
  lease_until timestamptz not null default '-infinity'
);
insert into public.camp_weather(camp_id) values ('inje');

create function public.camp_is_member(target uuid) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select exists(select 1 from public.camp_members where room_id=target and user_id=(select auth.uid()) and last_seen>now()-interval '90 seconds');
$$;
revoke all on function public.camp_is_member(uuid) from public;
grant execute on function public.camp_is_member(uuid) to authenticated;

alter table public.camp_rooms enable row level security;
alter table public.camp_members enable row level security;
alter table public.camp_events enable row level security;
alter table public.camp_invites enable row level security;
alter table public.camp_requests enable row level security;
alter table public.camp_limits enable row level security;
alter table public.camp_weather enable row level security;
create policy room_read on public.camp_rooms for select to authenticated using (public.camp_is_member(id));
create policy member_read on public.camp_members for select to authenticated using (public.camp_is_member(room_id));
create policy event_read on public.camp_events for select to authenticated using (public.camp_is_member(room_id));
create policy weather_read on public.camp_weather for select to anon, authenticated using (true);
grant select on public.camp_rooms, public.camp_members, public.camp_events to authenticated;
grant select on public.camp_weather to anon, authenticated;
-- No client INSERT/UPDATE/DELETE policies. Tokens, limits and request IDs are server-only.
revoke all on public.camp_invites, public.camp_requests, public.camp_limits from anon, authenticated;
revoke insert,update,delete on public.camp_rooms,public.camp_members,public.camp_events,public.camp_weather from anon,authenticated;
grant all on public.camp_rooms,public.camp_members,public.camp_events,public.camp_invites,public.camp_requests,public.camp_limits,public.camp_weather to service_role;

create policy camp_broadcast_read on realtime.messages for select to authenticated using (
  extension='broadcast' and exists (
    select 1 from public.camp_members where user_id=(select auth.uid())
      and 'camp:'||room_id::text||':'||(select channel_epoch::text from public.camp_rooms where id=room_id)=(select realtime.topic()) and last_seen>now()-interval '90 seconds'
  )
);
create policy camp_broadcast_write on realtime.messages for insert to authenticated with check (
  extension='broadcast' and exists (
    select 1 from public.camp_members where user_id=(select auth.uid())
      and 'camp:'||room_id::text||':'||(select channel_epoch::text from public.camp_rooms where id=room_id)=(select realtime.topic()) and last_seen>now()-interval '90 seconds'
  )
);

create function public.camp_snapshot(target uuid) returns jsonb
language sql stable security definer set search_path=public,pg_temp as $$
  select jsonb_build_object(
    'id',r.id,'version',r.version,'channelEpoch',r.channel_epoch,'tentIndex',r.tent_index,
    'fire',jsonb_build_object('lit',r.fire_lit,'woodAt',extract(epoch from r.wood_at)*1000,'startedAt',extract(epoch from r.started_at)*1000),
    'weather',r.weather_override,
    'members',coalesce((select jsonb_agg(jsonb_build_object('userId',m.user_id,'seat',m.seat,'lastSeen',extract(epoch from m.last_seen)*1000) order by m.seat)
      from public.camp_members m where m.room_id=r.id and m.last_seen>now()-interval '90 seconds'),'[]'::jsonb),
    'events',coalesce((select jsonb_agg(jsonb_build_object('id',e.id,'userId',e.user_id,'kind',e.kind,'value',e.value,'createdAt',extract(epoch from e.created_at)*1000) order by e.created_at)
      from public.camp_events e where e.room_id=r.id and e.created_at>now()-interval '15 seconds'),'[]'::jsonb)
  ) from public.camp_rooms r where r.id=target;
$$;
revoke all on function public.camp_snapshot(uuid) from public, anon, authenticated;
grant execute on function public.camp_snapshot(uuid) to service_role;

create function public.camp_command(p_actor uuid,p_action text,p_room uuid default null,p_payload jsonb default '{}') returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare r public.camp_rooms; invite public.camp_invites; member public.camp_members;
  n int; limit_n int; req uuid; bucket_name text; affected int;
begin
  if p_actor is null or not exists(select 1 from auth.users where id=p_actor) then raise exception 'AUTH_REQUIRED'; end if;
  if p_action not in ('create','read','join','invite','heartbeat','leave','fire','wave','marshmallow','skip','weather') then raise exception 'INVALID_ACTION'; end if;
  bucket_name:=p_action;
  limit_n:=case when p_action='create' then 6 when p_action='read' then 300 else 90 end;
  insert into public.camp_limits(user_id,bucket) values(p_actor,bucket_name)
  on conflict(user_id,bucket) do update set
    hits=case when camp_limits.window_at<now()-interval '1 minute' then 1 else camp_limits.hits+1 end,
    window_at=case when camp_limits.window_at<now()-interval '1 minute' then now() else camp_limits.window_at end
  returning hits into n;
  if n>limit_n then raise exception 'RATE_LIMITED'; end if;
  if p_action='create' then
    perform pg_advisory_xact_lock(826031);
    delete from public.camp_rooms where last_active<now()-interval '30 minutes';
    insert into public.camp_rooms(tent_index,fire_lit,wood_at) values((select slot_no from generate_series(0,1023) as slots(slot_no) where not exists(select 1 from public.camp_rooms where tent_index=slot_no) limit 1),coalesce((p_payload->>'lit')::boolean,false),
      coalesce(to_timestamp((p_payload->>'woodAt')::double precision/1000),now())) returning * into r;
    insert into public.camp_members(room_id,user_id,seat) values(r.id,p_actor,0);
    return public.camp_snapshot(r.id);
  end if;
  -- Serializes joins, expiry, invite consumption, and all durable actions per room.
  select * into r from public.camp_rooms where id=p_room for update;
  if not found or r.last_active<now()-interval '30 minutes' then raise exception 'ROOM_EXPIRED'; end if;
  delete from public.camp_members where room_id=p_room and last_seen<=now()-interval '90 seconds';
  get diagnostics affected=row_count;
  if affected>0 then update public.camp_rooms set version=version+1,channel_epoch=channel_epoch+1 where id=p_room; end if;
  select * into member from public.camp_members where room_id=p_room and user_id=p_actor;
  if p_action='join' and member.user_id is null then
    if (select count(*) from public.camp_members where room_id=p_room)>=4 then raise exception 'ROOM_FULL'; end if;
    select * into invite from public.camp_invites where token_hash=p_payload->>'tokenHash' and room_id=p_room for update;
    if not found or invite.used_by is not null or invite.expires_at<=now() then raise exception 'INVITE_EXPIRED'; end if;
    insert into public.camp_members(room_id,user_id,seat) values(p_room,p_actor,
      (select s from generate_series(0,3) s where not exists(select 1 from public.camp_members where room_id=p_room and seat=s) limit 1));
    update public.camp_invites set used_by=p_actor where token_hash=invite.token_hash;
    update public.camp_rooms set version=version+1,channel_epoch=channel_epoch+1 where id=p_room;
  elsif member.user_id is null then raise exception 'SEAT_EXPIRED'; end if;
  if p_action in ('join','heartbeat') then update public.camp_members set last_seen=now() where room_id=p_room and user_id=p_actor; end if;
  if p_action='leave' then
    delete from public.camp_members where room_id=p_room and user_id=p_actor;
    update public.camp_rooms set version=version+1,channel_epoch=channel_epoch+1 where id=p_room;
  end if;
  if p_action='invite' then
    if (select count(*) from public.camp_members where room_id=p_room)>=4 then raise exception 'ROOM_FULL'; end if;
    delete from public.camp_invites where room_id=p_room;
    insert into public.camp_invites(token_hash,room_id) values(p_payload->>'tokenHash',p_room);
  end if;
  if p_action in ('fire','wave','marshmallow','skip','weather') then
    req:=(p_payload->>'requestId')::uuid;
    insert into public.camp_requests(room_id,user_id,request_id) values(p_room,p_actor,req) on conflict do nothing;
    get diagnostics affected=row_count;
    if affected=0 then return public.camp_snapshot(p_room); end if;
    if p_action='fire' then
      if p_payload->>'kind' not in ('start','add','stop') then raise exception 'INVALID_ACTION'; end if;
      if p_payload->>'kind'='add' and not r.fire_lit then raise exception 'FIRE_NOT_LIT'; end if;
      update public.camp_rooms set fire_lit=p_payload->>'kind'<>'stop',wood_at=now(),
        started_at=case when p_payload->>'kind'='start' then now() else started_at end where id=p_room;
    elsif p_action='weather' then
      update public.camp_rooms set weather_override=nullif(p_payload->'weather','null'::jsonb) where id=p_room;
    else
      insert into public.camp_events(id,room_id,user_id,kind,value) values(req,p_room,p_actor,p_action,coalesce((p_payload->>'value')::smallint,0));
    end if;
    update public.camp_rooms set version=version+1 where id=p_room;
  end if;
  -- A read must not emit another room UPDATE (which would create a Realtime loop).
  if p_action<>'read' then update public.camp_rooms set last_active=now() where id=p_room; end if;
  return public.camp_snapshot(p_room);
end;
$$;
revoke all on function public.camp_command(uuid,text,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.camp_command(uuid,text,uuid,jsonb) to service_role;

create function public.camp_weather_claim() returns boolean
language plpgsql security definer set search_path=public,pg_temp as $$
declare n int;
begin
  update public.camp_weather set lease_until=now()+interval '30 seconds' where camp_id='inje'
    and lease_until<now() and (updated_at is null or updated_at<now()-interval '10 minutes');
  get diagnostics n=row_count;
  return n=1;
end;
$$;
revoke all on function public.camp_weather_claim() from public,anon,authenticated;
grant execute on function public.camp_weather_claim() to service_role;

-- Idempotent publication additions. Supabase's default publication already exists.
do $$ begin
  if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and tablename='camp_rooms') then alter publication supabase_realtime add table public.camp_rooms; end if;
  if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and tablename='camp_weather') then alter publication supabase_realtime add table public.camp_weather; end if;
end $$;

-- Optional daily job (requires pg_cron enabled in Dashboard):
-- select cron.schedule('camp-cleanup','*/15 * * * *',
--   $$delete from public.camp_rooms where last_active<now()-interval '30 minutes';
--     delete from public.camp_limits where window_at<now()-interval '1 day';$$);
