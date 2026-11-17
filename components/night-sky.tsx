'use client';
import {useEffect,useMemo,useRef,useState}from'react';
import {useFrame,useThree}from'@react-three/fiber';
import * as THREE from'three';
import {celestialDirection}from'@/lib/astronomy';
import {CAMP}from'@/lib/environment';
import SunCalc from'suncalc';
import type {SkyView}from'@/lib/grounds';
type Star=number[];type Lines={features:{id:string;geometry:{coordinates:number[][][]}}[]};
// Point sprites preserve a star's round footprint at the celestial poles.
// An equirectangular panorama stretched its bright pixels into radial streaks.
const vertex=`attribute float magnitude; attribute float seed; varying vec3 vColor; varying float vSeed; varying float vAlpha; uniform float pixelRatio;
void main(){vColor=color;vSeed=seed;vAlpha=clamp(exp2((3.-magnitude)*.30),.24,1.);vAlpha*=smoothstep(-.03,.18,normalize(position).y);vec4 p=modelViewMatrix*vec4(position,1.);gl_Position=projectionMatrix*p;gl_PointSize=clamp((8.6-magnitude)*.64+1.25,1.25,7.)*pixelRatio;}`;
const fragment=`varying vec3 vColor;varying float vSeed;varying float vAlpha;uniform float night;uniform float time;uniform float still;
void main(){float r=length(gl_PointCoord-.5)*2.;if(r>1.)discard;float core=exp(-r*r*16.);float halo=exp(-r*r*4.)*.17;float shimmer=1.+sin(time*(1.2+vSeed)+vSeed*38.)*.035*(1.-still);gl_FragColor=vec4(vColor*shimmer,(core+halo)*night*vAlpha);}`;
const skyVertex=`varying vec3 vDirection;void main(){vDirection=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`;
const skyFragment=`varying vec3 vDirection;uniform float cloud;uniform float daylight;
void main(){vec3 d=normalize(vDirection);float horizon=pow(1.-max(d.y,0.),4.);vec3 night=mix(vec3(.0016,.0031,.006),vec3(.018,.029,.038),horizon);vec3 day=mix(vec3(.17,.34,.51),vec3(.52,.62,.64),horizon);vec3 col=mix(night,day,daylight);col=mix(col,mix(vec3(.018,.026,.034),vec3(.30,.36,.39),daylight),cloud*.6);gl_FragColor=vec4(pow(col,vec3(.4545)),1.);}`;
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
 const dome=useMemo(()=>new THREE.ShaderMaterial({vertexShader:skyVertex,fragmentShader:skyFragment,uniforms:{cloud:{value:0},daylight:{value:0}},side:THREE.BackSide,depthWrite:false,toneMapped:false}),[]);
 const lineGeometry=useMemo(()=>{
  const positions:number[]=[];lines?.features.filter(f=>!sky.selected||f.id===sky.selected).forEach(f=>f.geometry.coordinates.forEach(path=>{for(let i=1;i<path.length;i++)positions.push(...celestialDirection(...path[i-1] as [number,number],epoch).map(v=>v*300),...celestialDirection(...path[i] as [number,number],epoch).map(v=>v*300));}));
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));return g;
 },[lines,minute,sky.selected]);
 useEffect(()=>()=>geometry.dispose(),[geometry]);useEffect(()=>()=>lineGeometry.dispose(),[lineGeometry]);useEffect(()=>()=>{starMaterial.dispose();dome.dispose();},[starMaterial,dome]);
 useFrame(({clock},dt)=>{
  root.current?.position.copy(camera.position);const night=THREE.MathUtils.clamp(1-light*1.5,0,1)*(1-cloud*.6);
  starMaterial.uniforms.night.value=THREE.MathUtils.lerp(starMaterial.uniforms.night.value,night,Math.min(1,dt*1.5));starMaterial.uniforms.time.value=clock.elapsedTime;starMaterial.uniforms.still.value=reduced?1:0;
  starMaterial.uniforms.pixelRatio.value=gl.getPixelRatio();dome.uniforms.daylight.value=light;dome.uniforms.cloud.value=cloud;
 });
 return <group ref={root}><Moon now={now} light={light}/><mesh renderOrder={-10}><sphereGeometry args={[360,48,32]}/><primitive object={dome} attach="material"/></mesh><points geometry={geometry} material={starMaterial} frustumCulled={false} renderOrder={-5}/><lineSegments geometry={lineGeometry} visible={sky.lines&&light<.35} renderOrder={-4}><lineBasicMaterial color="#b2d6ef" transparent opacity={sky.selected ? .58 : .22} depthWrite={false} toneMapped={false}/></lineSegments></group>;
}

function Moon({now,light}:{now:number;light:number}){const {camera}=useThree(),ref=useRef<THREE.Mesh>(null);const map=useMemo(()=>{const t=new THREE.TextureLoader().load('/sky/moon.jpg');t.colorSpace=THREE.SRGBColorSpace;return t;},[]);const material=useMemo(()=>new THREE.ShaderMaterial({vertexShader:'varying vec2 vUv;varying vec3 vN;void main(){vUv=uv;vN=normal;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',fragmentShader:'varying vec2 vUv;varying vec3 vN;uniform sampler2D surface;uniform vec3 sun;void main(){vec3 albedo=texture2D(surface,vUv).rgb;float lit=max(dot(normalize(vN),sun),0.);vec3 c=albedo*(lit*1.4+.055);gl_FragColor=vec4(pow(c,vec3(.4545)),1.);}',uniforms:{surface:{value:map},sun:{value:new THREE.Vector3(1,0,.1).normalize()}},toneMapped:false}),[map]);const direction=new THREE.Vector3(-.38,.62,-.78).normalize();useFrame(()=>{if(ref.current){ref.current.position.copy(direction).multiplyScalar(280);ref.current.quaternion.copy(camera.quaternion);const fraction=SunCalc.getMoonIllumination(new Date(now)).fraction,a=Math.acos(fraction*2-1);material.uniforms.sun.value.set(Math.sin(a),.08,Math.cos(a)).normalize();}});useEffect(()=>()=>{map.dispose();material.dispose();},[map,material]);return <mesh ref={ref} visible={light<.25}><sphereGeometry args={[3.5,40,32]}/><primitive object={material} attach="material"/></mesh>;}
