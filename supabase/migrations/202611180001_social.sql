-- v1.2 shared seating, hammocks, barbecue and one campfire circle.
-- Apply AFTER 202611170001_camp.sql and 202611170002_community.sql.
-- Existing callers of campground_command() remain supported.

alter table public.campground_state add column if not exists social jsonb not null default
'{"schema":1,"occupancies":{},"bbq":{"slots":[null,null,null,null,null,null,null,null],"servings":[]},"circle":null,"eating":{}}'::jsonb;

-- Computes expiry without writing: a snapshot must never trigger another Realtime UPDATE.
create or replace function public.campground_social_resolve(
  p_social jsonb,p_now bigint,p_fire boolean,p_fire_started_at numeric default 0
) returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$
declare
  s jsonb := '{"schema":1,"occupancies":{},"bbq":{"slots":[null,null,null,null,null,null,null,null],"servings":[]},"circle":null,"eating":{}}'::jsonb || coalesce(p_social,'{}'::jsonb);
  active_ids text[];
  c jsonb;
  participants jsonb;
  leases jsonb;
  occupancies jsonb;
  eating jsonb;
  phase text;
  started bigint;
  ends_at bigint;
  count_n int;
begin
  select coalesce(array_agg(user_id::text),'{}'::text[]) into active_ids
    from public.campground_visitors
    where last_seen>to_timestamp(p_now/1000.0)-interval '90 seconds';
  select coalesce(jsonb_object_agg(key,value),'{}'::jsonb) into occupancies
    from jsonb_each(coalesce(s->'occupancies','{}'::jsonb))
    where value->>'userId'=any(active_ids);
  select coalesce(jsonb_object_agg(key,value),'{}'::jsonb) into eating
    from jsonb_each(coalesce(s->'eating','{}'::jsonb))
    where key=any(active_ids) and p_now-coalesce((value->>'startedAt')::bigint,0)<4000;
  s:=jsonb_set(jsonb_set(s,'{occupancies}',occupancies),'{eating}',eating);
  c:=s->'circle';
  if c is not null and c<>'null'::jsonb then
    started:=(c->>'startsAt')::bigint;
    ends_at:=(c->>'endsAt')::bigint;
    select coalesce(jsonb_agg(to_jsonb(member_id) order by ord),'[]'::jsonb) into participants
      from jsonb_array_elements_text(coalesce(c->'participants','[]'::jsonb)) with ordinality as members(member_id,ord)
      where member_id=any(active_ids)
        and (started is null or p_now-coalesce((c->'leases'->>member_id)::bigint,0)<15000);
    select coalesce(jsonb_object_agg(key,value),'{}'::jsonb) into leases
      from jsonb_each(coalesce(c->'leases','{}'::jsonb))
      where participants ? key;
    count_n:=jsonb_array_length(participants);
    phase:=coalesce(c->>'phase','finished');
    if phase<>'finished' then
      if started is not null then
        phase:=case when p_now<started then 'countdown' when p_now<coalesce(ends_at,0) then 'active' else 'finished' end;
      end if;
      if not p_fire or count_n=0
        or (started is null and p_now-coalesce((c->>'openedAt')::bigint,0)>=120000)
        or (started is not null and count_n<4)
        or (c ? 'fireStartedAt' and coalesce((c->>'fireStartedAt')::numeric,0)<>p_fire_started_at)
      then phase:='finished';end if;
    end if;
    c:=c||jsonb_build_object('participants',participants,'leases',leases,'phase',phase);
    if count_n>0 and not(participants ? (c->>'hostId')) then
      c:=jsonb_set(c,'{hostId}',participants->0);
    end if;
    s:=jsonb_set(s,'{circle}',c);
  end if;
  return s;
end;
$$;
revoke all on function public.campground_social_resolve(jsonb,bigint,boolean,numeric) from public,anon,authenticated;
grant execute on function public.campground_social_resolve(jsonb,bigint,boolean,numeric) to service_role;

