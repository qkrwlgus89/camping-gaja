'use client';
import {useCallback,useEffect,useRef,useState} from 'react';
import {INITIAL_MOTION,Motion,Zone,ZONES} from './types';
import {walkable,zoneAt,validMotion} from './world';
import {isTextControl} from './input';
import {RESOURCES,type Resource,resourceMotion} from './social';
export function useMovement(onMotion:(m:Motion,force?:boolean)=>void,blocked:boolean,_reduced:boolean,onIntent?:()=>void){
 const motion=useRef<Motion>({...INITIAL_MOTION,pitch:.02}),[view,setView]=useState<Motion>({...INITIAL_MOTION,pitch:.02});
 const joystick=useRef({x:0,y:0}),keys=useRef(new Set<string>()),velocity=useRef({x:0,z:0});
 const intent=useRef(onIntent);intent.current=onIntent;
 const callback=useRef(onMotion),block=useRef(blocked),published=useRef(0),savedAt=useRef(0);callback.current=onMotion;block.current=blocked;
 const commit=useCallback((force=true)=>{const m={...motion.current};setView(m);callback.current(m,force);if(force||performance.now()-savedAt.current>1000){savedAt.current=performance.now();sessionStorage.setItem('camp-location',JSON.stringify({...m,pose:m.pose==='walking'?'standing':m.pose,inside:false}));}},[]);
 function turn(dx:number,dy=0){if(block.current)return;motion.current.yaw=Math.atan2(Math.sin(motion.current.yaw+dx),Math.cos(motion.current.yaw+dx));motion.current.pitch=Math.max(-.75,Math.min(1.5,(motion.current.pitch??.02)+dy));commit(false);}
 function standSit(){const m=motion.current;if(m.pose==='sitting'||m.pose==='reclining'){m.pose='standing';delete m.resourceId;}else{const near=RESOURCES.filter(r=>r.kind!=='hammock').sort((a,b)=>Math.hypot(a.x-m.x,a.z-m.z)-Math.hypot(b.x-m.x,b.z-m.z))[0];if(Math.hypot(near.x-m.x,near.z-m.z)<4)motion.current=resourceMotion(m,near);}commit();}
 function attach(resource:Resource){velocity.current={x:0,z:0};motion.current=resourceMotion(motion.current,resource);commit();}
 function detach(){velocity.current={x:0,z:0};motion.current={...motion.current,pose:'standing',resourceId:undefined};commit();}
 function travel(zone:Zone){const p=ZONES[zone];velocity.current={x:0,z:0};motion.current={...motion.current,x:p.x,z:zone==='fire'?6:p.z,zone,yaw:0,heading:0,pitch:zone==='creek'?-.12:.15,pose:'standing',inside:false,resourceId:undefined};commit();}
 function teleport(x:number,z:number,inside=false){velocity.current={x:0,z:0};motion.current={...motion.current,x,z,zone:zoneAt(x,z),pose:'standing',inside,pitch:.06,yaw:0,heading:0,resourceId:undefined};commit();}
 function restore(_seat:number,saved?:Motion){if(saved){motion.current=saved;commit();}}
 // Input, avatar and camera advance in the same R3F frame, never from 10 Hz network snapshots.
 const advance=useCallback((elapsed:number)=>{
  const dt=Math.min(elapsed,.075),m=motion.current,k=keys.current;
  if(block.current||m.inside){velocity.current={x:0,z:0};if(m.pose==='walking'){m.pose='standing';commit();}return;}
  if(k.has('j')||k.has('l'))m.yaw=Math.atan2(Math.sin(m.yaw+(Number(k.has('l'))-Number(k.has('j')))*dt*1.1),Math.cos(m.yaw+(Number(k.has('l'))-Number(k.has('j')))*dt*1.1));
  let right=Number(k.has('d')||k.has('arrowright'))-Number(k.has('a')||k.has('arrowleft'))+joystick.current.x;
  let forward=Number(k.has('w')||k.has('arrowup'))-Number(k.has('s')||k.has('arrowdown'))-joystick.current.y;
  const len=Math.hypot(right,forward);if(len>1){right/=len;forward/=len;}
  const blend=1-Math.exp(-dt*12),targetX=(right*Math.cos(m.yaw)-forward*Math.sin(m.yaw))*1.9,targetZ=(-right*Math.sin(m.yaw)-forward*Math.cos(m.yaw))*1.9;
  velocity.current.x+=(targetX-velocity.current.x)*blend;velocity.current.z+=(targetZ-velocity.current.z)*blend;
  const speed=Math.hypot(velocity.current.x,velocity.current.z),was=m.pose;
  if(speed>.035){delete m.resourceId;m.pose='walking';m.heading=Math.atan2(-velocity.current.x,-velocity.current.z);const dx=velocity.current.x*dt,dz=velocity.current.z*dt;if(walkable(m.x+dx,m.z))m.x+=dx;if(walkable(m.x,m.z+dz))m.z+=dz;m.zone=zoneAt(m.x,m.z);}else if(m.pose==='walking')m.pose='standing';
  const at=performance.now();if(was!==m.pose||((speed>.035||k.has('j')||k.has('l'))&&at-published.current>110)){published.current=at;commit(was!==m.pose);}
 },[commit]);
 useEffect(()=>{
  try{const saved=JSON.parse(sessionStorage.getItem('camp-location')||'null');if(sessionStorage.getItem('camp-active')&&validMotion(saved)){motion.current={...saved,inside:false};setView({...motion.current});}}catch{}
  const down=(e:KeyboardEvent)=>{if(isTextControl(e.target))return;if(['ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.key)||e.key===' '&&!(e.target instanceof HTMLElement&&e.target.closest('button,a')))e.preventDefault();if(['w','a','s','d','arrowup','arrowdown','arrowleft','arrowright'].includes(e.key.toLowerCase()))intent.current?.();if(!block.current||['w','a','s','d','arrowup','arrowdown','arrowleft','arrowright'].includes(e.key.toLowerCase()))keys.current.add(e.key.toLowerCase());};
  const up=(e:KeyboardEvent)=>keys.current.delete(e.key.toLowerCase()),reset=()=>{keys.current.clear();joystick.current={x:0,y:0};velocity.current={x:0,z:0};};
  addEventListener('keydown',down);addEventListener('keyup',up);addEventListener('blur',reset);document.addEventListener('visibilitychange',reset);
  return()=>{removeEventListener('keydown',down);removeEventListener('keyup',up);removeEventListener('blur',reset);document.removeEventListener('visibilitychange',reset);};
 },[]);
 return{motion,view,joystick,travel,standSit,attach,detach,turn,restore,teleport,commit,advance};
}
