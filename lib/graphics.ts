export type GraphicsQuality='auto'|'sharp'|'light';
export type ResolutionPolicy={initial:number;min:number;max:number;automatic:boolean};
export function resolutionPolicy(quality:GraphicsQuality,mobile:boolean,nativeDpr:number):ResolutionPolicy{
 const native=Number.isFinite(nativeDpr)?Math.max(1,nativeDpr):1;
 if(quality==='light')return{initial:.85,min:.85,max:.85,automatic:false};
 if(quality==='sharp'){const dpr=Math.min(mobile?1.75:2,Math.max(1.5,native));return{initial:dpr,min:dpr,max:dpr,automatic:false};}
 const max=Math.min(mobile?1.5:1.75,native);
 return{initial:max,min:1,max,automatic:true};
}
export type ResolutionState={dpr:number;slow:number;fast:number;startedAt:number;changedAt:number};
export const initialResolution=(policy:ResolutionPolicy,now:number):ResolutionState=>({dpr:policy.initial,slow:0,fast:0,startedAt:now,changedAt:now});
// Samples represent two seconds each. Ignore loading and brief frame-time spikes.
export function adaptResolution(state:ResolutionState,policy:ResolutionPolicy,fps:number,now:number):ResolutionState{
 if(!policy.automatic||!Number.isFinite(fps)||now-state.startedAt<12000||now-state.changedAt<10000)return state;
 const next={...state,slow:fps<24?state.slow+1:0,fast:fps>48?state.fast+1:0};
 if(next.slow>=3&&next.dpr>policy.min){next.dpr=Math.max(policy.min,next.dpr-.25);next.changedAt=now;next.slow=next.fast=0;}
 else if(next.fast>=5&&next.dpr<policy.max){next.dpr=Math.min(policy.max,next.dpr+.25);next.changedAt=now;next.slow=next.fast=0;}
 return next;
}
