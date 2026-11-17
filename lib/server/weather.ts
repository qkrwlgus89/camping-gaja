import { CAMP, gridFor, neutralWeather, precipitation, safeWeather } from "../environment";
import type { Weather } from "../types";
import { admin, configured } from "./supabase";
type Item = { category: string; obsrValue?: string; fcstValue?: string; fcstDate?: string; fcstTime?: string; baseDate: string; baseTime: string };
type Cache = { value: Weather | null; checkedAt: number; flight?: Promise<Weather> };
const g = globalThis as unknown as { campWeatherCache?: Cache };
const cache = g.campWeatherCache ??= { value: null, checkedAt: 0 };
export function kmaBase(now: number, forecast = false, previous = 0) {
  const d = new Date(now + 9 * 3600000 - (forecast ? 45 : 15) * 60000 - previous * 3600000);
  return { base_date: d.toISOString().slice(0, 10).replaceAll("-", ""), base_time: `${String(d.getUTCHours()).padStart(2, "0")}${forecast ? "30" : "00"}` };
}
async function items(type: "getUltraSrtNcst" | "getUltraSrtFcst", now: number, previous = 0): Promise<Item[]> {
  const key = process.env.KMA_SERVICE_KEY!;
  const url = new URL(`https://apis.data.go.kr/1360000/VilageFcstInfoService_2.0/${type}`);
  const grid = gridFor(CAMP.latitude, CAMP.longitude);
  for (const [k, v] of Object.entries({ serviceKey: key, dataType: "JSON", numOfRows: "1000", pageNo: "1", ...kmaBase(now, type === "getUltraSrtFcst", previous), nx: grid.nx, ny: grid.ny })) url.searchParams.set(k, String(v));
  const res = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(5000) });
  if (!res.ok) throw new Error("KMA_HTTP");
  const body = await res.json();
  if (body.response?.header?.resultCode !== "00" || !Array.isArray(body.response?.body?.items?.item) || !body.response.body.items.item.length) throw new Error("KMA_DELAY");
  return body.response.body.items.item;
}
export function normalizeKma(rows: Item[], sky: number, now: number): Weather {
  const get = (cat: string) => rows.find(i => i.category === cat)?.obsrValue;
  if (get("PTY") === undefined || get("T1H") === undefined) throw Error("KMA_INCOMPLETE");
  const first = rows[0];
  const t = first.baseTime.padStart(4, "0");
  const d = first.baseDate;
  const observedAt = Date.parse(`${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}T${t.slice(0, 2)}:${t.slice(2, 4)}:00+09:00`);
  const temperature = Number(get("T1H")), pty = Number(get("PTY"));
  if (!Number.isFinite(observedAt) || !Number.isFinite(temperature) || !Number.isFinite(pty)) throw Error("KMA_INVALID");
  return { kind: precipitation(pty, sky), temperature, rainMm: parseFloat(get("RN1") ?? "0") || 0, sky, observedAt, fetchedAt: now, version: now, source: "kma", stale: false };
}
async function refresh(): Promise<Weather> {
  const now = Date.now();
  let claimed = false;
  if (configured()) {
    try {
      const db = admin();
      const { data } = await db.from("camp_weather").select("payload,updated_at").eq("camp_id", "inje").single();
      if (data?.payload) cache.value = data.payload as Weather;
      const { data: lease, error } = await db.rpc("camp_weather_claim");
      if (error || !lease) return safeWeather(cache.value, now);
      claimed = true;
    } catch { return safeWeather(cache.value, now); }
  }
  try {
    let rows: Item[];
    try { rows = await items("getUltraSrtNcst", now); } catch { rows = await items("getUltraSrtNcst", now, 1); }
    let sky = cache.value?.sky ?? 3;
    try {
      const forecast = await items("getUltraSrtFcst", now);
      const distance = (i: Item) => {
        const d = i.fcstDate ?? "", t = i.fcstTime ?? "";
        return Math.abs(Date.parse(`${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}T${t.slice(0, 2)}:${t.slice(2)}:00+09:00`) - now);
      };
      const skies = forecast.filter(i => i.category === "SKY").sort((a, b) => distance(a) - distance(b));
      if (skies.length) sky = Number(skies[0].fcstValue);
    } catch { /* Observations remain usable when the ancillary forecast is delayed. */ }
    cache.value = normalizeKma(rows, sky, now);
  } catch { /* Retain the last observation, then degrade after two hours. No key or URL logging. */ }
  const value = safeWeather(cache.value, now);
  if (claimed) {
    await admin().from("camp_weather").update({ payload: cache.value, updated_at: new Date(now).toISOString(), lease_until: new Date(now).toISOString() }).eq("camp_id", "inje");
  }
  return value;
}
export async function getWeather(): Promise<Weather> {
  if (!process.env.KMA_SERVICE_KEY) return neutralWeather();
  if (cache.flight) return cache.flight;
  // Vercel instances always consult the shared cache; a warm instance must not
  // keep serving an older version after another instance has refreshed it.
  if (!configured() && Date.now() - cache.checkedAt < 600000) return safeWeather(cache.value);
  cache.checkedAt = Date.now();
  cache.flight = refresh().finally(() => { cache.flight = undefined; });
  return cache.flight;
}