create or replace function public.campground_snapshot() returns jsonb
language sql stable security definer set search_path=public,pg_temp as $$
 select jsonb_build_object(
   'version',s.version,'fire',s.fire,'weather',s.weather,
   'social',public.campground_social_resolve(s.social,floor(extract(epoch from now())*1000)::bigint,coalesce((s.fire->>'lit')::boolean,false),coalesce((s.fire->>'startedAt')::numeric,0)),
   'visitors',coalesce((select jsonb_agg(jsonb_build_object(
     'userId',v.user_id,'name',v.name,'bag',v.bag,'placements',v.placements,
     'lastSeen',extract(epoch from v.last_seen)*1000,'roomId',m.room_id,'tentIndex',coalesce(r.tent_index,-1),'seat',coalesce(m.seat,0)))
     from public.campground_visitors v
     left join lateral(select * from public.camp_members mm where mm.user_id=v.user_id and mm.last_seen>now()-interval '90 seconds' order by mm.last_seen desc limit 1)m on true
     left join public.camp_rooms r on r.id=m.room_id
     where v.last_seen>now()-interval '90 seconds'),'[]'::jsonb),
   'events',coalesce((select jsonb_agg(e order by e."createdAt") from(
     select id,user_id as "userId",kind,value,body as text,extract(epoch from created_at)*1000 as "createdAt"
     from public.campground_events where created_at>now()-interval '5 minutes' order by created_at desc limit 60)e),'[]'::jsonb)
 ) from public.campground_state s where id='inje';
$$;
revoke all on function public.campground_snapshot() from public,anon,authenticated;
grant execute on function public.campground_snapshot() to service_role;

create or replace function public.campground_social_command(p_actor uuid,p_action text,p_payload jsonb default '{}') returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare
  r public.campground_state;
  s jsonb;
  actor text:=p_actor::text;
  n bigint:=floor(extract(epoch from clock_timestamp())*1000)::bigint;
  req uuid;
  hits int;
  affected int;
  resource_id text;
  slot_n int;
  food jsonb;
  servings jsonb;
  remaining jsonb;
  c jsonb;
  participants jsonb;
  leases jsonb;
  release_occupancies boolean:=false;
