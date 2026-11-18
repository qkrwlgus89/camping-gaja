import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {appearanceFor} from '../lib/appearance';
import {applySocialAction,resolveSocial,emptySocial,resourceMotion,RESOURCES,circlePose,foodStage,ownResource,type Social,type SocialAction} from '../lib/social';
import {INITIAL_MOTION} from '../lib/types';
import {validMotion,walkable,zoneAt} from '../lib/world';
const now=1800000000000,people=['a','b','c','d','e','f','g','h','i'];
const visitors=people.map(userId=>({userId,lastSeen:now}));
const act=(s:Social,user:string,action:SocialAction,p:Record<string,unknown>={},at=now)=>applySocialAction(s,user,action,{requestId:randomUUID(),...p},at,true,now-60000);
const fresh=(s:Social,at=now)=>resolveSocial(s,visitors.map(v=>({...v,lastSeen:at})),at,true,now-60000);
function party(count=4){let s=act(emptySocial(),'a','circle_open');const eventId=s.circle!.id;for(const id of people.slice(1,count))s=act(s,id,'circle_join',{eventId});return s;}
test('guest appearances persist and vary across eight silhouettes and palettes',()=>{
 assert.deepEqual(appearanceFor('same-guest'),appearanceFor('same-guest'));
 const looks=Array.from({length:200},(_,i)=>appearanceFor(`guest-${i}`));assert.equal(new Set(looks.map(a=>a.hairStyle)).size,8);assert.ok(new Set(looks.map(a=>a.jacket)).size>=8);assert.ok(new Set(looks.map(a=>a.skin)).size>=5);assert.ok(looks.every(a=>!['#aaa','#ddd','#fff'].includes(a.hair)));
});
test('all facility poses are valid network motions with the correct zone',()=>{
 for(const r of RESOURCES){const m=resourceMotion({...INITIAL_MOTION,userId:'a',seq:1,sentAt:now},r);assert.ok(validMotion(m),r.id);assert.equal(m.resourceId,r.id);assert.ok(walkable(m.x,m.z));}
});
test('four hammocks and chairs have exclusive ownership, switching releases the old place',()=>{
 let s=act(emptySocial(),'a','occupy',{resourceId:'hammock-0'});assert.throws(()=>act(s,'b','occupy',{resourceId:'hammock-0'}),/RESOURCE_BUSY/);s=act(s,'b','occupy',{resourceId:'hammock-1'});s=act(s,'a','occupy',{resourceId:'bbq-chair-7'});assert.equal(s.occupancies['hammock-0'],undefined);assert.equal(ownResource(s,'a')!.id,'bbq-chair-7');s=act(s,'a','release');assert.equal(ownResource(s,'a'),null);assert.equal(ownResource(s,'b')!.id,'hammock-1');
});
test('occupancy and eating expire without mutating stored state',()=>{
 const raw=act(emptySocial(),'a','occupy',{resourceId:'chair-0'});raw.eating.a={type:'corn',startedAt:now-4000};const s=resolveSocial(raw,[{userId:'a',lastSeen:now-90000}],now,true);assert.deepEqual(s.occupancies,{});assert.deepEqual(s.eating,{});assert.ok(raw.occupancies['chair-0']);assert.ok(raw.eating.a);
});
test('shared grill requires one flip and 30s; serving and eating consume food once',()=>{
 let s=act(emptySocial(),'a','bbq_place',{slot:0,foodType:'corn'});assert.throws(()=>act(s,'b','bbq_place',{slot:0,foodType:'meat'}),/BBQ_SLOT_BUSY/);assert.throws(()=>act(s,'b','bbq_serve',{slot:0},now+30000),/BBQ_NOT_READY/);s=act(s,'b','bbq_flip',{slot:0},now+15000);assert.throws(()=>act(s,'c','bbq_serve',{slot:0},now+29999),/BBQ_NOT_READY/);assert.equal(foodStage(s.bbq.slots[0]!,now+30000),'ready');s=act(s,'c','bbq_serve',{slot:0},now+30000);const food=s.bbq.servings[0];assert.equal(s.bbq.slots[0],null);s=act(s,'d','bbq_eat',{foodId:food.id},now+31000);assert.equal(s.bbq.servings.length,0);assert.equal(s.eating.d.type,'corn');assert.throws(()=>act(s,'a','bbq_eat',{foodId:food.id}),/BBQ_NOT_READY/);assert.equal(fresh(s,now+34999).eating.d.type,'corn');assert.equal(fresh(s,now+35000).eating.d,undefined);
});
test('invalid grill input and a full serving table are rejected; overdone food stays edible',()=>{
 assert.throws(()=>act(emptySocial(),'a','bbq_place',{slot:-1,foodType:'meat'}),/INVALID_VALUE/);assert.throws(()=>act(emptySocial(),'a','bbq_place',{slot:0,foodType:'unknown'}),/INVALID_VALUE/);let s=act(emptySocial(),'a','bbq_place',{slot:0,foodType:'meat'});s=act(s,'b','bbq_flip',{slot:0});assert.equal(foodStage(s.bbq.slots[0]!,now+60000),'overdone');s.bbq.servings=Array.from({length:12},()=>({...s.bbq.slots[0]!,id:randomUUID()}));assert.throws(()=>act(s,'a','bbq_serve',{slot:0},now+60000),/BBQ_TABLE_FULL/);s.bbq.servings.pop();assert.equal(act(s,'b','bbq_serve',{slot:0},now+60000).bbq.servings.length,12);
});
test('circle is opt-in, one event at a time, limited to 4–8 and host start',()=>{
 let s=party(3);const eventId=s.circle!.id;assert.throws(()=>act(s,'a','circle_start',{eventId}),/EVENT_NOT_READY/);assert.throws(()=>act(s,'a','circle_open'),/EVENT_ACTIVE/);s=act(s,'d','circle_join',{eventId});assert.throws(()=>act(s,'b','circle_start',{eventId}),/EVENT_HOST_ONLY/);for(const id of people.slice(4,8))s=act(s,id,'circle_join',{eventId});assert.throws(()=>act(s,'i','circle_join',{eventId}),/EVENT_FULL/);assert.throws(()=>act(s,'a','occupy',{resourceId:'chair-0'}),/EVENT_ACTIVE/);assert.throws(()=>act(s,'i','circle_join',{eventId:randomUUID()}),/EVENT_EXPIRED/);
});
test('start refreshes recruitment leases then shares 5s countdown and 60s run',()=>{
 let s=party();const eventId=s.circle!.id;for(const id of people.slice(0,4))s.circle!.leases[id]=now-45000;s=act(s,'a','circle_start',{eventId});assert.ok(Object.values(s.circle!.leases).every(at=>at===now));assert.equal(fresh(s,now+4999).circle!.phase,'countdown');assert.equal(fresh(s,now+5000).circle!.phase,'active');s=act(s,'b','circle_heartbeat',{eventId},now+10000);assert.equal(s.circle!.leases.b,now+10000);for(const id of s.circle!.participants)s.circle!.leases[id]=now+65000;assert.equal(fresh(s,now+64999).circle!.phase,'active');assert.equal(fresh(s,now+65000).circle!.phase,'finished');
});
test('leaving or a lost lease below four ends the circle, finished events cannot revive',()=>{
 let s=party();const eventId=s.circle!.id;s=act(s,'a','circle_start',{eventId});const stale=structuredClone(s);stale.circle!.leases.d=now-15000;assert.equal(fresh(stale).circle!.phase,'finished');s=act(s,'d','circle_leave',{eventId});assert.equal(s.circle!.phase,'finished');s.circle!.participants.push('d');s.circle!.leases.d=now;assert.equal(fresh(s).circle!.phase,'finished');
});

