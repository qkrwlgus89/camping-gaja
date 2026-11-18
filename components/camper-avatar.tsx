'use client';
import {useEffect, useMemo, useRef} from 'react';
import {useFrame, useLoader} from '@react-three/fiber';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {RoundedBoxGeometry} from 'three/addons/geometries/RoundedBoxGeometry.js';
import {clone} from 'three/addons/utils/SkeletonUtils.js';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import * as T from 'three';
import {appearanceFor, AVATAR_HEIGHT, AVATAR_HAND_SPAN, type AvatarAppearance} from '@/lib/appearance';
import type {Motion} from '@/lib/types';

export {AVATAR_HAND_SPAN};
export type AvatarAnchor = {
  x: number; y: number; z: number; yaw: number;
  kind: 'chair' | 'hammock' | 'circle' | 'bbq';
};
export type AvatarHands = {left: [number, number, number]; right: [number, number, number]};
type Props = {
  motion: Motion; self?: boolean; lying?: boolean; wave?: boolean; seed?: string;
  anchor?: AvatarAnchor; hands?: AvatarHands; eating?: boolean; headPosition?: React.RefObject<T.Vector3>;
};
// All authored pieces use the same local units as the retained Kenney animation skeleton.
const SCALE = AVATAR_HEIGHT / .665;
const UPPER_LEG = .082, LOWER_LEG = .067, UPPER_ARM = .12, LOWER_ARM = .115;
const DOWN = new T.Vector3(0, -1, 0), UP = new T.Vector3(0, 1, 0);

