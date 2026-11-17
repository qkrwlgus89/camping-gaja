import { kstDate, kstTime, weatherNames } from "./environment";
import type { Weather, Zone } from "./types";
const load = (src: string) => new Promise<HTMLImageElement>((resolve, reject) => { const image = new Image(); image.onload = () => resolve(image); image.onerror = reject; image.src = src; });
export async function composePostcard({ scene, photo, now, weather, caption, zone, friend, fireLit = false }: { scene: string; photo: File | null; now: number; weather: Weather; caption: string; zone: Zone; friend: boolean; fireLit?: boolean }) {
  const canvas = document.createElement("canvas"); canvas.width = 1440; canvas.height = 1080;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#f5f1e7"; ctx.fillRect(0, 0, 1440, 1080);
  const image = await load(scene);
  const ratio = Math.max(1344 / image.width, 790 / image.height), w = image.width * ratio, h = image.height * ratio;
  ctx.save(); ctx.beginPath(); ctx.rect(48, 48, 1344, 790); ctx.clip(); ctx.drawImage(image, 48 + (1344 - w) / 2, 48 + (790 - h) / 2, w, h); ctx.restore();
  if (!scene.startsWith("data:")) {
    ctx.save(); ctx.beginPath(); ctx.rect(48, 48, 1344, 790); ctx.clip();
    if (["rain", "sleet", "snow"].includes(weather.kind)) {
      ctx.strokeStyle = "#d9e6ed99"; ctx.fillStyle = "#f2f5e6cc"; ctx.lineWidth = 2;
      for (let i = 0; i < 150; i++) {
        const x = 48 + (i * 137.3 % 1344), y = 48 + (i * 79.7 % 790);
        if (weather.kind === "snow" || weather.kind === "sleet" && i % 2 === 0) { ctx.beginPath(); ctx.arc(x, y, 2 + i % 3, 0, Math.PI * 2); ctx.fill(); }
        else { ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x - 5, y + 20); ctx.stroke(); }
      }
    }
    if (fireLit && zone === "fire") {
      const glow = ctx.createRadialGradient(770, 675, 8, 770, 675, 105); glow.addColorStop(0, "#ffd38abb"); glow.addColorStop(1, "#e78e3100"); ctx.fillStyle = glow; ctx.fillRect(660, 560, 220, 200);
      ctx.fillStyle = "#efbc6d"; ctx.beginPath(); ctx.moveTo(745, 684); ctx.quadraticCurveTo(720, 655, 756, 608); ctx.quadraticCurveTo(752, 645, 775, 640); ctx.quadraticCurveTo(805, 679, 770, 688); ctx.fill();
    }
    if (friend) {
      ctx.fillStyle = "#ccad80"; ctx.beginPath(); ctx.arc(1040, 568, 23, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = "#a3835d"; ctx.fillRect(1013, 592, 54, 73); ctx.fillStyle = "#344d42"; ctx.fillRect(1016, 664, 19, 55); ctx.fillRect(1046, 664, 19, 55);
    }
    ctx.restore();
  }
  if (photo) {
    const url = URL.createObjectURL(photo);
    try {
      const p = await load(url); ctx.save(); ctx.translate(1110, 660); ctx.rotate(.06);
      ctx.fillStyle = "#fffdf5"; ctx.shadowColor = "#0005"; ctx.shadowBlur = 15; ctx.fillRect(-126, -126, 252, 285); ctx.shadowBlur = 0;
      const side = Math.min(p.width, p.height); ctx.drawImage(p, (p.width - side) / 2, (p.height - side) / 2, side, side, -112, -112, 224, 224); ctx.restore();
    } finally { URL.revokeObjectURL(url); }
  }
  ctx.fillStyle = "#304c3e"; ctx.font = "bold 38px sans-serif"; ctx.fillText(caption || "지금, 숲에 앉아요.", 54, 910, 1320);
  ctx.font = "22px sans-serif"; ctx.fillStyle = "#6a7567";
  ctx.fillText(`${kstDate(now)}  ${kstTime(now)} KST · 인제 숲속 캠프`, 54, 965);
  const weatherLabel = weather.stale ? "날씨 정보 갱신 중" : `${weatherNames[weather.kind]}${weather.temperature === null ? "" : ` ${weather.temperature}°C`}${weather.source === "sample" ? " · 체험 날씨" : ""}`;
  ctx.fillText(`${weatherLabel} · ${friend ? "친구와 함께" : "혼자 머문 숲"}`, 54, 1006);
  ctx.font = "bold 26px sans-serif"; ctx.fillStyle = "#3e5d45"; ctx.textAlign = "right"; ctx.fillText("캠핑가자", 1385, 1006);
  return new Promise<Blob>((resolve, reject) => canvas.toBlob(b => b ? resolve(b) : reject(Error("엽서를 저장하지 못했어요.")), "image/png"));
}
