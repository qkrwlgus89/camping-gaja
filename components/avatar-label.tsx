'use client';
import {useEffect, useMemo, useRef} from 'react';
import {useFrame, useThree} from '@react-three/fiber';
import * as THREE from 'three';

// Layout uses CSS pixels; the texture is drawn at 3x for crisp text on small bubbles.
export function speechCanvas(message: string) {
  const canvas = document.createElement('canvas'), ctx = canvas.getContext('2d')!;
  const font = '500 12px -apple-system, BlinkMacSystemFont, "Apple SD Gothic Neo", sans-serif';
  ctx.font = font;
  const maxTextWidth = 172, lineHeight = 17, paddingX = 11, paddingY = 7, tail = 5;
  const lines: string[] = [];
  let line = '', truncated = false;
  const graphemes = new Intl.Segmenter('ko', {granularity: 'grapheme'}).segment(message.trim());
  for (const {segment} of graphemes) {
    if (line && (segment === '\n' || ctx.measureText(line + segment).width > maxTextWidth)) {
      lines.push(line.trim());line = '';
      if (lines.length === 3) {truncated = true;break;}
    }
    if (segment !== '\n') line += segment;
  }
  if (lines.length < 3 && line) lines.push(line.trim());
  if (!lines.length) lines.push('');
  if (truncated) {
    const chars = Array.from(lines[2]);
    while (chars.length && ctx.measureText(chars.join('') + '…').width > maxTextWidth) chars.pop();
    lines[2] = chars.join('') + '…';
  }
  const width = Math.ceil(Math.max(38, ...lines.map(text => ctx.measureText(text).width + paddingX * 2)));
  const bodyHeight = paddingY * 2 + lines.length * lineHeight, height = bodyHeight + tail + 4;
  canvas.width = (width + 4) * 3;canvas.height = height * 3;
  ctx.scale(3, 3);ctx.translate(2, 1);ctx.font = font;
  // One continuous outline avoids a seam between the rounded body and its small tail.
  const r = Math.min(10, bodyHeight / 2), cx = width / 2;
  ctx.beginPath();ctx.moveTo(r, 0);ctx.lineTo(width - r, 0);
  ctx.quadraticCurveTo(width, 0, width, r);ctx.lineTo(width, bodyHeight - r);
  ctx.quadraticCurveTo(width, bodyHeight, width - r, bodyHeight);
  ctx.lineTo(cx + 5, bodyHeight);ctx.quadraticCurveTo(cx + 2, bodyHeight + 2, cx, bodyHeight + tail);
  ctx.quadraticCurveTo(cx - 2, bodyHeight + 2, cx - 5, bodyHeight);ctx.lineTo(r, bodyHeight);
  ctx.quadraticCurveTo(0, bodyHeight, 0, bodyHeight - r);ctx.lineTo(0, r);ctx.quadraticCurveTo(0, 0, r, 0);ctx.closePath();
  ctx.fillStyle = '#f3f0e5';ctx.fill();ctx.strokeStyle = '#b4b9a955';ctx.lineWidth = .7;ctx.stroke();
  ctx.fillStyle = '#344542';ctx.textAlign = 'center';ctx.textBaseline = 'middle';
  lines.forEach((text, i) => ctx.fillText(text, cx, paddingY + lineHeight * (i + .5)));
  return {canvas, width: width + 4, height, lines};
}

export function AvatarLabel({name, message, at, now, head}: {
  name: string;message?: string;at?: number;now: number;head: React.RefObject<THREE.Vector3>;
}) {
  const {camera, size} = useThree(), nick = useRef<THREE.Sprite>(null), bubble = useRef<THREE.Sprite>(null);
  const scratch = useMemo(() => ({up: new THREE.Vector3(), view: new THREE.Vector3()}), []);
  const timing = useRef({now, perf: performance.now()});
  if (timing.current.now !== now) timing.current = {now, perf: performance.now()};
  const nickname = useMemo(() => {
    const canvas = document.createElement('canvas');canvas.width = 440;canvas.height = 64;
    const ctx = canvas.getContext('2d')!;ctx.font = '600 30px sans-serif';ctx.textAlign = 'center';ctx.textBaseline = 'middle';
    ctx.lineWidth = 3;ctx.strokeStyle = '#07131bbf';ctx.fillStyle = '#e5eae4';ctx.shadowColor = '#07131b';ctx.shadowBlur = 4;
    ctx.strokeText(name, 220, 32, 416);ctx.fillText(name, 220, 32, 416);
    return new THREE.CanvasTexture(canvas);
  }, [name]);
  const speech = useMemo(() => {const layout = speechCanvas(message ?? '');return {...layout, texture: new THREE.CanvasTexture(layout.canvas)};}, [message]);
  useEffect(() => () => nickname.dispose(), [nickname]);
  useEffect(() => () => speech.texture.dispose(), [speech]);
  useFrame(() => {
    const distance = head.current.distanceTo(camera.position);
    const depth = -scratch.view.copy(head.current).applyMatrix4(camera.matrixWorldInverse).z;
    const unit = 2 * Math.tan(THREE.MathUtils.degToRad((camera as THREE.PerspectiveCamera).fov / 2)) / size.height;
    scratch.up.set(0, 1, 0).applyQuaternion(camera.quaternion);
    if (nick.current) {
      nick.current.visible = Boolean(name) && distance < 24 && depth > 0;
      nick.current.position.copy(head.current).addScaledVector(scratch.up, unit * depth * 12);
      nick.current.scale.set(unit * 145, unit * 21, 1);
    }
    if (bubble.current) {
      const age = timing.current.now + performance.now() - timing.current.perf - (at ?? now);
      bubble.current.visible = Boolean(message) && age < 8000 && distance < 17 && depth > 0;
      (bubble.current.material as THREE.SpriteMaterial).opacity = Math.max(0, Math.min(1, age / 150, (8000 - age) / 450));
      bubble.current.position.copy(head.current).addScaledVector(scratch.up, unit * depth * (name ? 29 : 9));
      bubble.current.scale.set(unit * speech.width, unit * speech.height, 1);
    }
  });
  return <>
    <sprite ref={nick}><spriteMaterial map={nickname} sizeAttenuation={false} transparent depthWrite={false} toneMapped={false}/></sprite>
    <sprite ref={bubble} center={new THREE.Vector2(.5, 0)}><spriteMaterial map={speech.texture} sizeAttenuation={false} transparent depthWrite={false} toneMapped={false}/></sprite>
  </>;
}
