import type {Motion} from './types';
import {zoneAt} from './geography';

export type ResourceKind='chair'|'hammock'|'bbq';
export type Resource={id:string;kind:ResourceKind;x:number;z:number;y:number;yaw:number};
const chairs=[[0,9,0],[-2,3.6,.5],[2,3.6,-.5],[-1.8,6,.3],[1.8,6,-.3],[5,-15,0],[-11,-12,-.25]];
export const RESOURCES:Resource[]=[
 ...chairs.map(([x,z,yaw],i)=>({id:`chair-${i}`,kind:'chair' as const,x,z,y:.5475,yaw})),
 ...[-26,-17,17,26].map((x,i)=>({id:`hammock-${i}`,kind:'hammock' as const,x,z:-10,y:.64,yaw:Math.PI/2})),
 ...Array.from({length:8},(_,i)=>({id:`bbq-chair-${i}`,kind:'bbq' as const,x:17.75+(i%4)*1.5,z:i<4?19:22,y:.5475,yaw:i<4?Math.PI:0})),
];
export const HAMMOCKS=RESOURCES.filter(r=>r.kind==='hammock');
export const BBQ={x:20,z:15,tableX:20,tableZ:20.5};
export const FOOD={meat:{name:'고기',color:'#a85b48'},mushroom:{name:'버섯',color:'#d2b797'},corn:{name:'옥수수',color:'#dfb64f'}} as const;
export type FoodType=keyof typeof FOOD;
export type Food={id:string;type:FoodType;placedAt:number;flippedAt:number|null;by:string;servedAt?:number};
export type Occupancy={userId:string;claimedAt:number};
export type Circle={id:string;hostId:string;phase:'recruiting'|'countdown'|'active'|'finished';participants:string[];leases:Record<string,number>;openedAt:number;fireStartedAt?:number;startsAt:number|null;endsAt:number|null};
export type Social={schema:1;occupancies:Record<string,Occupancy>;bbq:{slots:(Food|null)[];servings:Food[]};circle:Circle|null;eating:Record<string,{type:FoodType;startedAt:number}>};
export type SocialAction='occupy'|'release'|'bbq_place'|'bbq_flip'|'bbq_serve'|'bbq_eat'|'bbq_clear'|'circle_open'|'circle_join'|'circle_start'|'circle_leave'|'circle_heartbeat';
export const SOCIAL_ACTIONS:SocialAction[]=['occupy','release','bbq_place','bbq_flip','bbq_serve','bbq_eat','bbq_clear','circle_open','circle_join','circle_start','circle_leave','circle_heartbeat'];
export const emptySocial=():Social=>({schema:1,occupancies:{},bbq:{slots:Array(8).fill(null),servings:[]},circle:null,eating:{}});
export function resolveSocial(raw:Social|undefined,visitors:{userId:string;lastSeen:number}[],now:number,fireLit:boolean,fireStartedAt?:number):Social{
 const social=structuredClone(raw??emptySocial());const alive=new Set(visitors.filter(v=>now-v.lastSeen<90000).map(v=>v.userId));
 social.occupancies=Object.fromEntries(Object.entries(social.occupancies).filter(([,o])=>alive.has(o.userId)));
 social.eating=Object.fromEntries(Object.entries(social.eating).filter(([id,e])=>alive.has(id)&&now-e.startedAt<4000));
 const c=social.circle;
 if(c){
  c.participants=c.participants.filter(id=>alive.has(id)&&(c.startsAt===null||now-(c.leases[id]??0)<15000));
  if(!c.participants.includes(c.hostId))c.hostId=c.participants[0]??c.hostId;
  if(c.startsAt!==null&&c.phase!=='finished')c.phase=now<c.startsAt?'countdown':now<(c.endsAt??0)?'active':'finished';
  if(!fireLit||(c.fireStartedAt!==undefined&&fireStartedAt!==undefined&&c.fireStartedAt!==fireStartedAt)||!c.participants.length||(c.startsAt===null&&now-c.openedAt>=120000)||(c.startsAt!==null&&c.participants.length<4))c.phase='finished';
 }
 return social;
}
export class SocialError extends Error{constructor(public code:string){super(code);}}
export function applySocialAction(social:Social,actor:string,action:SocialAction,p:Record<string,unknown>,now:number,fireLit:boolean,fireStartedAt?:number):Social{
 const s=structuredClone(social),fail=(code:string):never=>{throw new SocialError(code);};
 const release=()=>{for(const[id,o]of Object.entries(s.occupancies))if(o.userId===actor)delete s.occupancies[id];};
 const event=()=>s.circle&&s.circle.phase!=='finished'&&s.circle.id===p.eventId?s.circle:fail('EVENT_EXPIRED');
 const slot=()=>{const n=p.slot;if(!Number.isInteger(n)||Number(n)<0||Number(n)>7)fail('INVALID_VALUE');return Number(n);};
 if(action==='occupy'){
  const id=String(p.resourceId);if(!RESOURCES.some(r=>r.id===id))fail('INVALID_RESOURCE');
  if(s.circle&&s.circle.phase!=='finished'&&s.circle.participants.includes(actor))fail('EVENT_ACTIVE');
  if(s.occupancies[id]&&s.occupancies[id].userId!==actor)fail('RESOURCE_BUSY');release();s.occupancies[id]={userId:actor,claimedAt:now};
 }else if(action==='release')release();
 else if(action==='bbq_place'){
  const n=slot();if(s.bbq.slots[n])fail('BBQ_SLOT_BUSY');const type=p.foodType;if(typeof type!=='string'||!Object.hasOwn(FOOD,type))fail('INVALID_VALUE');
  s.bbq.slots[n]={id:String(p.requestId),type:type as FoodType,placedAt:now,flippedAt:null,by:actor};
 }else if(action==='bbq_flip'){
  const n=slot(),food=s.bbq.slots[n];if(!food)fail('INVALID_VALUE');food!.flippedAt=now;
 }else if(action==='bbq_serve'){
  const n=slot(),food=s.bbq.slots[n];if(!food)fail('INVALID_VALUE');if(now-food!.placedAt<30000||food!.flippedAt===null)fail('BBQ_NOT_READY');if(s.bbq.servings.length>=12)fail('BBQ_TABLE_FULL');
  s.bbq.servings.push({...food!,servedAt:now});s.bbq.slots[n]=null;
 }else if(action==='bbq_clear')s.bbq.slots[slot()]=null;
 else if(action==='bbq_eat'){
  const at=s.bbq.servings.findIndex(f=>f.id===p.foodId);if(at<0)fail('BBQ_NOT_READY');const[f]=s.bbq.servings.splice(at,1);s.eating[actor]={type:f.type,startedAt:now};
 }else if(action==='circle_open'){
  if(!fireLit)fail('FIRE_NOT_LIT');if(s.circle&&s.circle.phase!=='finished')fail('EVENT_ACTIVE');release();
  s.circle={id:String(p.requestId),hostId:actor,phase:'recruiting',participants:[actor],leases:{[actor]:now},openedAt:now,fireStartedAt,startsAt:null,endsAt:null};
 }else if(action==='circle_join'){
  const c=event();if(c.phase!=='recruiting')fail('EVENT_ACTIVE');if(!c.participants.includes(actor)){if(c.participants.length>=8)fail('EVENT_FULL');release();c.participants.push(actor);}c.leases[actor]=now;
 }else if(action==='circle_start'){
  const c=event();if(c.hostId!==actor)fail('EVENT_HOST_ONLY');if(c.phase!=='recruiting')fail('EVENT_ACTIVE');if(c.participants.length<4)fail('EVENT_NOT_READY');if(!fireLit)fail('FIRE_NOT_LIT');
  for(const id of c.participants)c.leases[id]=now;c.startsAt=now;c.endsAt=now+60000;c.phase='active';
 }else if(action==='circle_leave'){
  const c=event();c.participants=c.participants.filter(id=>id!==actor);delete c.leases[actor];if(c.hostId===actor)c.hostId=c.participants[0]??actor;if(!c.participants.length||(c.startsAt!==null&&c.participants.length<4))c.phase='finished';
 }else if(action==='circle_heartbeat'){
  const c=event();if(!c.participants.includes(actor))fail('EVENT_EXPIRED');c.leases[actor]=now;
 }
 return s;
}
export function foodStage(food:Food,now:number){return now-food.placedAt>=60000?'overdone':now-food.placedAt>=30000&&food.flippedAt!==null?'ready':'cooking';}
export function ownResource(social:Social|undefined,id:string){const pair=Object.entries(social?.occupancies??{}).find(([,o])=>o.userId===id);return pair?RESOURCES.find(r=>r.id===pair[0])??null:null;}
// Fixed gathering slots do not shift when another guest joins the queue.
export function circleWaitingPose(c:Circle,userId:string):{x:number;z:number;yaw:number}|null{
 if(c.phase!=='recruiting'||c.startsAt!==null)return null;
 const i=c.participants.indexOf(userId);if(i<0||i>=8)return null;
 const x=[0,1.2,-1.2,2.4,-2.4,3.6,-3.6,4.8][i],z=7.6;
 return{x,z,yaw:Math.atan2(x,z-1.5)};
}
export function circlePose(c:Circle,userId:string,now:number):{x:number;z:number;yaw:number;left:[number,number,number];right:[number,number,number]}|null{
 const i=c.participants.indexOf(userId),n=c.participants.length;if(i<0||n<4||c.startsAt===null)return null;
 const radius=Math.max(.86,1.14/(2*Math.sin(Math.PI/n))),phase=now<c.startsAt?0:(Math.min(now,c.endsAt??now)-c.startsAt)/1000*.4;
 const angle=2*Math.PI*i/n+phase;
 const pos=(a:number):[number,number,number]=>[Math.sin(a)*radius,.62,1.5+Math.cos(a)*radius];
 const here=pos(angle),before=pos(angle-2*Math.PI/n),after=pos(angle+2*Math.PI/n);
 const midpoint=(p:number[],q:number[]):[number,number,number]=>[(p[0]+q[0])/2,.62,(p[2]+q[2])/2];
 return{x:here[0],z:here[2],yaw:Math.atan2(Math.sin(angle),Math.cos(angle)),left:midpoint(here,before),right:midpoint(here,after)};
}
export function resourceMotion(m:Motion,r:Resource):Motion{return{...m,x:r.x,z:r.z,zone:zoneAt(r.x,r.z),yaw:r.yaw,heading:r.yaw,pose:r.kind==='hammock'?'reclining':'sitting',resourceId:r.id,inside:false};}
