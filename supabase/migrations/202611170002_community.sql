-- Community campground: 4 guests per tent, shared outdoor space.
alter table public.camp_rooms add column if not exists tent_index int;
with ranked as (select id,row_number() over(order by created_at)-1 as n from public.camp_rooms)
update public.camp_rooms set tent_index=ranked.n from ranked where camp_rooms.id=ranked.id and camp_rooms.tent_index is null;
alter table public.camp_rooms alter column tent_index set not null;
create unique index if not exists camp_tent_index on public.camp_rooms(tent_index);
alter table public.camp_members drop constraint if exists camp_members_seat_check;
alter table public.camp_members add constraint camp_members_seat_check check(seat in (0,1,2,3));
create or replace function public.camp_snapshot(target uuid) returns jsonb
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

create or replace function public.camp_command(p_actor uuid,p_action text,p_room uuid default null,p_payload jsonb default '{}') returns jsonb
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


create table public.campground_state(id text primary key default 'inje',version bigint not null default 1,fire jsonb not null default '{"lit":true,"woodAt":0,"startedAt":0}',weather jsonb);
insert into public.campground_state(id) values('inje');
create table public.campground_visitors(user_id uuid primary key references auth.users on delete cascade,name text not null check(length(name)<=14),bag jsonb not null default '[]',placements jsonb not null default '[]',last_seen timestamptz not null default now());
create table public.campground_events(id uuid primary key,user_id uuid not null references auth.users on delete cascade,kind text not null check(kind in ('wave','skip','marshmallow','chat')),value int not null default 0 check(value between 0 and 5),body text check(length(body)<=100),created_at timestamptz not null default now());
create table public.campground_requests(id uuid primary key,user_id uuid not null references auth.users on delete cascade,created_at timestamptz not null default now());
create function public.in_campground() returns boolean language sql stable security definer set search_path=public,pg_temp as $$select exists(select 1 from public.campground_visitors where user_id=(select auth.uid()) and last_seen>now()-interval '90 seconds')$$;
revoke all on function public.in_campground() from public;grant execute on function public.in_campground() to authenticated;
alter table public.campground_state enable row level security;alter table public.campground_visitors enable row level security;alter table public.campground_events enable row level security;alter table public.campground_requests enable row level security;
create policy grounds_state_read on public.campground_state for select to authenticated using(public.in_campground());
create policy grounds_visitors_read on public.campground_visitors for select to authenticated using(public.in_campground());
create policy grounds_events_read on public.campground_events for select to authenticated using(public.in_campground());
grant select on public.campground_state,public.campground_visitors,public.campground_events to authenticated;
revoke insert,update,delete on public.campground_state,public.campground_visitors,public.campground_events from anon,authenticated;
revoke all on public.campground_requests from anon,authenticated;
grant all on public.campground_state,public.campground_visitors,public.campground_events,public.campground_requests to service_role;
create policy grounds_broadcast_read on realtime.messages for select to authenticated using(extension='broadcast' and (select realtime.topic())='grounds:inje' and public.in_campground());
create policy grounds_broadcast_write on realtime.messages for insert to authenticated with check(extension='broadcast' and (select realtime.topic())='grounds:inje' and public.in_campground());

create function public.campground_snapshot() returns jsonb language sql stable security definer set search_path=public,pg_temp as $$
 select jsonb_build_object('version',s.version,'fire',s.fire,'weather',s.weather,
 'visitors',coalesce((select jsonb_agg(jsonb_build_object('userId',v.user_id,'name',v.name,'bag',v.bag,'placements',v.placements,'lastSeen',extract(epoch from v.last_seen)*1000,'roomId',m.room_id,'tentIndex',coalesce(r.tent_index,-1),'seat',coalesce(m.seat,0))) from public.campground_visitors v left join lateral(select * from public.camp_members mm where mm.user_id=v.user_id and mm.last_seen>now()-interval '90 seconds' order by mm.last_seen desc limit 1)m on true left join public.camp_rooms r on r.id=m.room_id where v.last_seen>now()-interval '90 seconds'),'[]'::jsonb),
 'events',coalesce((select jsonb_agg(e order by e."createdAt") from(select id,"user_id" as "userId",kind,value,body as text,extract(epoch from created_at)*1000 as "createdAt" from public.campground_events where created_at>now()-interval '5 minutes' order by created_at desc limit 60)e),'[]'::jsonb)) from public.campground_state s where id='inje';