test('recruitment host transfer, two minute expiry and fire epoch prevent stranded events',()=>{
 const s=party();const eventId=s.circle!.id;const moved=act(s,'a','circle_leave',{eventId});assert.equal(moved.circle!.hostId,'b');assert.equal(fresh(s,now+120000).circle!.phase,'finished');assert.equal(resolveSocial(s,visitors,now,false,now-60000).circle!.phase,'finished');assert.equal(resolveSocial(s,visitors,now,true,now).circle!.phase,'finished');assert.throws(()=>applySocialAction(emptySocial(),'a','circle_open',{requestId:randomUUID()},now,false),/FIRE_NOT_LIT/);
});
test('circle hand targets join exactly and every subframe gives bounded continuous motion',()=>{
 for(let n=4;n<=8;n++){
  const s=party(n),c=act(s,'a','circle_start',{eventId:s.circle!.id}).circle!;
  for(let at=0;at<60000;at+=250){for(let i=0;i<n;i++){
   const p=circlePose(c,people[i],c.startsAt!+at)!,next=circlePose(c,people[(i+1)%n],c.startsAt!+at)!,frame=circlePose(c,people[i],c.startsAt!+at+16)!;
   assert.ok(p.right.every((v,j)=>Math.abs(v-next.left[j])<1e-10));assert.ok(walkable(p.x,p.z));assert.ok(Math.hypot(p.x-frame.x,p.z-frame.z)<.008);assert.ok(validMotion({...INITIAL_MOTION,userId:people[i],seq:1,sentAt:now,x:p.x,z:p.z,heading:p.yaw,zone:zoneAt(p.x,p.z),pose:'dancing'}));
  }}
 }
});
