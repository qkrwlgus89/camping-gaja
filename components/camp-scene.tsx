"use client";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { daylight } from "@/lib/environment";
import { fireIntensity } from "@/lib/world";
import type { CampEvent, Fire, Motion, Weather, Zone } from "@/lib/types";
type Props = { motion: React.RefObject<Motion>; friend: Motion | null; fire: Fire; now: number; weather: Weather; reduced: boolean; mobile: boolean; events: CampEvent[]; waving: boolean; onReady: () => void; onFailure: () => void };
function random(seed: number) { let n = seed; return () => { n = n * 16807 % 2147483647; return (n - 1) / 2147483646; }; }
function texture(kind: "earth" | "bark" | "wood" | "cloth") {
  const c = document.createElement("canvas"); c.width = c.height = 128;
  const ctx = c.getContext("2d")!;
  const r = random(27), base = kind === "earth" ? [106, 112, 78] : kind === "bark" ? [91, 78, 59] : kind === "wood" ? [143, 119, 82] : [153, 161, 127];
  ctx.fillStyle = `rgb(${base})`; ctx.fillRect(0, 0, 128, 128);
  for (let i = 0; i < 3000; i++) {
    const v = (r() - 0.5) * 42; ctx.fillStyle = `rgba(${base.map(a => a + v).join(",")},.4)`;
    ctx.fillRect(r() * 128, r() * 128, kind === "earth" ? 2 : kind === "cloth" ? 1 : 1.5, kind === "earth" ? 2 : kind === "cloth" ? 4 : r() * 40);
  }
  const map = new THREE.CanvasTexture(c); map.wrapS = map.wrapT = THREE.RepeatWrapping; map.colorSpace = THREE.SRGBColorSpace;
  map.repeat.set(kind === "earth" ? 16 : 2, kind === "earth" ? 16 : 2); return map;
}
function Forest({ snow }: { snow: boolean }) {
  const trunk = useRef<THREE.InstancedMesh>(null), crowns = useRef<THREE.InstancedMesh>(null), pines = useRef<THREE.InstancedMesh>(null);
  const bark = useMemo(() => texture("bark"), []);
  const trees = useMemo(() => {
    const r = random(66); return Array.from({ length: 180 }, (_, i) => {
      const a = r() * Math.PI * 2, radius = 13 + r() * 35;
      const x = Math.cos(a) * radius, z = Math.sin(a) * radius - 7;
      return { x, z: z > 9 && Math.abs(x) < 10 ? -z : z, height: 6 + r() * 10, wide: 1.5 + r() * 2, pine: i % 3 !== 0 };
    });
  }, []);
  useEffect(() => {
    const dummy = new THREE.Object3D(), color = new THREE.Color(); let ci = 0, pi = 0;
    trees.forEach((t, i) => {
      dummy.position.set(t.x, t.height / 2, t.z); dummy.scale.set(0.22 + t.height / 70, t.height, 0.22 + t.height / 70); dummy.rotation.set(0, i, 0); dummy.updateMatrix(); trunk.current!.setMatrixAt(i, dummy.matrix);
      if (t.pine) {
        for (let k = 0; k < 3; k++) {
          dummy.position.set(t.x, t.height * (0.52 + k * 0.17), t.z); dummy.scale.set(t.wide * (1 - k * 0.22), t.height * 0.46, t.wide * (1 - k * 0.22)); dummy.updateMatrix(); pines.current!.setMatrixAt(pi, dummy.matrix);
          color.set(snow ? (k === 2 ? "#b3c5bc" : "#627d6a") : ["#426348", "#355b45", "#50704d", "#2e5141"][i % 4]); pines.current!.setColorAt(pi++, color);
        }
      } else {
        for (let k = 0; k < 5; k++) {
          const a = k * 2.4 + i;
          dummy.position.set(t.x + Math.sin(a) * t.wide * 0.6, t.height * (0.75 + (k % 3) * 0.12), t.z + Math.cos(a) * t.wide * 0.6); dummy.scale.set(t.wide, t.wide * 0.8, t.wide); dummy.updateMatrix(); crowns.current!.setMatrixAt(ci, dummy.matrix);
          color.set(snow ? "#8b9e8c" : ["#5c7549", "#4f714c", "#6d8050"][k % 3]); crowns.current!.setColorAt(ci++, color);
        }
      }
    });
    for (const mesh of [trunk.current, crowns.current, pines.current]) { if (mesh) { mesh.instanceMatrix.needsUpdate = true; if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true; } }
  }, [trees, snow]);
  useEffect(() => () => bark.dispose(), [bark]);
  return <group>
    <instancedMesh ref={trunk} args={[undefined, undefined, 180]} castShadow receiveShadow><cylinderGeometry args={[0.7, 1, 1, 7]} /><meshStandardMaterial map={bark} roughness={1} /></instancedMesh>
    <instancedMesh ref={pines} args={[undefined, undefined, 360]} castShadow><coneGeometry args={[1, 1, 9]} /><meshStandardMaterial roughness={0.95} /></instancedMesh>
    <instancedMesh ref={crowns} args={[undefined, undefined, 300]} castShadow><icosahedronGeometry args={[1, 1]} /><meshStandardMaterial roughness={1} /></instancedMesh>
  </group>;
}
function Ground({ weather }: { weather: Weather }) {
  const earth = useMemo(() => texture("earth"), []);
  const stones = useRef<THREE.InstancedMesh>(null);
  useEffect(() => {
    const r = random(40), dummy = new THREE.Object3D();
    for (let i = 0; i < 140; i++) {
      const x = (r() - .5) * 65, z = i % 2 ? -6.9 + Math.sin(x * .17) * .8 : -10.4 + Math.sin(x * .17) * .8;
      dummy.position.set(x, .05, z); dummy.scale.set(.3 + r() * .8, .2 + r() * .5, .3 + r() * .7); dummy.rotation.set(r(), r(), r()); dummy.updateMatrix(); stones.current!.setMatrixAt(i, dummy.matrix);
      stones.current!.setColorAt(i, new THREE.Color().setHSL(.24, .04, .24 + r() * .2));
    }
    stones.current!.instanceMatrix.needsUpdate = true;
  }, []);
  useEffect(() => () => earth.dispose(), [earth]);
  return <group>
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -.16, 0]} receiveShadow><planeGeometry args={[180, 180]} /><meshStandardMaterial map={earth} color={weather.kind === "snow" ? "#c4cbb8" : "#c0bd9b"} roughness={weather.kind === "rain" || weather.kind === "sleet" ? .48 : 1} /></mesh>
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -.145, 2]}><circleGeometry args={[5.4, 48]} /><meshStandardMaterial color="#aaa183" map={earth} roughness={1} /></mesh>
    <instancedMesh ref={stones} args={[undefined, undefined, 140]} receiveShadow><icosahedronGeometry args={[1, 1]} /><meshStandardMaterial roughness={.7} /></instancedMesh>
    {Array.from({ length: 9 }, (_, i) => <mesh key={i} position={[(i - 4) * 11, 1, -48 - (i % 3) * 8]} scale={[18, 10 + (i % 3) * 5, 9]}><icosahedronGeometry args={[1, 2]} /><meshStandardMaterial color={["#55746b", "#638175", "#46675c"][i % 3]} roughness={1} /></mesh>)}
  </group>;
}
function Stream({ events, reduced }: { events: CampEvent[]; reduced: boolean }) {
  const shimmer = useRef<THREE.Group>(null);
  const water = useMemo(() => {
    const v: number[] = [], indices: number[] = [];
    for (let i = 0; i <= 80; i++) { const x = i - 40, z = -8.6 + Math.sin(x * .17) * .8; v.push(x, -.08, z - 1.5, x, -.08, z + 1.5); if (i < 80) indices.push(i * 2, i * 2 + 2, i * 2 + 1, i * 2 + 1, i * 2 + 2, i * 2 + 3); }
    const geometry = new THREE.BufferGeometry(); geometry.setAttribute("position", new THREE.Float32BufferAttribute(v, 3)); geometry.setIndex(indices); geometry.computeVertexNormals(); return geometry;
  }, []);
  useFrame(({ clock }) => { if (shimmer.current && !reduced) shimmer.current.position.x = Math.sin(clock.elapsedTime * .3) * .18; });
  useEffect(() => () => water.dispose(), [water]);
  return <group>
    <mesh geometry={water}><meshStandardMaterial color="#6eaaa5" metalness={.42} roughness={.25} side={THREE.DoubleSide} /></mesh>
    <group ref={shimmer}>{Array.from({ length: 65 }, (_, i) => { const x = ((i * 3.71) % 65) - 32, z = -8.6 + Math.sin(x * .17) * .8 + Math.sin(i * 4) * 1.2; return <mesh key={i} rotation={[-Math.PI / 2, 0, .1]} position={[x, -.065, z]}><planeGeometry args={[.25 + (i % 5) * .3, .018]} /><meshBasicMaterial color="#d4e4d9" transparent opacity={.38} /></mesh>; })}</group>
    {events.filter(e => e.kind === "skip").slice(-3).map(e => <Ripples key={e.id} event={e} reduced={reduced} />)}
  </group>;
}
function Ripples({ event, reduced }: { event: CampEvent; reduced: boolean }) {
  const ref = useRef<THREE.Group>(null), start = useRef(0);
  useFrame(({ clock }) => {
    if (!start.current) start.current = clock.elapsedTime;
    if (!ref.current) return;
    const elapsed = clock.elapsedTime - start.current;
    ref.current.children.forEach((c, i) => { const t = elapsed - i * .3; c.visible = t >= 0 && t < 2.8; c.scale.setScalar(reduced ? .6 : Math.max(.01, t * .8)); if (c instanceof THREE.Mesh) (c.material as THREE.MeshBasicMaterial).opacity = Math.max(0, .7 - t / 4); });
  });
  return <group ref={ref}>{Array.from({ length: Math.max(1, event.value) }, (_, i) => <mesh key={i} rotation={[-Math.PI / 2, 0, 0]} position={[4.4 - i * .55, -.04, -7.2 - i * .4]}><ringGeometry args={[.49, .51, 40]} /><meshBasicMaterial color="#dcebe2" transparent side={THREE.DoubleSide} /></mesh>)}</group>;
}
function Beam({ from, to, radius = .035, color = "#5e6156" }: { from: [number, number, number]; to: [number, number, number]; radius?: number; color?: string }) {
  const { position, quaternion, length } = useMemo(() => { const a = new THREE.Vector3(...from), b = new THREE.Vector3(...to), dir = b.clone().sub(a); return { position: a.clone().add(b).multiplyScalar(.5), quaternion: new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().normalize()), length: dir.length() }; }, [from, to]);
  return <mesh position={position} quaternion={quaternion} castShadow><cylinderGeometry args={[radius, radius, length, 6]} /><meshStandardMaterial color={color} roughness={.7} /></mesh>;
}
function Chair({ position, rotation = 0 }: { position: [number, number, number]; rotation?: number }) {
  return <group position={position} rotation={[0, rotation, 0]}>
    {[-.44, .44].map(x => <group key={x}><Beam from={[x, .05, -.4]} to={[x, .72, .4]} /><Beam from={[x, .05, .4]} to={[x, 1.45, -.35]} /><Beam from={[x, .9, -.3]} to={[x, .9, .4]} radius={.05} color="#99856b" /></group>)}
    <mesh position={[0, .62, .05]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow><planeGeometry args={[.8, .7]} /><meshStandardMaterial color="#c8b58e" side={THREE.DoubleSide} roughness={1} /></mesh>
    <mesh position={[0, 1.02, .37]} rotation={[-.18, 0, 0]} castShadow><boxGeometry args={[.83, .83, .04]} /><meshStandardMaterial color="#c4b08c" roughness={1} /></mesh>
  </group>;
}
function CampObjects({ snow, firstPersonZone, seat }: { snow: boolean; firstPersonZone: Zone | null; seat: number }) {
  const wood = useMemo(() => texture("wood"), []), cloth = useMemo(() => texture("cloth"), []);
  const tent = useMemo(() => { const g = new THREE.BufferGeometry(); g.setAttribute("position", new THREE.Float32BufferAttribute([-2, 0, 1.8, 0, 2.6, 1.8, -2, 0, -1.8, 0, 2.6, 1.8, 0, 2.6, -1.8, -2, 0, -1.8, 0, 2.6, 1.8, 2, 0, 1.8, 2, 0, -1.8, 0, 2.6, -1.8, 0, 2.6, 1.8, 2, 0, -1.8], 3)); g.setAttribute("uv", new THREE.Float32BufferAttribute([0, 0, .5, 1, 1, 0, .5, 1, 1, 1, 1, 0, .5, 1, 0, 0, 1, 0, 1, 1, .5, 1, 1, 0], 2)); g.computeVertexNormals(); return g; }, []);
  useEffect(() => () => { wood.dispose(); cloth.dispose(); tent.dispose(); }, [wood, cloth, tent]);
  return <group>
    <group position={[-5.5, 0, -.5]} rotation={[0, -.18, 0]}>
      <mesh geometry={tent} castShadow receiveShadow><meshStandardMaterial map={cloth} color={snow ? "#d9dfcc" : "#a2b18b"} side={THREE.DoubleSide} roughness={.95} /></mesh>
      <mesh position={[0, .04, 0]} rotation={[-Math.PI / 2, 0, 0]}><planeGeometry args={[3.9, 3.6]} /><meshStandardMaterial color="#393d30" /></mesh>
      <Beam from={[0, 0, 1.8]} to={[0, 2.6, 1.8]} color="#a5a48e" radius={.025} />
      <Beam from={[-2, 0, 1.8]} to={[0, 2.6, 1.8]} color="#d7cfb4" radius={.018} /><Beam from={[2, 0, 1.8]} to={[0, 2.6, 1.8]} color="#d7cfb4" radius={.018} />
      <mesh position={[-.95, .85, 1.77]} rotation={[0, 0, -.5]}><planeGeometry args={[.85, 1.9]} /><meshStandardMaterial map={cloth} side={THREE.DoubleSide} /></mesh>
    </group>
    {!(firstPersonZone === "fire" && seat === 0) && <Chair position={[0, 0, 5]} />}
    {!(firstPersonZone === "fire" && seat === 1) && <Chair position={[1.5, 0, 3]} rotation={.65} />}
    {firstPersonZone !== "shelter" && <Chair position={[-5, 0, 2]} rotation={-.8} />}
    <group position={[-6, .05, -4]}>
      {Array.from({ length: 11 }, (_, i) => <mesh key={i} position={[(i - 5) * .4, 0, 0]} receiveShadow><boxGeometry args={[.38, .15, 3.2]} /><meshStandardMaterial map={wood} roughness={.8} /></mesh>)}
      {[-2.1, 0, 2.1].map(x => <Beam key={x} from={[x, 0, -1.5]} to={[x, 1.1, -1.5]} radius={.055} color="#84785e" />)}
      <Beam from={[-2.1, .95, -1.5]} to={[2.1, .95, -1.5]} radius={.05} color="#a19472" />
    </group>
    <group position={[3.8, .2, 1]}><mesh castShadow><boxGeometry args={[.8, .55, .5]} /><meshStandardMaterial color="#798a72" /></mesh><mesh position={[0, .31, 0]}><boxGeometry args={[.86, .1, .56]} /><meshStandardMaterial color="#c7c4ac" /></mesh></group>
    <mesh position={[-1.75, .2, 2]} rotation={[0, .2, 0]} castShadow><cylinderGeometry args={[.37, .4, .5, 12]} /><meshStandardMaterial map={wood} color="#b4a184" /></mesh>
    <group position={[-1.75, .53, 2]}><mesh><cylinderGeometry args={[.1, .08, .17, 12]} /><meshStandardMaterial color="#dad9c8" /></mesh><mesh position={[.1, 0, 0]} rotation={[0, Math.PI / 2, 0]}><torusGeometry args={[.06, .015, 6, 12]} /><meshStandardMaterial color="#dad9c8" /></mesh></group>
    {Array.from({ length: 18 }, (_, i) => <mesh key={i} position={[Math.sin(i * 4) * (9 + i % 3), .25, Math.cos(i * 4) * 6]} scale={[.6 + (i % 2), .5, .7]}><icosahedronGeometry args={[1, 1]} /><meshStandardMaterial color={snow ? "#c7cebd" : "#818778"} roughness={.9} /></mesh>)}
  </group>;
}
function Campfire({ fire, now, reduced }: { fire: Fire; now: number; reduced: boolean }) {
  const flame = useRef<THREE.Group>(null), light = useRef<THREE.PointLight>(null), sparks = useRef<THREE.Points>(null);
  const intensity = fireIntensity(fire.lit, fire.woodAt, now);
  const sparkPositions = useMemo(() => new Float32Array(Array.from({ length: 30 * 3 }, (_, i) => i % 3 === 1 ? (i % 13) / 6 : Math.sin(i * 5) * .5)), []);
  useFrame(({ clock }) => {
    if (flame.current) flame.current.scale.setScalar(intensity * (reduced ? 1 : 1 + Math.sin(clock.elapsedTime * 8) * .08));
    if (light.current) light.current.intensity = intensity * 32 * (reduced ? 1 : 1 + Math.sin(clock.elapsedTime * 11) * .06);
    if (sparks.current) { sparks.current.visible = fire.lit && !reduced; sparks.current.rotation.y = clock.elapsedTime * .15; sparks.current.position.y = (clock.elapsedTime * .3) % .3; }
  });
  return <group position={[0, .1, 1.5]}>
    <mesh position={[0, .27, 0]}><cylinderGeometry args={[.72, .48, .38, 14, 1, true]} /><meshStandardMaterial color="#42473e" metalness={.6} roughness={.6} side={THREE.DoubleSide} /></mesh>
    <mesh position={[0, .47, 0]} rotation={[Math.PI / 2, 0, 0]}><torusGeometry args={[.72, .04, 6, 24]} /><meshStandardMaterial color="#777764" metalness={.7} roughness={.5} /></mesh>
    {[-.35, .35].map((v, i) => <Beam key={i} from={[v, 0, -.45]} to={[v, .5, .3]} radius={.035} color="#45473d" />)}
    {Array.from({ length: 5 }, (_, i) => <mesh key={i} position={[Math.sin(i * 3) * .23, .46 + (i % 2) * .09, Math.cos(i * 3) * .15]} rotation={[Math.PI / 2, 0, i * 1.7]}><cylinderGeometry args={[.1, .13, .9, 7]} /><meshStandardMaterial color="#6b5134" emissive={fire.lit ? "#aa3711" : "#000000"} emissiveIntensity={.28} /></mesh>)}
    <group ref={flame} position={[0, .52, 0]} visible={fire.lit}>
      {Array.from({ length: 7 }, (_, i) => <mesh key={i} position={[Math.sin(i * 2.4) * .22, .2 + (i % 3) * .1, Math.cos(i * 2.4) * .22]} rotation={[0, i, Math.sin(i) * .14]}><sphereGeometry args={[1, 7, 7]} /><meshBasicMaterial color={i % 2 ? "#f7ab4b" : "#ffdc8a"} transparent opacity={.74} /><group scale={[1, 1, 1]} /></mesh>)}
    </group>
    <FlameShape group={flame} />
    <pointLight ref={light} color="#ffad5b" distance={13} decay={2} position={[0, 1.2, 0]} />
    <points ref={sparks} position={[0, .8, 0]}><bufferGeometry><bufferAttribute attach="attributes-position" args={[sparkPositions, 3]} /></bufferGeometry><pointsMaterial color="#ffd69b" size={.025} transparent opacity={.8} depthWrite={false} /></points>
  </group>;
}
function FlameShape({ group }: { group: React.RefObject<THREE.Group | null> }) {
  useEffect(() => { group.current?.children.forEach((mesh, i) => mesh.scale.set(.12 + (i % 2) * .07, .3 + (i % 3) * .12, .13)); }, [group]); return null;
}
function Camper({ motion, self, waving, reduced, marshmallow }: { motion: Motion; self?: boolean; waving: boolean; reduced: boolean; marshmallow?: number }) {
  const body = useRef<THREE.Group>(null), arm = useRef<THREE.Group>(null), legs = useRef<THREE.Group>(null);
  useFrame(({ clock }, dt) => {
    const g = body.current; if (!g) return;
    g.position.lerp(new THREE.Vector3(motion.x, motion.pose === "sitting" ? .6 : 0, motion.z), Math.min(1, dt * 12));
    const target = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), motion.yaw + Math.PI); g.quaternion.slerp(target, Math.min(1, dt * 12));
    if (arm.current) arm.current.rotation.z = waving ? -.9 + (reduced ? 0 : Math.sin(clock.elapsedTime * 10) * .4) : marshmallow !== undefined ? -1.25 : 0;
    if (legs.current) legs.current.children.forEach((l, i) => { l.rotation.x = motion.pose === "sitting" ? -Math.PI / 2 : motion.pose === "walking" && !reduced ? Math.sin(clock.elapsedTime * 8 + i * Math.PI) * .5 : 0; });
  });
  return <group ref={body} position={[motion.x, 0, motion.z]}>
    <mesh position={[0, 1.34, 0]} castShadow><sphereGeometry args={[.19, 12, 12]} /><meshStandardMaterial color="#d7b398" /></mesh>
    <mesh position={[0, 1.49, 0]}><cylinderGeometry args={[.22, .22, .09, 12]} /><meshStandardMaterial color={self ? "#b29c78" : "#c19162"} /></mesh>
    <mesh position={[0, 1.52, 0]}><sphereGeometry args={[.18, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2]} /><meshStandardMaterial color={self ? "#b29c78" : "#c19162"} /></mesh>
    <mesh position={[0, .93, 0]} castShadow><capsuleGeometry args={[.22, .37, 5, 10]} /><meshStandardMaterial color={self ? "#687b60" : "#ce9b69"} roughness={1} /></mesh>
    <group ref={legs} position={[0, .68, 0]}>{[-.12, .12].map(x => <group key={x} position={[x, 0, 0]}><mesh position={[0, -.31, 0]}><capsuleGeometry args={[.085, .46, 4, 8]} /><meshStandardMaterial color="#404e47" /></mesh><mesh position={[0, -.6, .07]}><boxGeometry args={[.17, .12, .3]} /><meshStandardMaterial color="#4e473b" /></mesh></group>)}</group>
    <group ref={arm} position={[.25, 1.1, 0]}><mesh position={[.07, -.24, 0]}><capsuleGeometry args={[.075, .36, 4, 8]} /><meshStandardMaterial color={self ? "#687b60" : "#ce9b69"} /></mesh><mesh position={[.07, -.48, 0]}><sphereGeometry args={[.08, 8, 8]} /><meshStandardMaterial color="#d7b398" /></mesh></group>
    <mesh position={[-.32, .86, 0]} rotation={[0, 0, -.1]}><capsuleGeometry args={[.075, .36, 4, 8]} /><meshStandardMaterial color={self ? "#687b60" : "#ce9b69"} /></mesh>
    {marshmallow !== undefined && <group position={[.65, 1.1, 0]}><mesh position={[0, .15, 0]}><cylinderGeometry args={[.012, .012, .55, 5]} /><meshStandardMaterial color="#8d7350" /></mesh><mesh position={[0, .43, 0]}><boxGeometry args={[.15, .18, .15]} /><meshStandardMaterial color={marshmallow === 0 ? "#55412e" : marshmallow === 2 ? "#deb575" : "#eee7cc"} /></mesh></group>}
  </group>;
}
function Precipitation({ weather, mobile, reduced, motion }: Pick<Props, "weather" | "mobile" | "reduced" | "motion">) {
  const points = useRef<THREE.Points>(null);
  const streaks = useRef<THREE.LineSegments>(null);
  const count = reduced ? 40 : mobile ? 260 : 650;
  const positions = useMemo(() => { const r = random(72); return new Float32Array(Array.from({ length: count * 3 }, (_, i) => i % 3 === 1 ? r() * 16 : (r() - .5) * 36)); }, [count]);
  const rainLines = useMemo(() => {
    const values = new Float32Array(count * 6);
    for (let i = 0; i < count; i++) { const x = positions[i * 3], y = positions[i * 3 + 1], z = positions[i * 3 + 2]; values.set([x, y, z, x + .04, y + .35, z], i * 6); }
    return values;
  }, [count, positions]);
  useFrame((_, dt) => {
    if (!points.current || reduced) return;
    const attr = points.current.geometry.attributes.position as THREE.BufferAttribute;
    const lines = streaks.current?.geometry.attributes.position as THREE.BufferAttribute | undefined;
    for (let i = 0; i < count; i++) {
      let y = attr.getY(i) - dt * (weather.kind === "snow" || weather.kind === "sleet" && i % 2 === 0 ? 1 : 10);
      if (y < -.1) y = 16;
      const x = attr.getX(i), z = attr.getZ(i);
      if (x > -7.6 && x < -3.4 && z > -2.4 && z < 2 && y < 2.8) y = 16; // canopy occlusion
      attr.setY(i, y);
      lines?.setXYZ(i * 2, x, y, z); lines?.setXYZ(i * 2 + 1, x + .04, y + .35, z);
    }
    attr.needsUpdate = true;
    if (lines) lines.needsUpdate = true;
  });
  const wet = ["rain", "sleet", "snow"].includes(weather.kind);
  return <group><points ref={points} visible={weather.kind === "snow" || weather.kind === "sleet"}>
    <bufferGeometry><bufferAttribute attach="attributes-position" args={[positions, 3]} /></bufferGeometry>
    <pointsMaterial color={weather.kind === "rain" ? "#a5c2ce" : "#edf1e9"} size={weather.kind === "snow" ? .09 : weather.kind === "sleet" ? .055 : .025} transparent opacity={.65} depthWrite={false} />
  </points><lineSegments ref={streaks} visible={weather.kind === "rain" || weather.kind === "sleet"}><bufferGeometry><bufferAttribute attach="attributes-position" args={[rainLines, 3]} /></bufferGeometry><lineBasicMaterial color="#c4d9dd" transparent opacity={.4} depthWrite={false} /></lineSegments></group>;
}
function Rig(props: Props) {
  const { camera, scene, gl } = useThree();
  const sun = useRef<THREE.DirectionalLight>(null), ambient = useRef<THREE.HemisphereLight>(null);
  const look = useRef(new THREE.Vector3()), first = useRef(true);
  const frames = useRef({ at: 0, count: 0 });
  const { light, direction, altitude } = daylight(props.now);
  useEffect(() => {
    const loss = (e: Event) => { e.preventDefault(); props.onFailure(); };
    gl.domElement.addEventListener("webglcontextlost", loss);
    props.onReady();
    return () => gl.domElement.removeEventListener("webglcontextlost", loss);
  }, [gl, props.onReady, props.onFailure]);
  useFrame(({ clock }, dt) => {
    frames.current.count++;
    if (clock.elapsedTime - frames.current.at > 1) {
      gl.domElement.dataset.fps = (frames.current.count / (clock.elapsedTime - frames.current.at)).toFixed(1);
      frames.current = { at: clock.elapsedTime, count: 0 };
    }
    const m = props.motion.current, seated = m.pose === "sitting", sin = Math.sin(m.yaw), cos = Math.cos(m.yaw);
    const target = new THREE.Vector3(m.x + (seated ? 0 : sin * 4.2), seated ? 1.55 : 3.4, m.z + (seated ? 0 : cos * 4.2));
    const aim = new THREE.Vector3(m.x - sin * 8, seated ? 1.5 : 1, m.z - cos * 8);
    if (seated && m.zone === "fire") {
      if (m.x > 1) { target.set(1.5, 1.65, 3); aim.set(-.4, .9, -3.5); }
      else { target.set(props.mobile ? -.1 : -.4, props.mobile ? 1.85 : 1.65, props.mobile ? 6.2 : 6.6); aim.set(props.mobile ? .35 : -.1, .8, -2.5); }
    }
    if (seated && m.zone === "deck") { target.y = 1.8; aim.set(-4, 2, -20); }
    const t = first.current || props.reduced ? 1 : 1 - Math.exp(-dt * 5);
    camera.position.lerp(target, t); look.current.lerp(aim, t); camera.lookAt(look.current); first.current = false;
    const wet = props.weather.kind !== "clear";
    const sky = new THREE.Color("#142c3b").lerp(new THREE.Color(wet ? "#8caaa3" : "#a5c8c0"), light);
    if (altitude > -8 && altitude < 7) sky.lerp(new THREE.Color("#b9a08c"), .25);
    const bg = scene.background as THREE.Color; bg.lerp(sky, 1 - Math.exp(-dt));
    if (scene.fog instanceof THREE.Fog) { scene.fog.color.copy(bg); scene.fog.near = altitude > -8 && altitude < 7 ? 12 : 24; }
    if (sun.current) { sun.current.position.set(direction[0], Math.max(4, direction[1]), direction[2]); sun.current.intensity = THREE.MathUtils.lerp(sun.current.intensity, .25 + light * (wet ? 1.5 : 2.5), dt); }
    if (ambient.current) ambient.current.intensity = .8 + light * 1.1;
  });
  const peer = props.friend;
  const friendWaving = props.events.some(e => e.kind === "wave" && e.userId === peer?.userId && props.now - e.createdAt < 3500);
  const shownMarshmallow = props.events.findLast(e => e.kind === "marshmallow" && e.userId === peer?.userId && props.now - e.createdAt < 6000)?.value;
  return <>
    <color attach="background" args={["#6e938b"]} /><fog attach="fog" args={["#6e938b", 20, 78]} />
    <hemisphereLight ref={ambient} args={["#d4e1da", "#4b513d", 1.4]} />
    <directionalLight ref={sun} color={altitude < 10 && altitude > -8 ? "#ffcf94" : "#f5eed7"} castShadow={!props.mobile} shadow-mapSize={[1024, 1024]} shadow-camera-left={-15} shadow-camera-right={15} shadow-camera-top={15} shadow-camera-bottom={-15} shadow-bias={-.002} />
    <Forest snow={props.weather.kind === "snow"} /><Ground weather={props.weather} /><Stream events={props.events} reduced={props.reduced} />
    <CampObjects snow={props.weather.kind === "snow"} firstPersonZone={props.motion.current.pose === "sitting" ? props.motion.current.zone : null} seat={props.motion.current.x > 1 ? 1 : 0} /><Campfire fire={props.fire} now={props.now} reduced={props.reduced} />
    {props.motion.current.pose !== "sitting" && <Camper motion={props.motion.current} self waving={props.waving} reduced={props.reduced} />}
    {peer && <Camper motion={peer} waving={friendWaving} reduced={props.reduced} marshmallow={shownMarshmallow} />}
    <Precipitation {...props} />
  </>;
}
export default function CampScene(props: Props) {
  useEffect(() => {
    // Re-measure after the dynamic canvas and its absolute container commit.
    const timer = setTimeout(() => window.dispatchEvent(new Event("resize")), 100);
    return () => clearTimeout(timer);
  }, []);
  return <Canvas shadows={!props.mobile} dpr={props.mobile ? [1, 1.25] : [1, 1.5]} camera={{ fov: props.mobile ? 65 : 57, near: .1, far: 160, position: [0, 2, 7] }} gl={{ antialias: !props.mobile, alpha: false, preserveDrawingBuffer: true, powerPreference: "high-performance" }} onCreated={({ gl }) => { gl.toneMapping = THREE.ACESFilmicToneMapping; gl.toneMappingExposure = 1.1; }} fallback={<span>스틸 풍경으로 전환하고 있어요.</span>}>
    <Rig {...props} />
  </Canvas>;
}