$$;
revoke all on function public.campground_snapshot() from public,anon,authenticated;grant execute on function public.campground_snapshot() to service_role;
create function public.campground_command(p_actor uuid,p_action text,p_payload jsonb default '{}') returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare v public.campground_visitors;hits int;req uuid;affected int;tx double precision;tz double precision;ti int;
begin
 if p_action not in ('enter','read','heartbeat','leave','fire','wave','skip','marshmallow','chat','place','weather') then raise exception 'INVALID_ACTION';end if;
 if not exists(select 1 from auth.users where id=p_actor) then raise exception 'AUTH_REQUIRED';end if;
 insert into public.camp_limits(user_id,bucket)values(p_actor,'grounds:'||p_action) on conflict(user_id,bucket)do update set hits=case when camp_limits.window_at<now()-interval '1 minute' then 1 else camp_limits.hits+1 end,window_at=case when camp_limits.window_at<now()-interval '1 minute' then now() else camp_limits.window_at end returning camp_limits.hits into hits;
 if hits>(case when p_action='chat' then 12 when p_action='read' then 300 else 120 end) then raise exception 'RATE_LIMITED';end if;
 if p_action='enter' then
  insert into public.campground_visitors(user_id,name,bag)values(p_actor,left(p_payload->>'name',14),p_payload->'bag') on conflict(user_id)do update set name=excluded.name,bag=excluded.bag,last_seen=now();
  update public.campground_state set version=version+1 where id='inje';
  delete from public.campground_visitors where last_seen<now()-interval '30 minutes';
  delete from public.campground_events where created_at<now()-interval '1 day';
  delete from public.campground_requests where created_at<now()-interval '1 day';
 end if;
 select * into v from public.campground_visitors where user_id=p_actor;
 if not found or v.last_seen<now()-interval '90 seconds' then raise exception 'SEAT_EXPIRED';end if;
 if p_action='heartbeat' then update public.campground_visitors set last_seen=now() where user_id=p_actor;end if;
 if p_action='leave' then delete from public.campground_visitors where user_id=p_actor;update public.campground_state set version=version+1 where id='inje';end if;
 if p_action in ('fire','wave','skip','marshmallow','chat','place','weather') then
  req:=(p_payload->>'requestId')::uuid;insert into public.campground_requests(id,user_id)values(req,p_actor) on conflict do nothing;get diagnostics affected=row_count;
  if affected=0 then return public.campground_snapshot();end if;
  if p_action='fire' then
   update public.campground_state set fire=jsonb_build_object('lit',p_payload->>'kind'<>'stop','woodAt',extract(epoch from now())*1000,'startedAt',extract(epoch from now())*1000)where id='inje';
  elsif p_action='weather' then update public.campground_state set weather=nullif(p_payload->'weather','null'::jsonb)where id='inje';
  elsif p_action='place' then
   if not(v.bag ? (p_payload->>'item')) then raise exception 'GEAR_NOT_PACKED';end if;
   select r.tent_index into ti from public.camp_rooms r join public.camp_members m on m.room_id=r.id where m.user_id=p_actor and m.last_seen>now()-interval '90 seconds' order by m.last_seen desc limit 1;
   ti:=coalesce(ti,0);tx:=(array[-9,9,-19,19,-10,10,-27,27])[ti%8+1];tz:=(array[-5,-5,7,7,20,20,28,28])[ti%8+1]+(ti/8)*18;
   if sqrt(power((p_payload->>'x')::float-tx,2)+power((p_payload->>'z')::float-tz,2))>6 and sqrt(power((p_payload->>'x')::float,2)+power((p_payload->>'z')::float-1.5,2))>6 then raise exception 'OUTSIDE_PITCH';end if;
   update public.campground_visitors set placements=coalesce((select jsonb_agg(p)from jsonb_array_elements(placements)p where p->>'item'<>p_payload->>'item'),'[]'::jsonb)||jsonb_build_array(jsonb_build_object('item',p_payload->>'item','x',(p_payload->>'x')::float,'z',(p_payload->>'z')::float))where user_id=p_actor;
  else insert into public.campground_events(id,user_id,kind,value,body)values(req,p_actor,p_action,coalesce((p_payload->>'value')::int,0),p_payload->>'text');end if;
  update public.campground_state set version=version+1 where id='inje';
 end if;
 return public.campground_snapshot();
end;$$;
revoke all on function public.campground_command(uuid,text,jsonb) from public,anon,authenticated;grant execute on function public.campground_command(uuid,text,jsonb) to service_role;
alter publication supabase_realtime add table public.campground_state;
