import { admin,configured,localDemo,sceneLab } from './supabase';
import { CampError,localRooms } from './local';
import { userFor,sameOrigin } from './rooms';
import { GEAR,Grounds,Visitor,emptyGrounds,tentPosition } from '../grounds';
import { validMotion } from '../world';
import { sampleWeather,neutralWeather } from '../environment';
import type { Motion,WeatherKind } from '../types';
type LocalGround={world:Grounds;motions:Map<string,Motion>;requests:Set<string>;limits:Map<string,{at:number;count:number}>};
const g=globalThis as unknown as {groundsV2?:LocalGround};
const local:LocalGround=g.groundsV2??={world:emptyGrounds(),motions:new Map(),requests:new Set(),limits:new Map()};
function localSnapshot(){
 const now=Date.now(),rooms=localRooms();
 local.world.visitors=local.world.visitors.filter(v=>now-v.lastSeen<90000);
 const world=structuredClone(local.world);
 world.visitors=world.visitors.map(v=>{const room=rooms.find(r=>r.members.some(m=>m.userId===v.userId&&now-m.lastSeen<90000));return {...v,roomId:room?.id??null,tentIndex:room?.tentIndex??-1,seat:room?.members.find(m=>m.userId===v.userId)?.seat??0};});
 return {world,motions:[...local.motions.values()].filter(m=>world.visitors.some(v=>v.userId===m.userId))};
}
export async function groundCommand(request:Request,body:Record<string,unknown>){
 sameOrigin(request);const actor=await userFor(request),action=String(body.action||'read');
 if(!['enter','read','heartbeat','leave','motion','fire','wave','skip','marshmallow','chat','place','weather'].includes(action))throw new CampError('INVALID_ACTION');
 const payload:Record<string,unknown>={};
 if(action==='enter'){
  payload.name=String(body.name||'캠퍼').replace(/[\u0000-\u001f<>]/g,'').slice(0,14);
  if(!Array.isArray(body.bag)||body.bag.length>3||body.bag.some(i=>typeof i!=='string'||!Object.hasOwn(GEAR,i)))throw new CampError('INVALID_BAG');payload.bag=[...new Set(body.bag)];
 }
 if(['fire','wave','skip','marshmallow','chat','place','weather'].includes(action)){
  if(typeof body.requestId!=='string'||!/^[0-9a-f-]{36}$/i.test(body.requestId))throw new CampError('INVALID_REQUEST');payload.requestId=body.requestId;
 }
 if(action==='fire'){if(!['start','add','stop'].includes(String(body.kind)))throw new CampError('INVALID_ACTION');payload.kind=body.kind;}
 if(action==='skip'||action==='marshmallow'){if(!Number.isInteger(body.value)||Number(body.value)<0||Number(body.value)>5)throw new CampError('INVALID_VALUE');payload.value=body.value;}
 if(action==='chat'){const text=String(body.text??'').trim().replace(/[\u0000-\u001f]/g,'').slice(0,100);if(!text)throw new CampError('INVALID_VALUE');payload.text=text;}
 if(action==='place'){
  if(!Object.hasOwn(GEAR,String(body.item))||!Number.isFinite(body.x)||!Number.isFinite(body.z)||Math.abs(Number(body.x))>38||Number(body.z)<-16||Number(body.z)>40)throw new CampError('INVALID_VALUE');
  payload.item=body.item;payload.x=body.x;payload.z=body.z;
 }
 if(action==='weather'){
  if(!sceneLab())throw new CampError('LAB_DISABLED',403);
  payload.weather=body.kind==='live'?null:['failure','stale'].includes(String(body.kind))?neutralWeather():sampleWeather(body.kind as WeatherKind);
  if(!['live','failure','stale','clear','cloudy','rain','sleet','snow'].includes(String(body.kind)))throw new CampError('INVALID_VALUE');
 }
 if(action==='motion'){if(!localDemo()||configured()||!validMotion(body.motion)||body.motion.userId!==actor)throw new CampError('INVALID_MOTION');payload.motion=body.motion;}
 if(localDemo()&&!configured()){
  const key=actor+':'+action,limit=local.limits.get(key)??{at:Date.now(),count:0};if(Date.now()-limit.at>60000){limit.at=Date.now();limit.count=0;}limit.count++;local.limits.set(key,limit);if(limit.count>(action==='motion'?900:action==='chat'?12:action==='read'?300:120))throw new CampError('RATE_LIMITED',429);
  let visitor=local.world.visitors.find(v=>v.userId===actor);
  if(action==='enter'){
   if(!visitor){visitor={userId:actor,name:String(payload.name),bag:payload.bag as Visitor['bag'],placements:[],roomId:null,tentIndex:-1,seat:0,lastSeen:Date.now()};local.world.visitors.push(visitor);}
   visitor.lastSeen=Date.now();visitor.name=String(payload.name);visitor.bag=payload.bag as Visitor['bag'];local.world.version++;
  }else if(!visitor||Date.now()-visitor.lastSeen>90000)throw new CampError('SEAT_EXPIRED',403);
  if(action==='heartbeat')visitor!.lastSeen=Date.now();
  if(action==='leave'){local.world.visitors=local.world.visitors.filter(v=>v.userId!==actor);local.motions.delete(actor);local.world.version++;}
  const id=String(payload.requestId);
  if(payload.requestId&&!local.requests.has(id)){
   if(action==='fire')local.world.fire={lit:payload.kind!=='stop',woodAt:Date.now(),startedAt:payload.kind==='start'?Date.now():local.world.fire.startedAt};
   else if(action==='weather')local.world.weather=payload.weather as Grounds['weather'];
   else if(action==='place'){
    if(!visitor!.bag.includes(payload.item as Visitor['bag'][number]))throw new CampError('GEAR_NOT_PACKED',403);
    const room=localRooms().find(r=>r.members.some(m=>m.userId===actor));const t=tentPosition(room?.tentIndex??0);
    if(Math.hypot(Number(payload.x)-t[0],Number(payload.z)-t[1])>6&&Math.hypot(Number(payload.x),Number(payload.z)-1.5)>6)throw new CampError('OUTSIDE_PITCH',403);
    visitor!.placements=visitor!.placements.filter(p=>p.item!==payload.item);visitor!.placements.push({item:payload.item as Visitor['bag'][number],x:Number(payload.x),z:Number(payload.z)});
   }else local.world.events.push({id,userId:actor,kind:action as 'chat',value:Number(payload.value??0),text:payload.text as string|undefined,createdAt:Date.now()});
   local.requests.add(id);local.world.version++;local.world.events=local.world.events.filter(e=>Date.now()-e.createdAt<300000).slice(-60);
  }
  if(action==='motion')local.motions.set(actor,payload.motion as Motion);
  return {...localSnapshot(),userId:actor};
 }
 const {data,error}=await admin().rpc('campground_command',{p_actor:actor,p_action:action,p_payload:payload});
 if(error){const code=['SEAT_EXPIRED','RATE_LIMITED','GEAR_NOT_PACKED','OUTSIDE_PITCH'].find(c=>error.message.includes(c));throw new CampError(code??'SERVICE_UNAVAILABLE',code==='RATE_LIMITED'?429:code?403:503);}
 return {world:data as Grounds,userId:actor};
}
