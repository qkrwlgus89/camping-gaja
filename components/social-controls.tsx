'use client';
import {useState,useEffect} from 'react';
import {Flame,UtensilsCrossed,Moon,Users,X,LogOut,ChevronRight,MessageCircle} from 'lucide-react';
import {BBQ,FOOD,HAMMOCKS,foodStage,type Resource,type Social,type SocialAction,type FoodType} from '@/lib/social';
import type {Grounds} from '@/lib/grounds';
type Props={social:Social;available:boolean;world:Grounds;userId:string;now:number;resource:Resource|null;bbqView:boolean;busy:boolean;error:string;onAction:(action:SocialAction,payload?:Record<string,unknown>)=>Promise<boolean>;onOccupy:(id:string)=>Promise<void>;onExit:()=>void;onChat:()=>void;onTravel:(x:number,z:number)=>void;onBBQView:(active:boolean)=>void;};
export function SocialControls(p:Props){
 const[open,setOpen]=useState<'hammocks'|'bbq'|null>(null),[food,setFood]=useState<FoodType>('meat');
 const circle=p.social.circle,participant=Boolean(circle&&circle.phase!=='finished'&&circle.participants.includes(p.userId));
 useEffect(()=>{if(p.bbqView)setOpen('bbq');else setOpen(old=>old==='bbq'?null:old);},[p.bbqView]);
 const close=()=>{setOpen(null);p.onBBQView(false);};
 return <>
  {!p.resource&&!participant&&<nav className="facility-tools" aria-label="공동 캠핑장 시설">
   <button onClick={()=>{p.onBBQView(false);setOpen(open==='hammocks'?null:'hammocks');}}><Moon size={16}/><span>해먹</span></button>
   <button onClick={()=>{if(open==='bbq')close();else{setOpen('bbq');p.onTravel(BBQ.x,BBQ.z+2);p.onBBQView(true);}}}><UtensilsCrossed size={16}/><span>바베큐</span></button>
   <button disabled={!p.available||p.busy||!p.world.fire.lit||Boolean(circle&&circle.phase!=='finished')} onClick={()=>{close();void p.onAction('circle_open');}}><Users size={16}/><span>함께 불 돌기</span></button>
  </nav>}
  {open==='hammocks'&&<section className="facility-panel hammock-choices" aria-label="공동 해먹"><header><div><small>UNDER THE OPEN SKY</small><h2>나란히, 하늘을 봐요</h2></div><button aria-label="해먹 선택 닫기" onClick={close}><X size={17}/></button></header>
   <div>{HAMMOCKS.map((r,i)=>{const occupied=p.social.occupancies[r.id],name=p.world.visitors.find(v=>v.userId===occupied?.userId)?.name;return <button key={r.id} disabled={!p.available||Boolean(occupied)||p.busy} onClick={async()=>{await p.onOccupy(r.id);close();}}><span><Moon size={18}/>해먹 {i+1}</span><small>{occupied?`${name??'캠퍼'}가 쉬는 중`:'누워서 하늘 보기'}<ChevronRight size={14}/></small></button>;})}</div>{!p.available&&<p className="social-note">새 시설을 준비하고 있어요.</p>}
  </section>}
  {p.resource?.kind==='hammock'&&<section className="rest-controls" aria-label="해먹에서 하늘 보기"><button onClick={p.onExit}><LogOut size={16}/>일어나기</button></section>}
  {open==='bbq'&&<section className="facility-panel bbq-panel" aria-label="공동 바베큐"><header><div><small>SHARE A LITTLE WARMTH</small><h2>함께 굽고, 나눠 먹어요</h2></div><button aria-label="바베큐 닫기" onClick={close}><X size={17}/></button></header>
   <div className="food-picker" aria-label="구울 음식">{(Object.keys(FOOD)as FoodType[]).map(type=><button key={type} aria-pressed={type===food} onClick={()=>setFood(type)}><i style={{background:FOOD[type].color}}/>{FOOD[type].name}</button>)}</div>
   <div className="grill-slots">{p.social.bbq.slots.map((f,i)=>{const stage=f?foodStage(f,p.now):'empty',ready=f&&p.now-f.placedAt>=30000&&f.flippedAt!==null;return <article key={i} className={`grill-slot ${stage}`}><span className="slot-number">{String(i+1).padStart(2,'0')}</span>{!f?<button disabled={!p.available||p.busy} aria-label={`${i+1}번 그릴에 ${FOOD[food].name} 올리기`} onClick={()=>p.onAction('bbq_place',{slot:i,foodType:food})}><i style={{background:FOOD[food].color}}/>올리기</button>:<><strong>{FOOD[f.type].name}</strong><small>{stage==='overdone'?'더 바삭하게':ready?'잘 익었어요':f.flippedAt===null?'한 번 뒤집어 주세요':`${Math.max(0,30-Math.floor((p.now-f.placedAt)/1000))}초 더 굽기`}</small><progress max={30} value={Math.min(30,(p.now-f.placedAt)/1000)}/><div><button disabled={p.busy} aria-label={`${i+1}번 음식 뒤집기`} onClick={()=>p.onAction('bbq_flip',{slot:i})}>뒤집기</button><button disabled={!ready||p.busy} aria-label={`${i+1}번 음식 나누기`} onClick={()=>p.onAction('bbq_serve',{slot:i})}>나누기</button><button className="clear-food" aria-label={`${i+1}번 그릴 비우기`} disabled={p.busy} onClick={()=>p.onAction('bbq_clear',{slot:i})}><X size={11}/></button></div></>}</article>;})}</div>
   <div className="serving-table"><span>함께 먹는 테이블</span>{p.social.bbq.servings.length?<div>{p.social.bbq.servings.map(f=><button key={f.id} disabled={p.busy} onClick={()=>p.onAction('bbq_eat',{foodId:f.id})}><i style={{background:FOOD[f.type].color}}/>{FOOD[f.type].name} 한 입</button>)}</div>:<small>잘 익은 음식을 여기에 나눠 주세요.</small>}</div>
   <div className="bbq-seating"><button disabled={p.busy||!p.available} onClick={()=>{const id=Array.from({length:8},(_,i)=>`bbq-chair-${i}`).find(id=>!p.social.occupancies[id]);if(id)void p.onOccupy(id);}}>테이블에 앉기</button>{p.resource?.kind==='bbq'&&<button onClick={p.onExit}>자리에서 일어나기</button>}</div>
   {!p.available&&<p className="social-note">새 시설을 준비하고 있어요.</p>}{p.error&&<p className="social-error" role="alert">{p.error}</p>}
  </section>}
  {circle&&circle.phase!=='finished'&&<section className={`circle-invite ${circle.phase}`} aria-label="함께 불 돌기 모임"><div><Flame size={19}/><span>{circle.phase==='recruiting'?'손잡고, 한 바퀴 어때요?':circle.phase==='countdown'?`${Math.max(1,Math.ceil(((circle.startsAt??0)-p.now)/1000))}초 뒤 함께 출발해요`:'같은 불빛을 따라, 둥글게'}<small>{circle.participants.length}/8명의 캠퍼{circle.phase==='active'?` · ${Math.max(0,Math.ceil(((circle.endsAt??0)-p.now)/1000))}초`:' · 네 명 이상 모이면 시작해요'}</small></span></div>
   <nav>{!participant&&circle.phase==='recruiting'&&<button disabled={p.busy||circle.participants.length>=8} onClick={()=>{close();void p.onAction('circle_join',{eventId:circle.id});}}>함께할게요</button>}{participant&&circle.hostId===p.userId&&circle.phase==='recruiting'&&<button disabled={p.busy||circle.participants.length<4} onClick={()=>p.onAction('circle_start',{eventId:circle.id})}>함께 시작하기</button>}{participant&&<button aria-label="모임에서 대화" onClick={p.onChat}><MessageCircle size={16}/></button>}{participant&&<button className="circle-leave" onClick={p.onExit}>모임에서 나오기</button>}</nav>
  </section>}
 </>;
}
