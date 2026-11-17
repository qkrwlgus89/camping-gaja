'use client';
import {useEffect,useRef,useState}from'react';
import {INITIAL_MOTION,Motion,Zone,ZONES}from'./types';
import {walkable,zoneAt}from'./world';
export function useMovement(onMotion:(m:Motion,force?:boolean)=>void,blocked:boolean,reduced:boolean){
 const motion=useRef<Motion>({...INITIAL_MOTION,pitch:.25}),[view,setView]=useState<Motion>({...INITIAL_MOTION,pitch:.25});
 const joystick=useRef({x:0,y:0}),keys=useRef(new Set<string>()),callback=useRef(onMotion),block=useRef(blocked);callback.current=onMotion;block.current=blocked;
 const commit=(force=true)=>{const m={...motion.current};setView(m);callback.current(m,force);};
 function turn(dx:number,dy=0){if(block.current)return;motion.current.yaw=Math.atan2(Math.sin(motion.current.yaw+dx),Math.cos(motion.current.yaw+dx));motion.current.pitch=Math.max(-.75,Math.min(1.5,(motion.current.pitch??.25)+dy));commit(false);}
 function standSit(){motion.current.pose=motion.current.pose==='sitting'?'standing':'sitting';commit();}
 function travel(zone:Zone){const p=ZONES[zone];motion.current={...motion.current,x:p.x,z:zone==='fire'?6:p.z,zone,yaw:0,pitch:zone==='creek'?-.12:.15,pose:'standing',inside:false};commit();}
 function teleport(x:number,z:number,inside=false){motion.current={...motion.current,x,z,zone:zoneAt(x,z),pose:'standing',inside,pitch:.06,yaw:0};commit();}
 function restore(_seat:number,saved?:Motion){if(saved){motion.current=saved;commit();}}
 useEffect(()=>{
  const down=(e:KeyboardEvent)=>{if(e.target instanceof HTMLElement&&(e.target.matches('input,textarea,select,button')||e.target.isContentEditable))return;if(['ArrowUp','ArrowDown','ArrowLeft','ArrowRight',' '].includes(e.key))e.preventDefault();if(!block.current)keys.current.add(e.key.toLowerCase());};
  const up=(e:KeyboardEvent)=>keys.current.delete(e.key.toLowerCase()),reset=()=>{keys.current.clear();joystick.current={x:0,y:0};};addEventListener('keydown',down);addEventListener('keyup',up);addEventListener('blur',reset);document.addEventListener('visibilitychange',reset);
  let frame=0,before=0,published=0;const tick=(at:number)=>{const dt=Math.min((at-(before||at))/1000,.04);before=at;const m=motion.current;
   if(!block.current&&!m.inside){const k=keys.current;if(k.has('j')||k.has('l'))m.yaw+=(Number(k.has('l'))-Number(k.has('j')))*dt*1.1;
    let right=Number(k.has('d')||k.has('arrowright'))-Number(k.has('a')||k.has('arrowleft'))+joystick.current.x,forward=Number(k.has('w')||k.has('arrowup'))-Number(k.has('s')||k.has('arrowdown'))-joystick.current.y;const len=Math.hypot(right,forward);if(len>1){right/=len;forward/=len;}
    if(len>.05){m.pose='walking';const speed=dt*3.2,dx=(right*Math.cos(m.yaw)-forward*Math.sin(m.yaw))*speed,dz=(-right*Math.sin(m.yaw)-forward*Math.cos(m.yaw))*speed;if(walkable(m.x+dx,m.z))m.x+=dx;if(walkable(m.x,m.z+dz))m.z+=dz;m.zone=zoneAt(m.x,m.z);}
    const changed=m.pose==='walking'&&len<=.05;if(changed)m.pose='standing';
    if(changed||len>.05||k.has('j')||k.has('l'))if(at-published>95||changed){published=at;commit(changed);}
   }frame=requestAnimationFrame(tick);};frame=requestAnimationFrame(tick);
  return()=>{cancelAnimationFrame(frame);removeEventListener('keydown',down);removeEventListener('keyup',up);removeEventListener('blur',reset);document.removeEventListener('visibilitychange',reset);};
 },[]);
 return{motion,view,joystick,travel,standSit,turn,restore,teleport,commit};
}
