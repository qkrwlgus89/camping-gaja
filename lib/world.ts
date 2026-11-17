import { Motion, ZONES, Zone } from './types';
export function zoneAt(x:number,z:number):Zone {
  return (Object.entries(ZONES) as [Zone,typeof ZONES[Zone]][]).reduce((best,[key,p])=>Math.hypot(p.x-x,p.z-z)<Math.hypot(ZONES[best].x-x,ZONES[best].z-z)?key:best,'fire' as Zone);
}
export function walkable(x:number,z:number){return Number.isFinite(x)&&Number.isFinite(z)&&x>=-38&&x<=38&&z>=-16&&z<=40&&Math.hypot(x,z-1.5)>1.1;}
export function validMotion(value:unknown):value is Motion {
 if(!value||typeof value!=='object')return false;const p=value as Motion;
 return typeof p.userId==='string'&&p.userId.length<80&&Number.isSafeInteger(p.seq)&&p.seq>=0&&Number.isFinite(p.sentAt)&&Number.isFinite(p.yaw)&&Math.abs(p.yaw)<=Math.PI*2&&Number.isFinite(p.x)&&Number.isFinite(p.z)&&p.x>=-38&&p.x<=38&&p.z>=-16&&p.z<=40&&['walking','standing','sitting'].includes(p.pose)&&Object.hasOwn(ZONES,p.zone)&&p.zone===zoneAt(p.x,p.z)&&(p.heading===undefined||Number.isFinite(p.heading)&&Math.abs(p.heading)<=Math.PI*2)&&(p.pitch===undefined||Number.isFinite(p.pitch)&&Math.abs(p.pitch)<=1.55)&&(p.inside===undefined||typeof p.inside==='boolean');
}
export function fireIntensity(lit:boolean,woodAt:number,now:number){return lit ? .65+.6*Math.exp(-Math.max(0,now-woodAt)/40000):0;}
