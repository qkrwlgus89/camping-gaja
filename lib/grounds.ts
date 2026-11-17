import type { Fire, Motion, Weather } from './types';
export const GEAR = {
  lantern:{name:'오일 랜턴',detail:'텐트에 따뜻한 빛',icon:'lantern'},
  blanket:{name:'니트 담요',detail:'불 앞의 포근한 자리',icon:'blanket'},
  telescope:{name:'망원경',detail:'오늘 밤 별자리 찾기',icon:'telescope'},
  kettle:{name:'차 도구',detail:'텐트 안에서 차 한 잔',icon:'kettle'},
  book:{name:'한 권의 책',detail:'조용히 남기는 하루',icon:'book'},
  camera:{name:'필름 카메라',detail:'함께 머문 순간 기록',icon:'camera'},
} as const;
export type Gear = keyof typeof GEAR;
export type Placement = {item:Gear;x:number;z:number};
export type Visitor = {userId:string;name:string;bag:Gear[];placements:Placement[];roomId:string|null;tentIndex:number;seat:number;lastSeen:number};
export type GroundEvent = {id:string;userId:string;kind:'wave'|'skip'|'marshmallow'|'chat';value:number;text?:string;createdAt:number};
export type Grounds = {version:number;fire:Fire;visitors:Visitor[];events:GroundEvent[];weather?:Weather|null};
export type SkyView = {active:boolean;lines:boolean;selected:string|null;focus:[number,number]|null};
export type WorldActivity = {kind:'none'|'mallow'|'skip';angle:number;heat:[number,number];holding:boolean;power:number;result:number|null;finished:boolean};
export const EMPTY_ACTIVITY:WorldActivity={kind:'none',angle:0,heat:[0,0],holding:false,power:0,result:null,finished:false};
export function tentPosition(index:number):[number,number] {
  const slots:[number,number][]=[[-9,-5],[9,-5],[-19,7],[19,7],[-10,20],[10,20],[-27,28],[27,28]];
  const base=slots[Math.max(0,index)%8];return [base[0],base[1]+Math.floor(Math.max(0,index)/8)*18];
}
export const emptyGrounds=():Grounds=>({version:0,fire:{lit:true,woodAt:Date.now()-60000,startedAt:Date.now()-60000},visitors:[],events:[]});
