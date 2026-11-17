"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { Download, ImagePlus, RotateCw, Share2, Sparkles } from "lucide-react";
import { Sheet } from "./sheet";
import { composePostcard } from "@/lib/postcard";
import type { Weather, Zone } from "@/lib/types";
export function Marshmallow({ onClose, onShow, fireLit }: { onClose: () => void; onShow: (value: number) => void; fireLit: boolean }) {
  const [heat, setHeat] = useState([0, 0]), [side, setSide] = useState(0), [done, setDone] = useState(false), [shown, setShown] = useState(false);
  const sideRef = useRef(side), drag = useRef<number | null>(null); sideRef.current = side;
  useEffect(() => {
    if (done || !fireLit) return;
    const timer = setInterval(() => setHeat(old => old.map((v, i) => i === sideRef.current ? Math.min(100, v + 1) : v)), 200);
    return () => clearInterval(timer);
  }, [done, fireLit]);
  const burnt = heat.some(v => v >= 85), golden = heat.every(v => v >= 35 && v < 85);
  const label = burnt ? "조금 탔지만, 이것도 캠핑이죠." : golden ? "겉은 노릇, 속은 말랑. 잘 구웠어요!" : "아직 말랑말랑한 마시멜로예요.";
  const color = (v: number) => v > 84 ? "#533c2d" : `hsl(${44 - v * .13} ${25 + v * .35}% ${94 - v * .53}%)`;
  return <Sheet title="불 앞에서, 노릇노릇" eyebrow="CAMP ACTIVITY 01" onClose={onClose}>
    <p className="sheet-copy">천천히 돌려주세요. 한쪽을 너무 오래 두면 타버려요.</p>
    <div className="mallow-stage" onPointerDown={e => { drag.current = e.clientX; e.currentTarget.setPointerCapture(e.pointerId); }} onPointerMove={e => { if (drag.current !== null && Math.abs(e.clientX - drag.current) > 35 && !done) { setSide(s => 1 - s); drag.current = e.clientX; } }} onPointerUp={() => { drag.current = null; }} onPointerCancel={() => { drag.current = null; }}>
      <span className="mallow-glow" /><span className="stick" /><span className="mallow" style={{ background: `linear-gradient(90deg, ${color(heat[side])}, ${color(heat[1 - side])})`, transform: `rotate(${side ? -8 : 8}deg)` }} /><span className="mallow-embers">✦ · ✧</span>
    </div>
    <div className="heat-row">{heat.map((v, i) => <div key={i}><span>{i ? "뒷면" : "앞면"} · {v >= 85 ? "탔어요" : v >= 35 ? "노릇해요" : "굽는 중"}</span><progress max={100} value={v} aria-label={`${i ? "뒷면" : "앞면"} 굽기`} /></div>)}</div>
    {!fireLit && <p className="notice">불이 꺼져 굽기를 멈췄어요. 다시 불을 피우면 이어집니다.</p>}
    {done ? <><p className="result" role="status">{label}</p><div className="button-row"><button className="secondary" onClick={() => { setHeat([0, 0]); setDone(false); setShown(false); }}>다시 굽기</button><button className="primary" disabled={shown} onClick={() => { onShow(burnt ? 0 : golden ? 2 : 1); setShown(true); }}>{shown ? "들어 보였어요" : "친구에게 보여주기"}</button></div></> : <div className="button-row"><button className="secondary" onClick={() => setSide(s => 1 - s)}><RotateCw size={17} /> 꼬치 돌리기</button><button className="primary" onClick={() => setDone(true)}>꺼내기</button></div>}
  </Sheet>;
}
export function StoneSkipping({ onClose, onThrow }: { onClose: () => void; onThrow: (value: number) => void }) {
  const [power, setPower] = useState(0), [holding, setHolding] = useState(false), [result, setResult] = useState<number | null>(null), [stone, setStone] = useState(0);
  const started = useRef(0), currentPower = useRef(0), locked = useRef(false), thrown = useRef(false), releaseTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => { if (!holding) return; let frame = 0; const tick = () => { const p = (Math.sin((performance.now() - started.current) / 500 - Math.PI / 2) + 1) / 2; currentPower.current = p; setPower(p); frame = requestAnimationFrame(tick); }; frame = requestAnimationFrame(tick); return () => cancelAnimationFrame(frame); }, [holding]);
  useEffect(() => () => { if (releaseTimer.current) clearTimeout(releaseTimer.current); }, []);
  function start() { if (locked.current) return; locked.current = true; thrown.current = false; started.current = performance.now(); currentPower.current = 0; setResult(null); setHolding(true); }
  function release() {
    if (!locked.current || !holding || thrown.current) return;
    thrown.current = true;
    setHolding(false);
    const d = Math.abs(currentPower.current - (.68 + stone * .02));
    const n = d < .08 ? 5 : d < .17 ? 3 : d < .28 ? 1 : 0;
    setResult(n); onThrow(n); releaseTimer.current = setTimeout(() => { locked.current = false; }, 1400);
  }
  return <Sheet title="마음을 가볍게, 퐁당" eyebrow="CAMP ACTIVITY 02" onClose={onClose}>
    <p className="sheet-copy">매끈한 돌을 골라 꾹 누르세요. 초록 구간에서 손을 떼면 멀리 튀어요.</p>
    <div className="stone-picker">{[0, 1, 2].map(i => <button key={i} className={`stone-choice ${stone === i ? "selected" : ""}`} disabled={holding} onClick={() => setStone(i)} aria-label={`${i + 1}번 매끈한 돌`} aria-pressed={stone === i}><span style={{ transform: `rotate(${i * 25 - 10}deg)`, borderRadius: `${45 + i * 8}% ${60 - i * 6}%` }} /></button>)}</div>
    <div className="power-track" aria-label="던질 타이밍"><span className="sweet-spot" style={{ left: `${60 + stone * 2}%` }} /><span className="power-dot" style={{ left: `${power * 95}%` }} /></div>
    <p className="result" role="status">{result === null ? holding ? "지금… 조금만 더…" : "물결에 집중해 보세요." : result ? `${result}번 통, 통! 물 위를 걸었어요.` : "퐁당! 계곡이 돌을 받아줬어요."}</p>
    <button className="primary full throw-button" onPointerDown={e => { e.currentTarget.setPointerCapture(e.pointerId); start(); }} onPointerUp={release} onPointerCancel={() => { setHolding(false); locked.current = false; }} onKeyDown={e => { if ((e.key === " " || e.key === "Enter") && !e.repeat) { e.preventDefault(); start(); } }} onKeyUp={e => { if (e.key === " " || e.key === "Enter") { e.preventDefault(); release(); } }}>{holding ? "손을 떼서 던지기" : "꾹 눌러 돌 던지기"}</button>
    <p className="fine-print">키보드: Space 또는 Enter를 누르다가 놓으세요.</p>
  </Sheet>;
}
export function Postcard({ onClose, scene, now, weather, zone, friend, fireLit }: { onClose: () => void; scene: string; now: number; weather: Weather; zone: Zone; friend: boolean; fireLit: boolean }) {
  const [photo, setPhoto] = useState<File | null>(null), [caption, setCaption] = useState("지금, 숲에 앉아요."), [preview, setPreview] = useState(""), [blob, setBlob] = useState<Blob | null>(null), [error, setError] = useState(""), [busy, setBusy] = useState(false);
  const input = useRef<HTMLInputElement>(null), moment = useRef(now), version = useRef(0);
  useEffect(() => {
    let cancelled = false, url = ""; const n = ++version.current;
    setBusy(true); setError("");
    composePostcard({ scene, photo, caption, now: moment.current, weather, zone, friend, fireLit }).then(b => { if (!cancelled && n === version.current) { url = URL.createObjectURL(b); setPreview(url); setBlob(b); setBusy(false); } }).catch(() => { if (!cancelled) { setError("사진을 읽지 못했어요. 다른 JPG·PNG·WebP 사진을 골라 주세요."); setBusy(false); } });
    return () => { cancelled = true; if (url) URL.revokeObjectURL(url); };
  }, [scene, photo, caption, weather, zone, friend, fireLit]);
  function save() { if (!preview || busy) return; const a = document.createElement("a"); a.href = preview; a.download = `캠핑가자-${new Date(moment.current).toISOString().slice(0, 10)}.png`; a.click(); }
  async function share() {
    if (!blob || busy) return;
    const file = new File([blob], "캠핑가자.png", { type: "image/png" });
    if (navigator.canShare?.({ files: [file] })) { try { await navigator.share({ files: [file], title: "우리 캠프 엽서" }); } catch { /* The native share sheet may be dismissed. */ } } else save();
  }
  return <Sheet title="오늘의 숲, 한 장의 기억" eyebrow="CAMP ACTIVITY 03" onClose={onClose} wide>
    <div className="postcard-preview">{preview ? <img src={preview} alt="날짜와 KST, 인제 날씨가 담긴 캠프 엽서" /> : <span>숲을 담는 중이에요…</span>}</div>
    <label className="field-label">엽서에 남길 말<input maxLength={60} value={caption} onChange={e => setCaption(e.target.value)} /></label>
    <input ref={input} className="visually-hidden" type="file" accept="image/jpeg,image/png,image/webp" onChange={e => { const file = e.target.files?.[0]; if (!file) return; if (file.size > 15 * 1024 * 1024) { setError("15MB 이하 사진을 골라 주세요."); return; } setPhoto(file); }} />
    <div className="button-row"><button className="secondary" onClick={() => input.current?.click()}><ImagePlus size={17} /> {photo ? "사진 바꾸기" : "내 사진 붙이기"}</button>{photo && <button className="text-btn" onClick={() => setPhoto(null)}>사진 빼기</button>}</div>
    <p className="fine-print">사진은 이 브라우저 안에서만 합성해요. 서버에 올리지 않아요.</p>
    {error && <p className="notice" role="alert">{error}</p>}
    <div className="button-row"><button className="primary" disabled={busy || !blob} onClick={save}><Download size={17} /> PNG 저장</button><button className="secondary" disabled={busy || !blob} onClick={share}><Share2 size={17} /> 공유</button></div>
  </Sheet>;
}