begin
  if p_actor is null or not exists(select 1 from auth.users where id=p_actor) then raise exception 'AUTH_REQUIRED';end if;
  if p_action not in ('occupy','release','bbq_place','bbq_flip','bbq_serve','bbq_eat','bbq_clear','circle_open','circle_join','circle_start','circle_leave','circle_heartbeat') then raise exception 'INVALID_ACTION';end if;
  if p_payload is null or jsonb_typeof(p_payload)<>'object' then raise exception 'INVALID_VALUE';end if;
  if not exists(select 1 from public.campground_visitors where user_id=p_actor and last_seen>now()-interval '90 seconds') then raise exception 'SEAT_EXPIRED';end if;
  begin req:=(p_payload->>'requestId')::uuid;exception when invalid_text_representation then raise exception 'INVALID_REQUEST';end;
  if req is null then raise exception 'INVALID_REQUEST';end if;
  insert into public.camp_limits(user_id,bucket)values(p_actor,'social:'||p_action)
    on conflict(user_id,bucket)do update set
      hits=case when camp_limits.window_at<now()-interval '1 minute' then 1 else camp_limits.hits+1 end,
      window_at=case when camp_limits.window_at<now()-interval '1 minute' then now() else camp_limits.window_at end
    returning camp_limits.hits into hits;
  if hits>120 then raise exception 'RATE_LIMITED';end if;
  -- Match the legacy RPC's lock order: request marker before campground row.
  insert into public.campground_requests(id,user_id)values(req,p_actor)on conflict do nothing;
  get diagnostics affected=row_count;
  if affected=0 then
    if exists(select 1 from public.campground_requests where id=req and user_id<>p_actor) then raise exception 'INVALID_REQUEST';end if;
    return public.campground_snapshot();
  end if;
  select * into r from public.campground_state where id='inje' for update;
  if not found then raise exception 'CAMP_SETUP_REQUIRED';end if;
  s:=public.campground_social_resolve(r.social,n,coalesce((r.fire->>'lit')::boolean,false),coalesce((r.fire->>'startedAt')::numeric,0));

  if p_action='occupy' then
    resource_id:=p_payload->>'resourceId';
    if resource_id is null or resource_id !~ '^(chair-[0-6]|bbq-chair-[0-7]|hammock-[0-3])$' then raise exception 'INVALID_RESOURCE';end if;
    if s->'circle'<>'null'::jsonb and s->'circle'->>'phase'<>'finished' and s->'circle'->'participants' ? actor then raise exception 'EVENT_ACTIVE';end if;
    if s->'occupancies' ? resource_id and s->'occupancies'->resource_id->>'userId'<>actor then raise exception 'RESOURCE_BUSY';end if;
    select coalesce(jsonb_object_agg(key,value),'{}'::jsonb) into remaining from jsonb_each(s->'occupancies')where value->>'userId'<>actor;
    remaining:=remaining||jsonb_build_object(resource_id,jsonb_build_object('userId',actor,'claimedAt',n));
    s:=jsonb_set(s,'{occupancies}',remaining);
  elsif p_action='release' then
    release_occupancies:=true;
  elsif p_action in ('bbq_place','bbq_flip','bbq_serve','bbq_clear') then
    if jsonb_typeof(p_payload->'slot') is distinct from 'number' then raise exception 'INVALID_VALUE';end if;
    if (p_payload->>'slot')::numeric<>trunc((p_payload->>'slot')::numeric) or (p_payload->>'slot')::numeric<0 or (p_payload->>'slot')::numeric>7 then raise exception 'INVALID_VALUE';end if;
    slot_n:=(p_payload->>'slot')::int;
    food:=s->'bbq'->'slots'->slot_n;
    if p_action='bbq_place' then
      if food is not null and food<>'null'::jsonb then raise exception 'BBQ_SLOT_BUSY';end if;
      if p_payload->>'foodType' is null or p_payload->>'foodType' not in ('meat','mushroom','corn') then raise exception 'INVALID_VALUE';end if;
      food:=jsonb_build_object('id',req,'type',p_payload->>'foodType','placedAt',n,'flippedAt',null,'by',actor);
      s:=jsonb_set(s,array['bbq','slots',slot_n::text],food);
    elsif p_action='bbq_clear' then
      s:=jsonb_set(s,array['bbq','slots',slot_n::text],'null'::jsonb);
    else
      if food is null or food='null'::jsonb then raise exception 'INVALID_VALUE';end if;
      if p_action='bbq_flip' then
        food:=jsonb_set(food,'{flippedAt}',to_jsonb(n));
        s:=jsonb_set(s,array['bbq','slots',slot_n::text],food);
      else
        if n-(food->>'placedAt')::bigint<30000 or food->>'flippedAt' is null then raise exception 'BBQ_NOT_READY';end if;
        servings:=s->'bbq'->'servings';
        if jsonb_array_length(servings)>=12 then raise exception 'BBQ_TABLE_FULL';end if;
        servings:=servings||jsonb_build_array(food||jsonb_build_object('servedAt',n));
        s:=jsonb_set(jsonb_set(s,array['bbq','slots',slot_n::text],'null'::jsonb),'{bbq,servings}',servings);
      end if;
    end if;
  elsif p_action='bbq_eat' then
    select value into food from jsonb_array_elements(s->'bbq'->'servings')where value->>'id'=p_payload->>'foodId' limit 1;
    if food is null then raise exception 'BBQ_NOT_READY';end if;
    select coalesce(jsonb_agg(value order by ord),'[]'::jsonb) into servings
      from jsonb_array_elements(s->'bbq'->'servings')with ordinality as foods(value,ord)
      where value->>'id'<>p_payload->>'foodId';
    s:=jsonb_set(jsonb_set(s,'{bbq,servings}',servings),array['eating',actor],jsonb_build_object('type',food->>'type','startedAt',n));
  elsif p_action='circle_open' then
    if not coalesce((r.fire->>'lit')::boolean,false) then raise exception 'FIRE_NOT_LIT';end if;
    if s->'circle'<>'null'::jsonb and s->'circle'->>'phase'<>'finished' then raise exception 'EVENT_ACTIVE';end if;
    c:=jsonb_build_object('id',req,'hostId',actor,'phase','recruiting','participants',jsonb_build_array(actor),'leases',jsonb_build_object(actor,n),'openedAt',n,'startsAt',null,'endsAt',null,'fireStartedAt',coalesce((r.fire->>'startedAt')::numeric,0));
    s:=jsonb_set(s,'{circle}',c);release_occupancies:=true;
  else
    c:=s->'circle';
    if c is null or c='null'::jsonb or c->>'phase'='finished' or p_payload->>'eventId' is null or c->>'id'<>p_payload->>'eventId' then raise exception 'EVENT_EXPIRED';end if;
    participants:=c->'participants';leases:=c->'leases';
    if p_action='circle_join' then
      if c->>'phase'<>'recruiting' then raise exception 'EVENT_ACTIVE';end if;
      if not coalesce((r.fire->>'lit')::boolean,false) then raise exception 'FIRE_NOT_LIT';end if;
      if not(participants ? actor) then
        if jsonb_array_length(participants)>=8 then raise exception 'EVENT_FULL';end if;
        participants:=participants||jsonb_build_array(actor);
      end if;
      leases:=leases||jsonb_build_object(actor,n);release_occupancies:=true;
      c:=c||jsonb_build_object('participants',participants,'leases',leases);
    elsif p_action='circle_start' then
      if c->>'hostId'<>actor then raise exception 'EVENT_HOST_ONLY';end if;
      if c->>'phase'<>'recruiting' then raise exception 'EVENT_ACTIVE';end if;
      if jsonb_array_length(participants)<4 then raise exception 'EVENT_NOT_READY';end if;
      if not coalesce((r.fire->>'lit')::boolean,false) then raise exception 'FIRE_NOT_LIT';end if;
      select jsonb_object_agg(value,to_jsonb(n)) into leases from jsonb_array_elements_text(participants);
      c:=c||jsonb_build_object('phase','countdown','startsAt',n+5000,'endsAt',n+65000,'leases',leases,'fireStartedAt',coalesce((r.fire->>'startedAt')::numeric,0));
    elsif p_action='circle_leave' then
      select coalesce(jsonb_agg(to_jsonb(value)order by ord),'[]'::jsonb) into participants
        from jsonb_array_elements_text(participants)with ordinality as members(value,ord)where value<>actor;
      c:=c||jsonb_build_object('participants',participants,'leases',leases-actor);
      if c->>'hostId'=actor and jsonb_array_length(participants)>0 then c:=jsonb_set(c,'{hostId}',participants->0);end if;
      if jsonb_array_length(participants)=0 or (c->>'startsAt' is not null and jsonb_array_length(participants)<4) then c:=jsonb_set(c,'{phase}','"finished"'::jsonb);end if;
    elsif p_action='circle_heartbeat' then
      if not(participants ? actor) then raise exception 'EVENT_EXPIRED';end if;
      c:=jsonb_set(c,array['leases',actor],to_jsonb(n));
    end if;
    s:=jsonb_set(s,'{circle}',c);
  end if;
  if release_occupancies then
    select coalesce(jsonb_object_agg(key,value),'{}'::jsonb) into remaining from jsonb_each(s->'occupancies')where value->>'userId'<>actor;
    s:=jsonb_set(s,'{occupancies}',remaining);
  end if;
  update public.campground_state set social=s,version=version+1 where id='inje';
  return public.campground_snapshot();
end;
$$;
revoke all on function public.campground_social_command(uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.campground_social_command(uuid,text,jsonb) to service_role;
notify pgrst,'reload schema';
