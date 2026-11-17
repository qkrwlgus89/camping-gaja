'use client';
import {useCallback,useEffect,useRef,useState} from 'react';
import type {RealtimeChannel} from '@supabase/supabase-js';
import {guest,Guest,supabaseBrowser,errorMessages} from './client';
import {emptyGrounds,Gear,GroundEvent,Grounds} from './grounds';
import {validMotion} from './world';
import type {Motion} from './types';
type Reply={world:Grounds;userId:string;motions?:Motion[]};
export function useGrounds(onEvent:(event:GroundEvent)=>void){
 const [world,setWorld]=useState<Grounds>(emptyGrounds),[peers,setPeers]=useState<Record<string,Motion>>({}),[status,setStatus]=useState<'local'|'connected'|'reconnecting'>('local'),[identity,setIdentity]=useState<Guest|null>(null),[error,setError]=useState(''),[joined,setJoined]=useState(false),[errorCode,setErrorCode]=useState('');
 const active=useRef(false),auth=useRef<Guest|null>(null),latest=useRef<Motion|null>(null),channel=useRef<RealtimeChannel|null>(null),snapshot=useRef(world),sequence=useRef(0),lastSend=useRef(0),seen=useRef(new Set<string>()),enteredAt=useRef(Date.now()),callback=useRef(onEvent),lastSeq=useRef(new Map<string,number>());callback.current=onEvent;
 const receive=useCallback((data:unknown,members=snapshot.current.visitors)=>{if(!validMotion(data)||data.userId===auth.current?.userId||!members.some(v=>v.userId===data.userId)||data.seq<=(lastSeq.current.get(data.userId)??-1))return;lastSeq.current.set(data.userId,data.seq);setPeers(p=>{if(p[data.userId]){Object.assign(p[data.userId],data);return p;}return{...p,[data.userId]:data};});},[]);
 const apply=useCallback((reply:Reply)=>{
  if(reply.world.version<snapshot.current.version)return;snapshot.current=reply.world;setWorld(reply.world);
  setPeers(p=>Object.fromEntries(Object.entries(p).filter(([id])=>reply.world.visitors.some(v=>v.userId===id))));
  for(const e of reply.world.events){if(!seen.current.has(e.id)&&e.createdAt>=enteredAt.current-1000){seen.current.add(e.id);callback.current(e);}}
  reply.motions?.forEach(m=>receive(m,reply.world.visitors));
 },[receive]);
 const api=useCallback(async(action:string,body:Record<string,unknown>={})=>{
  const who=await guest();auth.current=who;setIdentity(old=>old?.userId===who.userId&&old.token===who.token?old:who);
  const response=await fetch('/api/grounds',{method:action==='read'?'GET':'POST',headers:{Authorization:`Bearer ${who.token}`,...(action!=='read'?{'Content-Type':'application/json'}:{})},...(action!=='read'?{body:JSON.stringify({action,...body})}:{}),cache:'no-store',signal:AbortSignal.timeout(10000)});
  const reply=await response.json();if(!response.ok){if(reply.error==='AUTH_REQUIRED'&&who.mode==='local')localStorage.removeItem('camp-local-guest');throw Object.assign(Error(errorMessages[reply.error]??'캠핑장 연결을 확인하고 있어요.'),{code:reply.error});}return reply as Reply;
 },[]);
 const enter=useCallback(async(name:string,bag:Gear[])=>{try{enteredAt.current=Date.now();const r=await api('enter',{name,bag});active.current=true;setJoined(true);apply(r);setStatus('connected');setError('');setErrorCode('');return true;}catch(e){setError((e as Error).message);setErrorCode((e as {code?:string}).code??'connection_unavailable');setStatus(active.current?'reconnecting':'local');return false;}},[api,apply]);
 const act=useCallback(async(action:string,body:Record<string,unknown>={})=>{
  if(!active.current||status!=='connected'||!navigator.onLine)return false;
  const requestId=crypto.randomUUID();try{let r:Reply;try{r=await api(action,{...body,requestId});}catch(e){if(e instanceof TypeError||['AbortError','TimeoutError'].includes((e as Error).name))r=await api(action,{...body,requestId});else throw e;}apply(r);return true;}catch(e){setError((e as Error).message);return false;}
 },[api,apply,status]);
 const sendMotion=useCallback((m:Motion,force=false)=>{
  if(!active.current||!auth.current||!navigator.onLine)return;
  const data={...m,userId:auth.current.userId,seq:Date.now()*100+sequence.current++%100,sentAt:Date.now()};latest.current=data;
  if(!force&&performance.now()-lastSend.current<95)return;lastSend.current=performance.now();
  if(auth.current.mode==='local')void api('motion',{motion:data}).catch(()=>setStatus('reconnecting'));
  else if(channel.current?.state==='joined')void channel.current.send({type:'broadcast',event:'motion',payload:data});
 },[api,apply]);
 useEffect(()=>{
  if(!identity||!joined)return;let disposed=false,reading=false;
  async function read(heartbeat=false){if(disposed||reading||!navigator.onLine)return;reading=true;try{const r=await api(heartbeat?'heartbeat':'read');if(!disposed){apply(r);setStatus('connected');}}catch(e){if(!disposed){if((e as {code?:string}).code==='SEAT_EXPIRED'){const previous=snapshot.current.visitors.find(v=>v.userId===auth.current?.userId);try{const r=await api('enter',{name:previous?.name??'캠퍼',bag:previous?.bag??[]});apply(r);setStatus('connected');}catch{setStatus('reconnecting');}}else setStatus('reconnecting');}}finally{reading=false;}}
  const sb=supabaseBrowser();let ch:RealtimeChannel|undefined;
  if(sb&&identity.mode==='supabase'){
   ch=sb.channel('grounds:inje',{config:{private:true,broadcast:{self:false}}});channel.current=ch;
   ch.on('broadcast',{event:'motion'},({payload})=>receive(payload));ch.on('broadcast',{event:'hello'},()=>{if(latest.current)sendMotion(latest.current,true);});
   ch.on('postgres_changes',{event:'UPDATE',schema:'public',table:'campground_state'},()=>{void read();});
   ch.on('postgres_changes',{event:'UPDATE',schema:'public',table:'camp_weather'},()=>window.dispatchEvent(new Event('camp-weather-updated')));
   void sb.realtime.setAuth(identity.token).then(()=>ch?.subscribe(state=>{if(disposed)return;if(state==='SUBSCRIBED'){setStatus('connected');void ch?.send({type:'broadcast',event:'hello',payload:{}});if(latest.current)sendMotion(latest.current,true);}else if(['CLOSED','CHANNEL_ERROR','TIMED_OUT'].includes(state))setStatus('reconnecting');}));
  }
  const poll=setInterval(()=>void read(),identity.mode==='local'?650:4000),heartbeat=setInterval(()=>void read(true),30000),pose=setInterval(()=>{if(latest.current)sendMotion(latest.current,true);},3000);
  const online=()=>{if(navigator.onLine)void read(true);else setStatus('reconnecting');};const visibility=()=>{if(!document.hidden)online();};addEventListener('online',online);addEventListener('offline',online);document.addEventListener('visibilitychange',visibility);
  return()=>{disposed=true;clearInterval(poll);clearInterval(heartbeat);clearInterval(pose);removeEventListener('online',online);removeEventListener('offline',online);document.removeEventListener('visibilitychange',visibility);if(ch)void sb?.removeChannel(ch);channel.current=null;};
 },[identity?.userId,joined,api,apply,receive,sendMotion]);
 return {world,peers,status,identity,error,errorCode,setError,enter,act,sendMotion};
}
