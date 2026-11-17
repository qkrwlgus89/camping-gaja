'use client';
import {useMemo,useRef,useEffect} from 'react';
import {useFrame,useLoader} from '@react-three/fiber';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {clone} from 'three/addons/utils/SkeletonUtils.js';
import * as T from 'three';
import type {Motion} from '@/lib/types';
export function CamperAvatar({motion,self=false,lying=false,wave=false}:{motion:Motion;self?:boolean;lying?:boolean;wave?:boolean}){
 const source=useLoader(GLTFLoader,'/models/camper-cute.glb'),root=useRef<T.Group>(null),previous=useRef(''),elapsed=useRef(0);
 const rig=useMemo(()=>{
  const scene=clone(source.scene),box=new T.Box3().setFromObject(source.scene),height=box.getSize(new T.Vector3()).y,scale=1.38/height;
  const materials:T.Material[]=[];
  scene.traverse(o=>{if(!(o instanceof T.Mesh))return;o.frustumCulled=false;o.castShadow=true;o.receiveShadow=false;
   const convert=(old:T.Material)=>{const m=old.clone() as T.MeshStandardMaterial;materials.push(m);m.metalness=0;m.roughness=.88;
    if(m.name==='Shirt')m.color.set('#8b9c8b');if(m.name==='Pants')m.color.set('#41494c');if(m.name==='Skin')m.color.set('#c5a18a');if(m.name==='Hair')m.color.set('#37332d');m.emissive.copy(m.color).multiplyScalar(.055);return m;};
   o.material=Array.isArray(o.material)?o.material.map(convert):convert(o.material);
  });
  const mixer=new T.AnimationMixer(scene),clips:Record<string,T.AnimationClip>={};
  for(const original of source.animations){const key=({idle:'Idle',walk:'Walk',sit:'Sitting'} as Record<string,string>)[original.name];if(!key)continue;const clip=original.clone();
   if(key==='Walk'){for(const track of clip.tracks)if(track.name==='root.position'){const v=track.values,y=v[1];for(let i=0;i<v.length;i+=3){v[i]=v[0];v[i+1]=y+(v[i+1]-y)*.22;v[i+2]=v[2];}}}
   clips[key]=clip;
  }
  const actions=Object.fromEntries(Object.entries(clips).map(([key,c])=>[key,mixer.clipAction(c)]));
  return{scene,scale,floor:-box.min.y*scale,mixer,actions,materials,arm:scene.getObjectByName('arm-right'),legs:[scene.getObjectByName('leg-left'),scene.getObjectByName('leg-right')]};
 },[source]);
 useEffect(()=>{previous.current='';return()=>{rig.mixer.stopAllAction();rig.materials.forEach(m=>m.dispose());};},[rig]);
 useFrame((_,dt)=>{
  if(!root.current)return;elapsed.current+=dt;const blend=1-Math.exp(-dt*16),targetY=lying?.35:motion.pose==='sitting'?.13:0;
  if(self)root.current.position.set(motion.x,targetY,motion.z);else root.current.position.lerp(new T.Vector3(motion.x,targetY,motion.z),blend);
  root.current.quaternion.slerp(new T.Quaternion().setFromEuler(new T.Euler(lying?-Math.PI/2:0,(motion.heading??motion.yaw)+Math.PI,0)),1-Math.exp(-dt*12));
  const state=lying?'Idle':motion.pose==='sitting'?'Sitting':motion.pose==='walking'?'Walk':'Idle';
  if(state!==previous.current){const action=rig.actions[state];if(action){action.reset().setEffectiveTimeScale(state==='Walk'?1.12:.85).setEffectiveWeight(1).play();if(previous.current)action.crossFadeFrom(rig.actions[previous.current],.28,false);}previous.current=state;}
  rig.mixer.update(Math.min(dt,.075));
  if(state==='Sitting')rig.legs.forEach(leg=>leg?.rotation.set(-1.1,0,0));
  if(wave&&rig.arm){rig.arm.rotateX(-2.1);rig.arm.rotateZ(Math.sin(elapsed.current*7)*.22);}
 });
 return <group ref={root} name={self?'my-avatar':'camp-visitor'} position={[motion.x,0,motion.z]}><group scale={rig.scale} position={[0,rig.floor,0]}><primitive object={rig.scene}/></group></group>;
}
