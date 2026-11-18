import {ZONES,type Zone} from './types';
export function zoneAt(x:number,z:number):Zone {
  return (Object.entries(ZONES) as [Zone,typeof ZONES[Zone]][]).reduce((best,[key,p])=>Math.hypot(p.x-x,p.z-z)<Math.hypot(ZONES[best].x-x,ZONES[best].z-z)?key:best,'fire' as Zone);
}