type Arm = {upper: T.Group; elbow: T.Group; wrist: T.Group; upperBone: T.Object3D};
function createCamper(source: T.Group, appearance: AvatarAppearance) {
  const scene = clone(source), geometries: T.BufferGeometry[] = [], materials: T.Material[] = [];
  scene.traverse(node => {if (node instanceof T.Mesh) node.visible = false;});
  const material = (color: string, roughness = .86) => {
    const m = new T.MeshStandardMaterial({color, roughness, metalness: 0});
    m.emissive.copy(m.color).multiplyScalar(.018); materials.push(m); return m;
  };
  const skin = material(appearance.skin), hair = material(appearance.hair), coat = material(appearance.jacket);
  const accent = material(appearance.accent), trousers = material(appearance.trousers), boots = material(appearance.shoes);
  const cream = material('#e4ddca'), dark = material('#292e32'), white = material('#fffaf1', .45);
  const iris = material('#312b29', .44), mouth = material('#9c6356'), cheek = material('#dca08e');
  const mesh = (parent: T.Object3D, g: T.BufferGeometry, m: T.Material, position: [number, number, number] = [0, 0, 0]) => {
    geometries.push(g); const node = new T.Mesh(g, m); node.position.set(...position);
    node.userData.campAvatarAuthored = true;node.castShadow = true; node.receiveShadow = false; node.frustumCulled = false; parent.add(node); return node;
  };
  const rounded = (parent: T.Object3D, size: [number, number, number], pos: [number, number, number], m: T.Material, radius = .015) =>
    mesh(parent, new RoundedBoxGeometry(...size, 3, radius), m, pos);
  const oval = (parent: T.Object3D, pos: [number, number, number], size: [number, number, number], m: T.Material, segments = 16) => {
    const node = mesh(parent, new T.SphereGeometry(1, segments, Math.max(10, segments / 2)), m, pos);node.scale.set(...size);return node;
  };
  const tube = (parent: T.Object3D, points: [number, number, number][], radius: number, m: T.Material) =>
    mesh(parent, new T.TubeGeometry(new T.CatmullRomCurve3(points.map(p => new T.Vector3(...p))), 12, radius, 6, false), m);
  const torso = scene.getObjectByName('torso')!, head = scene.getObjectByName('head')!;
  rounded(torso, [.174, .18, .119], [0, .064, .002], coat, .033);
  rounded(torso, [.164, .048, .119], [0, -.01, .001], trousers, .018);
  rounded(torso, [.158, .013, .12], [0, -.008, .002], accent, .005);
  rounded(torso, [.006, .155, .009], [0, .067, .064], accent, .002);
  for (const x of [-.048, .048]) {
    rounded(torso, [.042, .035, .008], [x, .016, .064], coat, .008);
    rounded(torso, [.04, .005, .009], [x, .035, .067], accent, .002);
  }
  // A soft hood and short collar replace the square elderly silhouette.
  oval(torso, [0, .135, -.038], [.075, .035, .045], coat);
  oval(torso, [0, .163, .004], [.027, .032, .027], skin);
  // A smooth oval silhouette, including the cheeks and chin.
  oval(head, [0, .143, 0], [.133, .14, .119], skin, 32);
  for (const side of [-1, 1]) {
    oval(head, [side * .129, .135, -.002], [.018, .026, .018], skin);
    oval(head, [side * .052, .148, .112], [.023, .029, .012], white);
    oval(head, [side * .052, .145, .123], [.012, .021, .008], iris);
    oval(head, [side * .052 - .004, .153, .13], [.004, .005, .003], white, 12);
    oval(head, [side * .075, .105, .101], [.024, .01, .003], cheek, 14);
    tube(head, [[side * .077, .19, .108], [side * .052, .194, .116], [side * .03, .189, .112]], .003, hair);
  }
  oval(head, [0, .121, .119], [.007, .009, .011], skin, 14);
  tube(head, [[-.017, .08, .115], [0, .075, .12], [.017, .08, .115]], .0025, mouth);
  const cap = mesh(head, new T.SphereGeometry(.138, 28, 16, 0, Math.PI * 2, 0, Math.PI * .57), hair, [0, .235, -.008]);
  cap.scale.set(1, .62, .9);
  const lock = (pos: [number, number, number], size: [number, number, number], tilt = 0) => {
    const node = oval(head, pos, size, hair);node.rotation.z = tilt;return node;
  };
  const fringe = (direction = 1) => {
    for (let i = 0; i < 4; i++) lock([-.078 + i * .046, .236 - i * .007 * direction, .077], [.041, .042, .045], -.35 * direction);
  };
  switch (appearance.hairStyle) {
    case 'crop':
      for (let i = 0; i < 5; i++) lock([-.085 + i * .042, .259, .051], [.033, .035, .052], -.25);
      break;
    case 'part': fringe(1);lock([.09, .231, .014], [.046, .063, .071], -.25);break;
    case 'waves':
      fringe(-1);
      for (const side of [-1, 1]) tube(head, [[side * .105, .256, .025], [side * .127, .215, .044], [side * .118, .172, .015]], .025, hair);
      break;
    case 'bob':
      rounded(head, [.272, .18, .15], [0, .163, -.06], hair, .06);
      for (const side of [-1, 1]) lock([side * .122, .16, .014], [.034, .096, .064], side * .08);
      fringe(1);break;
    case 'curly':
      for (let i = 0; i < 23; i++) {const a = i * 2.4, r = .07 + .055 * Math.sin(i * 1.2) ** 2;lock([Math.cos(a) * r, .246 + .035 * Math.cos(i), -.014 + Math.sin(a) * r * .82], [.036, .034, .033]);}
      break;
    case 'pony':
      fringe(-1);lock([0, .212, -.145], [.044, .071, .041], .1);lock([.012, .147, -.16], [.046, .076, .044], -.15);
      break;
    case 'half-up':
      fringe(1);for (const side of [-1, 1]) lock([side * .12, .179, -.015], [.035, .071, .068]);
      lock([0, .276, -.085], [.047, .027, .037]);break;
    case 'bun':
      fringe(-1);lock([0, .302, -.046], [.053, .031, .043]);break;
  }
  const knees: T.Group[] = [];
  for (const side of ['left', 'right']) {
    const bone = scene.getObjectByName(`leg-${side}`)!;
    rounded(bone, [.059, UPPER_LEG + .018, .065], [0, -UPPER_LEG / 2, 0], trousers, .018);
    const knee = new T.Group();knee.position.y = -UPPER_LEG;bone.add(knee);knees.push(knee);
    rounded(knee, [.05, LOWER_LEG + .008, .057], [0, -LOWER_LEG / 2, 0], trousers, .014);
    rounded(knee, [.053, .017, .06], [0, -LOWER_LEG + .007, .001], accent, .006);
    rounded(knee, [.069, .035, .094], [0, -LOWER_LEG - .008, .018], boots, .012);
    rounded(knee, [.072, .008, .097], [0, -LOWER_LEG - .024, .018], cream, .003);
  }
  const arms: Arm[] = [];
  for (const side of ['left', 'right']) {
    const upperBone = scene.getObjectByName(`arm-${side}`)!;
    upperBone.position.y += .06;
    const upper = new T.Group();upper.name = `avatar-upper-arm-${side}`;upperBone.add(upper);
    rounded(upper, [.054, UPPER_ARM + .017, .057], [0, -UPPER_ARM / 2, 0], coat, .019);
    const elbow = new T.Group();elbow.name = `avatar-elbow-${side}`;elbow.position.y = -UPPER_ARM;upper.add(elbow);
    rounded(elbow, [.048, LOWER_ARM, .052], [0, -LOWER_ARM / 2, 0], coat, .017);
    rounded(elbow, [.05, .016, .054], [0, -LOWER_ARM + .008, 0], accent, .005);
    const wrist = new T.Group();wrist.name = `avatar-wrist-${side}`;wrist.position.y = -LOWER_ARM - .015;elbow.add(wrist);
    oval(wrist, [0, -.005, .002], [.024, .029, .022], skin, 16);
    arms.push({upper, elbow, wrist, upperBone});
  }
  const seatContact = new T.Object3D();seatContact.name = 'avatar-seat-contact';seatContact.position.set(0, -.034, 0);torso.add(seatContact);
  const backContact = new T.Object3D();backContact.name = 'avatar-back-contact';backContact.position.set(0, .15, -.064);torso.add(backContact);
  const headTop = new T.Object3D();headTop.name = 'avatar-head-top';headTop.position.set(0, .329, 0);head.add(headTop);
  // Bake each limb's small colored pieces into one draw call. Keep the joints separate for IK.
  const parents = new Set<T.Object3D>();scene.traverse(node => {if (node.userData.campAvatarAuthored && node.parent) parents.add(node.parent);});
  const common = new T.MeshStandardMaterial({color: '#ffffff', vertexColors: true, roughness: .86, metalness: 0, emissive: '#ffffff', emissiveIntensity: .018});
  common.onBeforeCompile = shader => {shader.fragmentShader = shader.fragmentShader.replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n#ifdef USE_COLOR\n totalEmissiveRadiance *= vColor.rgb;\n#endif');};
  const batches: T.BufferGeometry[] = [];
  for (const parent of parents) {
    const parts = parent.children.filter(child => child.userData.campAvatarAuthored) as T.Mesh[];
    const transformed = parts.map(part => {
      part.updateMatrix();const geometry = part.geometry.index ? part.geometry.toNonIndexed() : part.geometry.clone();geometry.applyMatrix4(part.matrix);
      const color = (part.material as T.MeshStandardMaterial).color, values = new Float32Array(geometry.attributes.position.count * 3);
      for (let i = 0; i < values.length; i += 3) {values[i] = color.r;values[i + 1] = color.g;values[i + 2] = color.b;}
      geometry.setAttribute('color', new T.BufferAttribute(values, 3));return geometry;
    });
    const geometry = mergeGeometries(transformed, false)!;batches.push(geometry);
    for (const part of parts) parent.remove(part);transformed.forEach(g => g.dispose());
    const batch = new T.Mesh(geometry, common);batch.castShadow = true;batch.frustumCulled = false;parent.add(batch);
  }
  geometries.forEach(g => g.dispose());geometries.splice(0, geometries.length, ...batches);
  materials.forEach(m => m.dispose());materials.splice(0, materials.length, common);
  return {scene, torso, head, seatContact, backContact, headTop, knees, arms, geometries, materials,
    legs: [scene.getObjectByName('leg-left')!, scene.getObjectByName('leg-right')!]};
}

/** Two-bone arm IK. Hand targets are world coordinates shared by the circle choreography. */
const ikWork = {shoulder: new T.Vector3(), inverse: new T.Quaternion(), target: new T.Vector3(), direction: new T.Vector3(), bend: new T.Vector3(), elbow: new T.Vector3(), upper: new T.Vector3(), lower: new T.Vector3()};
function reach(arm: Arm, targetWorld: T.Vector3, bend: number, scale: number, preferred?: T.Vector3) {
  const shoulder = arm.upperBone.getWorldPosition(ikWork.shoulder);
  arm.upperBone.parent!.getWorldQuaternion(ikWork.inverse).invert();
  const target = ikWork.target.copy(targetWorld).sub(shoulder).applyQuaternion(ikWork.inverse).multiplyScalar(1 / scale);
  const lowerLength = LOWER_ARM + .015;
  const distance = T.MathUtils.clamp(target.length(), .025, UPPER_ARM + lowerLength - .002);
  const direction = ikWork.direction.copy(target).normalize();
  const elbowOut = preferred ? ikWork.bend.copy(preferred) : ikWork.bend.set(0, -.75, bend * .25);
  elbowOut.addScaledVector(direction, -elbowOut.dot(direction)).normalize();
  const along = (UPPER_ARM ** 2 - lowerLength ** 2 + distance ** 2) / (2 * distance);
  const height = Math.sqrt(Math.max(0, UPPER_ARM ** 2 - along ** 2));
  const elbow = ikWork.elbow.copy(direction).multiplyScalar(along).addScaledVector(elbowOut, height);
  const upperDirection = ikWork.upper.copy(elbow).normalize();
  const lowerDirection = ikWork.lower.copy(direction).multiplyScalar(distance).sub(elbow).normalize();
  arm.upperBone.quaternion.setFromUnitVectors(DOWN, upperDirection);
  arm.upper.quaternion.identity();
  arm.elbow.quaternion.setFromUnitVectors(DOWN, lowerDirection.applyQuaternion(ikWork.inverse.copy(arm.upperBone.quaternion).invert()));
}

export function CamperAvatar({motion, self = false, lying = false, wave = false, seed, anchor, hands, eating = false, headPosition}: Props) {
  const source = useLoader(GLTFLoader, '/models/camper-cute.glb');
  const root = useRef<T.Group>(null), previous = useRef(''), elapsed = useRef(0);
  const appearance = useMemo(() => appearanceFor(seed ?? motion.userId ?? 'camper'), [seed, motion.userId]);
  const rig = useMemo(() => {
    const avatar = createCamper(source.scene, appearance), mixer = new T.AnimationMixer(avatar.scene), actions: Record<string, T.AnimationAction> = {};
    for (const original of source.animations) {
      const key = ({idle: 'Idle', walk: 'Walk', sit: 'Sitting'} as Record<string, string>)[original.name];if (!key) continue;
      const clip = original.clone();
      if (key === 'Walk') for (const track of clip.tracks) if (track.name === 'root.position') {
        const values = track.values, y = values[1];for (let i = 0; i < values.length; i += 3) {values[i] = values[0];values[i + 1] = y + (values[i + 1] - y) * .18;values[i + 2] = values[2];}
      }
      actions[key] = mixer.clipAction(clip);
    }
    return {...avatar, mixer, actions};
  }, [source, appearance]);
  const scratch = useMemo(() => ({target: new T.Vector3(), current: new T.Vector3(), world: new T.Vector3(), q: new T.Quaternion(), pitch: new T.Quaternion()}), []);
  useEffect(() => {previous.current = '';return () => {rig.mixer.stopAllAction();rig.geometries.forEach(g => g.dispose());rig.materials.forEach(m => m.dispose());};}, [rig]);
  useFrame((_, dt) => {
    if (!root.current) return;
    elapsed.current += Math.min(dt, .075);
    const pose = motion.pose as string;
    const reclining = lying || pose === 'reclining' || anchor?.kind === 'hammock';
    const seated = !reclining && (pose === 'sitting' || anchor?.kind === 'chair' || anchor?.kind === 'bbq');
    const dancing = pose === 'dancing';
    const state = seated ? 'Sitting' : pose === 'walking' || dancing ? 'Walk' : 'Idle';
    if (state !== previous.current) {
      const action = rig.actions[state];
      action.reset().setEffectiveTimeScale(dancing ? 1.35 : state === 'Walk' ? 1.18 : .8).setEffectiveWeight(1).play();
      if (previous.current) action.crossFadeFrom(rig.actions[previous.current], .24, false);
      previous.current = state;
    }
    rig.mixer.update(Math.min(dt, .075));
    if (dancing) rig.torso.rotation.set(0, 0, 0);
    for (let i = 0; i < rig.knees.length; i++) {
      if (seated) {rig.legs[i].rotation.set(-Math.PI / 2, 0, 0);rig.knees[i].rotation.x = Math.PI / 2;}
      else if (reclining) {rig.legs[i].rotation.set(.045, 0, i ? -.035 : .035);rig.knees[i].rotation.x = .025;}
      else rig.knees[i].rotation.x = pose === 'walking' || dancing ? Math.max(0, Math.sin(elapsed.current * 7 + i * Math.PI)) * .28 : .035;
    }
    for (let i = 0; i < rig.arms.length; i++) {
      const arm = rig.arms[i];arm.upper.quaternion.identity();
      const swing = pose === 'walking' ? Math.sin(elapsed.current * 7 + i * Math.PI) * .22 : 0;
      arm.upperBone.rotation.set(reclining ? -.03 : seated ? -.75 : swing, 0, i ? -.055 : .055);
      arm.elbow.rotation.set(.025, 0, 0);
      if (reclining) arm.upperBone.rotation.set(-.03, 0, i ? -.12 : .12);
      if (wave && i === 1 && !hands) {arm.upperBone.rotation.set(-2.2, 0, -.15 + Math.sin(elapsed.current * 7) * .2);arm.elbow.rotation.x = -.55;}
    }
    const yaw = anchor?.yaw ?? motion.heading ?? motion.yaw;
    scratch.q.setFromAxisAngle(UP, yaw + Math.PI);
    if (reclining) scratch.q.multiply(scratch.pitch.setFromAxisAngle(new T.Vector3(1, 0, 0), -Math.PI / 2));
    root.current.quaternion.slerp(scratch.q, 1 - Math.exp(-dt * 13));
    scratch.target.set(anchor?.x ?? motion.x, anchor?.kind === 'circle' ? (anchor.y ?? -.105) : -.105, anchor?.z ?? motion.z);
    if (self || anchor) root.current.position.copy(scratch.target);else root.current.position.lerp(scratch.target, 1 - Math.exp(-dt * 16));
    root.current.updateWorldMatrix(true, true);
    if (anchor && anchor.kind !== 'circle') {
      const contact = reclining ? rig.backContact : rig.seatContact;
      contact.getWorldPosition(scratch.world);
      scratch.target.set(anchor.x, anchor.y, anchor.z).sub(scratch.world);
      root.current.position.add(scratch.target);
      root.current.updateWorldMatrix(true, true);
    } else if (seated) {
      // Backwards-compatible chairs: the old call site has no resource anchor yet.
      rig.seatContact.getWorldPosition(scratch.world);root.current.position.y += .5475 - scratch.world.y;
      root.current.updateWorldMatrix(true, true);
    } else if (reclining) {
      rig.backContact.getWorldPosition(scratch.world);root.current.position.y += .36 - scratch.world.y;
      root.current.updateWorldMatrix(true, true);
    }
    if (!hands && reclining) {
      for (let i = 0; i < rig.arms.length; i++) {const side = i === 0 ? 1 : -1;scratch.target.set(side * .044, .04, .077);rig.torso.localToWorld(scratch.target);reach(rig.arms[i], scratch.target, 0, SCALE, new T.Vector3(side * .8, -.35, .1));}
      root.current.updateWorldMatrix(true, true);
    }
    if (eating && !hands) {
      rig.headTop.getWorldPosition(scratch.target);scratch.target.y -= .31;
      scratch.world.set(-.09, 0, .21).applyQuaternion(root.current.quaternion);scratch.target.add(scratch.world);
      reach(rig.arms[1], scratch.target, -.2, SCALE);root.current.updateWorldMatrix(true, true);
    }
    if (hands) {
      reach(rig.arms[0], scratch.target.set(...hands.left), .8, SCALE);
      reach(rig.arms[1], scratch.target.set(...hands.right), -.8, SCALE);
      root.current.updateWorldMatrix(true, true);
    }
    if (headPosition) rig.headTop.getWorldPosition(headPosition.current);
  });
  return <group ref={root} name={self ? 'my-avatar' : 'camp-visitor'} position={[motion.x, -.105, motion.z]}><group scale={SCALE}><primitive object={rig.scene}/></group></group>;
}
