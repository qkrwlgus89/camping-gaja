'use client';
import {useEffect,useMemo,useRef,useState}from'react';
import {useFrame,useThree}from'@react-three/fiber';
import * as THREE from'three';
import {celestialDirection}from'@/lib/astronomy';
import {CAMP}from'@/lib/environment';
import type {SkyView}from'@/lib/grounds';
type Star=number[];type Lines={features:{id:string;geometry:{coordinates:number[][][]}}[]};
const vertex=`attribute float magnitude; attribute float seed; varying vec3 vColor; varying float vSeed; uniform float pixelRatio; void main(){vColor=color;vSeed=seed;vec4 p=modelViewMatrix*vec4(position,1.);gl_Position=projectionMatrix*p;gl_PointSize=clamp((6.8-magnitude)*.8+1.1,1.0,8.0)*pixelRatio;}`;
const fragment=`varying vec3 vColor;varying float vSeed;uniform float night;uniform float time;uniform float still;void main(){vec2 uv=gl_PointCoord-.5;float r=length(uv)*2.;if(r>1.)discard;float core=exp(-r*r*28.);float halo=exp(-r*r*4.)*.2;float shimmer=1.+sin(time*(1.2+vSeed)+vSeed*38.)*.045*(1.-still);gl_FragColor=vec4(vColor*shimmer,(core+halo)*night);}`;
const skyVertex=`varying vec3 vDirection;void main(){vDirection=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`;
const skyFragment=`varying vec3 vDirection; uniform sampler2D panorama;uniform float night;uniform float cloud;uniform float daylight;uniform float sidereal;uniform float latitude;
void main(){vec3 d=normalize(vDirection);float north=-d.z;float dec=asin(clamp(d.y*sin(latitude)+north*cos(latitude),-1.,1.));float hour=atan(-d.x,d.y*cos(latitude)-north*sin(latitude));float ra=sidereal-hour;vec2 uv=vec2(fract(.5-ra/6.283185307),dec/3.141592654+.5);vec3 stars=texture2D(panorama,uv).rgb;float horizon=pow(1.-max(d.y,0.),5.);vec3 col=stars*(1.-horizon*.35)*(1.-cloud*.72);col+=vec3(.0015,.003,.006)*horizon;col=mix(col,vec3(.16,.24,.32),daylight);gl_FragColor=vec4(pow(max(col,vec3(0.)),vec3(.4545)),1.);}`;
export default function NightSky({now,light,sky,reduced,cloud}:{now:number;light:number;sky:SkyView;reduced:boolean;cloud:number}){
 const {camera,gl}=useThree(),root=useRef<THREE.Group>(null);const [catalog,setCatalog]=useState<Star[]>([]),[lines,setLines]=useState<Lines|null>(null);
 useEffect(()=>{let live=true;void Promise.all([fetch('/sky/catalog.json').then(r=>r.json()),fetch('/sky/constellations.lines.json').then(r=>r.json())]).then(([a,b])=>{if(live){setCatalog(a);setLines(b);}});return()=>{live=false;};},[]);
 const minute=Math.floor(now/60000),epoch=minute*60000;
 const geometry=useMemo(()=>{
  const positions:number[]=[],colors:number[]=[],magnitudes:number[]=[],seeds:number[]=[];let seed=84;const rand=()=>{seed=seed*16807%2147483647;return(seed-1)/2147483646;};
  const add=(d:number[],mag:number,bv:number)=>{positions.push(...d.map(v=>v*310));const warm=Math.max(0,Math.min(1,(bv+.3)/2));colors.push(THREE.MathUtils.lerp(.64,1,warm),THREE.MathUtils.lerp(.79,.82,warm),THREE.MathUtils.lerp(1,.58,warm));magnitudes.push(mag);seeds.push(rand());};
  catalog.forEach(s=>add(celestialDirection(s[0],s[1],epoch),s[2],s[3]));
  const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geo.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));geo.setAttribute('magnitude',new THREE.Float32BufferAttribute(magnitudes,1));geo.setAttribute('seed',new THREE.Float32BufferAttribute(seeds,1));return geo;
 },[catalog,minute]);
 const starMaterial=useMemo(()=>new THREE.ShaderMaterial({vertexShader:vertex,fragmentShader:fragment,uniforms:{pixelRatio:{value:gl.getPixelRatio()},night:{value:1},time:{value:0},still:{value:0}},transparent:true,vertexColors:true,depthWrite:false,blending:THREE.AdditiveBlending,toneMapped:false}),[gl]);
 const panorama=useMemo(()=>{const t=new THREE.TextureLoader().load(innerWidth<760?'/sky/nasa-4k.webp':'/sky/nasa-8k.webp');t.colorSpace=THREE.SRGBColorSpace;t.wrapS=THREE.RepeatWrapping;return t;},[]);
 const dome=useMemo(()=>new THREE.ShaderMaterial({vertexShader:skyVertex,fragmentShader:skyFragment,uniforms:{panorama:{value:panorama},sidereal:{value:0},latitude:{value:CAMP.latitude*Math.PI/180},pole:{value:new THREE.Vector3()},center:{value:new THREE.Vector3()},night:{value:1},cloud:{value:0},daylight:{value:0}},side:THREE.BackSide,depthWrite:false,toneMapped:false}),[]);
 const lineGeometry=useMemo(()=>{
  const positions:number[]=[];lines?.features.filter(f=>!sky.selected||f.id===sky.selected).forEach(f=>f.geometry.coordinates.forEach(path=>{for(let i=1;i<path.length;i++)positions.push(...celestialDirection(...path[i-1] as [number,number],epoch).map(v=>v*300),...celestialDirection(...path[i] as [number,number],epoch).map(v=>v*300));}));
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));return g;
 },[lines,minute,sky.selected]);
 useEffect(()=>()=>{geometry.dispose();lineGeometry.dispose();},[geometry,lineGeometry]);useEffect(()=>()=>{starMaterial.dispose();dome.dispose();panorama.dispose();},[starMaterial,dome]);
 useFrame(({clock},dt)=>{
  root.current?.position.copy(camera.position);const night=THREE.MathUtils.clamp(1-light*1.5,0,1)*(1-cloud*.6);
  starMaterial.uniforms.night.value=THREE.MathUtils.lerp(starMaterial.uniforms.night.value,night,Math.min(1,dt*1.5));starMaterial.uniforms.time.value=clock.elapsedTime;starMaterial.uniforms.still.value=reduced?1:0;
  const jd=epoch/86400000+2440587.5;dome.uniforms.sidereal.value=((280.46061837+360.98564736629*(jd-2451545)+CAMP.longitude)%360)*Math.PI/180;dome.uniforms.night.value=1-light;dome.uniforms.daylight.value=light;dome.uniforms.cloud.value=cloud;dome.uniforms.pole.value.set(...celestialDirection(192.85948,27.12825,epoch));dome.uniforms.center.value.set(...celestialDirection(266.4051,-28.936175,epoch));
 });
 return <group ref={root}><mesh renderOrder={-10}><sphereGeometry args={[360,48,32]}/><primitive object={dome} attach="material"/></mesh><points geometry={geometry} material={starMaterial} frustumCulled={false} renderOrder={-5}/><lineSegments geometry={lineGeometry} visible={sky.lines&&light<.35} renderOrder={-4}><lineBasicMaterial color="#b2d6ef" transparent opacity={sky.selected ? .58 : .22} depthWrite={false} toneMapped={false}/></lineSegments></group>;
}
