import { execFileSync, spawn } from 'node:child_process';
import fs from 'node:fs';
import assert from 'node:assert/strict';
// Dedicated disposable PostgreSQL database, never a remote/production URL.
const host=process.env.CAMP_TEST_PGHOST||'127.0.0.1',port=process.env.CAMP_TEST_PGPORT||'55438';
if (!['127.0.0.1','localhost'].includes(host)) throw Error('DB tests require a local disposable instance.');
const bin=process.env.PSQL_BIN||'/opt/homebrew/opt/postgresql@18/bin/psql';
const database='camping_gaja_test_'+Date.now();
const args=['-X','-q','-A','-t','-v','ON_ERROR_STOP=1','-h',host,'-p',port,'-d',database];
function sql(query){return execFileSync(bin,[...args,'-c',query],{encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();}
execFileSync(bin,['-X','-q','-h',host,'-p',port,'-d','postgres','-c',`CREATE DATABASE ${database}`],{stdio:'pipe'});
sql(`do $$ begin if not exists(select from pg_roles where rolname='anon') then create role anon; end if; if not exists(select from pg_roles where rolname='authenticated') then create role authenticated; end if; if not exists(select from pg_roles where rolname='service_role') then create role service_role bypassrls; end if; end $$;
create schema auth; create table auth.users(id uuid primary key);
create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
create schema realtime;create table realtime.messages(id bigint,extension text);
alter table realtime.messages enable row level security;
create function realtime.topic() returns text language sql stable as $$select current_setting('realtime.topic',true)$$;
grant usage on schema auth,realtime to authenticated;grant select,insert on realtime.messages to authenticated;
create publication supabase_realtime;`);
sql(fs.readFileSync('supabase/migrations/202611170001_camp.sql','utf8'));sql(fs.readFileSync('supabase/migrations/202611170002_community.sql','utf8'));sql(fs.readFileSync('supabase/migrations/202611180001_social.sql','utf8'));sql(fs.readFileSync('supabase/migrations/202611180002_manual_circle.sql','utf8'));
const a='11111111-1111-4111-8111-111111111111',b='22222222-2222-4222-8222-222222222222',c='33333333-3333-4333-8333-333333333333';
sql(`insert into auth.users values('${a}'),('${b}'),('${c}');`);
const call=(actor,action,id=null,payload={})=>JSON.parse(sql(`set role service_role;select public.camp_command('${actor}','${action}',${id?`'${id}'`:'null'},'${JSON.stringify(payload)}'::jsonb);`));
const r=call(a,'create',null,{lit:true}),hash='b'.repeat(64);
call(a,'invite',r.id,{tokenHash:hash});
// Competing connections exercise the actual FOR UPDATE lock and token transaction.
function join(actor){return new Promise(resolve=>{const child=spawn(bin,[...args,'-c',`set role service_role;select public.camp_command('${actor}','join','${r.id}','{"tokenHash":"${hash}"}');`]);let output='';child.stdout.on('data',s=>output+=s);child.stderr.on('data',s=>output+=s);child.on('exit',code=>resolve({actor,code,output}));});}
const joins=await Promise.all([join(b),join(c)]);assert.equal(joins.filter(x=>x.code===0).length,1);assert.match(joins.find(x=>x.code!==0).output,/INVITE_EXPIRED/);
const winner=joins.find(x=>x.code===0).actor, outsider=winner===b?c:b;
const joined=call(a,'read',r.id);assert.equal(joined.members.length,2);
const requestId='44444444-4444-4444-8444-444444444444';
const f=call(winner,'fire',r.id,{kind:'add',requestId});assert.equal(call(winner,'fire',r.id,{kind:'add',requestId}).version,f.version);
const rls=(actor,query)=>sql(`set role authenticated;set request.jwt.claim.sub='${actor}';${query}`);
assert.equal(rls(outsider,'select count(*) from public.camp_rooms;'),'0');
assert.equal(rls(a,'select count(*) from public.camp_rooms;'),'1');
assert.throws(()=>rls(a,`update public.camp_rooms set fire_lit=false;`));
assert.throws(()=>rls(a,`select * from public.camp_invites;`));
assert.throws(()=>rls(a,`select public.camp_command('${a}','create');`));
// Membership-limited Broadcast RLS with the same topic expression used by Realtime.
sql(`insert into realtime.messages values(1,'broadcast');`);
assert.equal(rls(outsider,`set realtime.topic='camp:${r.id}:${joined.channelEpoch}';select count(*) from realtime.messages;`),'0');
assert.equal(rls(a,`set realtime.topic='camp:${r.id}:${joined.channelEpoch}';select count(*) from realtime.messages;`),'1');
call(winner,'leave',r.id);assert.throws(()=>call(outsider,'join',r.id,{tokenHash:hash}),/INVITE_EXPIRED/);
call(a,'invite',r.id,{tokenHash:'c'.repeat(64)});
sql(`update public.camp_invites set expires_at=now()-interval '1 second' where room_id='${r.id}';`);
assert.throws(()=>call(outsider,'join',r.id,{tokenHash:'c'.repeat(64)}),/INVITE_EXPIRED/);
assert.equal(call(a,'heartbeat',r.id).members.length,1);
sql(`update public.camp_members set last_seen=now()-interval '91 seconds' where user_id='${a}';`);
assert.throws(()=>call(a,'heartbeat',r.id),/SEAT_EXPIRED/);
assert.equal(rls(a,'select count(*) from public.camp_rooms;'),'0');
assert.equal(sql('set role service_role;select public.camp_weather_claim();'),'t');assert.equal(sql('set role service_role;select public.camp_weather_claim();'),'f');
const d='55555555-5555-4555-8555-555555555555',e='66666666-6666-4666-8666-666666666666',fifth='77777777-7777-4777-8777-777777777777';
sql(`insert into auth.users values('${d}'),('${e}'),('${fifth}');`);
const four=call(a,'create',null,{lit:true});
for(const [i,id]of [b,c,d].entries()){const token=String(i+1).repeat(64);call(a,'invite',four.id,{tokenHash:token});call(id,'join',four.id,{tokenHash:token});}
assert.equal(call(a,'read',four.id).members.length,4);
assert.throws(()=>call(fifth,'join',four.id,{tokenHash:'1'.repeat(64)}),/ROOM_FULL/);
const ground=(actor,action,payload={})=>JSON.parse(sql(`set role service_role;select public.campground_command('${actor}','${action}','${JSON.stringify(payload)}'::jsonb);`));
ground(a,'enter',{name:'밤하늘',bag:['lantern','book']});ground(e,'enter',{name:'이웃',bag:['blanket']});
assert.equal(ground(a,'read').visitors.length,2);assert.equal(ground(e,'read').visitors.length,2);
const shared=ground(a,'fire',{kind:'add',requestId:'88888888-8888-4888-8888-888888888888'});
assert.equal(ground(a,'fire',{kind:'add',requestId:'88888888-8888-4888-8888-888888888888'}).version,shared.version);
assert.equal(ground(e,'read').fire.lit,true);
assert.equal(ground(e,'chat',{text:'별이 참 좋네요',requestId:'99999999-9999-4999-8999-999999999999'}).events.at(-1).text,'별이 참 좋네요');
const placed=ground(a,'place',{item:'lantern',x:2,z:2,requestId:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'});assert.equal(placed.visitors.find(v=>v.userId===a).placements.length,1);
assert.throws(()=>ground(a,'place',{item:'camera',x:2,z:2,requestId:'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'}),/GEAR_NOT_PACKED/);
assert.throws(()=>ground(fifth,'read'),/SEAT_EXPIRED/);
assert.equal(rls(fifth,'select count(*) from public.campground_state;'),'0');assert.equal(rls(a,'select count(*) from public.campground_state;'),'1');
assert.equal(rls(a,`set realtime.topic='grounds:inje';select count(*) from realtime.messages;`),'1');assert.equal(rls(fifth,`set realtime.topic='grounds:inje';select count(*) from realtime.messages;`),'0');
const summary={passed:23,checks:['all four migrations','concurrent single-use join','one-time invite','idempotent private fire','room RLS','write denial','token privacy','service-only RPC','private Broadcast RLS','invite expiry','heartbeat','90s seat expiry','weather single refresh lease','four seats','fifth guest rejected','shared public campground','shared public fire idempotency','public chat','shared gear placement','unpacked gear denied','outsider world read denied','public world RLS','authenticated campground channel RLS']};
console.log(JSON.stringify(summary,null,2));
fs.mkdirSync('docs',{recursive:true});fs.writeFileSync('docs/db-test-results.json',JSON.stringify(summary,null,2)+'\n');

execFileSync(bin,['-X','-q','-h',host,'-p',port,'-d','postgres','-c',`DROP DATABASE ${database}`],{stdio:'pipe'});
