import type{Weather}from'./types';
type AudioState={weather:Weather;night:boolean;creek:number;fire:number;shelter:boolean;master:number;nature:number;effects:number;asmr:boolean};
export class CampAudio{
 context:AudioContext|null=null;master:GainNode|null=null;effects:GainNode|null=null;filter:BiquadFilterNode|null=null;buses=new Map<string,GainNode>();loaded=false;
 async start(){
  if(this.context){await this.context.resume();return;}
  const ctx=this.context=new AudioContext();this.master=ctx.createGain();this.master.gain.value=0;this.master.connect(ctx.destination);this.effects=ctx.createGain();this.effects.connect(this.master);await ctx.resume();
  const settled=await Promise.allSettled(['river','wind','fire','rain','crickets'].map(async name=>{
   const response=await fetch('/audio/'+name+'.mp3');if(!response.ok)throw Error('AUDIO_MISSING');const decoded=await ctx.decodeAudioData(await response.arrayBuffer());
   const fade=Math.min(Math.floor(ctx.sampleRate*1.2),Math.floor(decoded.length/8)),length=decoded.length-fade,buffer=ctx.createBuffer(decoded.numberOfChannels,length,decoded.sampleRate);
   for(let channel=0;channel<decoded.numberOfChannels;channel++){const src=decoded.getChannelData(channel),dst=buffer.getChannelData(channel);for(let i=0;i<length;i++)dst[i]=i<fade?src[length+i]*Math.cos(i/fade*Math.PI/2)+src[i]*Math.sin(i/fade*Math.PI/2):src[i];}
   const source=ctx.createBufferSource(),bus=ctx.createGain(),filter=ctx.createBiquadFilter();source.buffer=buffer;source.loop=true;filter.type='lowpass';filter.frequency.value=name==='wind'?2200:18000;bus.gain.value=0;source.connect(filter);filter.connect(bus);bus.connect(this.master!);this.buses.set(name,bus);if(name==='rain')this.filter=filter;source.start();
  }));
  this.loaded=true;if(settled.every(s=>s.status==='rejected'))throw Error('환경음을 불러오지 못했어요.');
 }
 update(s:AudioState,enabled:boolean){const ctx=this.context;if(!ctx||!this.master)return;const gain=(n:GainNode|undefined|null,v:number)=>n?.gain.setTargetAtTime(v,ctx.currentTime,1.2);gain(this.master,enabled?s.master:0);const wet=['rain','sleet'].includes(s.weather.kind);gain(this.buses.get('river'),(.055+s.creek*.28)*s.nature);gain(this.buses.get('wind'),(s.shelter?.04:.13)*s.nature);gain(this.buses.get('fire'),s.fire*.45*s.nature);gain(this.buses.get('rain'),wet?(s.shelter?.35:.22)*s.nature:0);gain(this.buses.get('crickets'),s.night&&!wet&&s.weather.kind!=='snow'&&(s.weather.temperature??15)>=10?.23*s.nature:0);gain(this.effects,s.effects*(s.asmr?.25:1));this.filter?.frequency.setTargetAtTime(s.shelter?1500:16000,ctx.currentTime,1.2);}
 splash(count:number){const ctx=this.context;if(!ctx||!this.effects)return;for(let i=0;i<Math.max(1,count);i++){const size=ctx.sampleRate*.16,buffer=ctx.createBuffer(1,size,ctx.sampleRate),data=buffer.getChannelData(0);for(let j=0;j<size;j++)data[j]=(Math.random()*2-1)*Math.exp(-j/(size*.18))*.12;const source=ctx.createBufferSource();source.buffer=buffer;source.connect(this.effects);source.start(ctx.currentTime+i*.34);}}
 close(){void this.context?.close();}
}
