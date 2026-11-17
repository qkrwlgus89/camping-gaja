import SunCalc from "suncalc";
import { Weather, WeatherKind } from "./types";
// Official GoCamping #1245 public map point (verified 2026-11-17).
// Used for sky/weather only; the virtual terrain remains an original layout.
export const CAMP = { latitude: 37.9242191, longitude: 128.3970647, name: "인제 숲속 캠프" };
export const kstTime = (epoch: number) => new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", hour: "2-digit", minute: "2-digit", hour12: false }).format(epoch);
export const kstDate = (epoch: number) => new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", year: "numeric", month: "long", day: "numeric" }).format(epoch);
export function daylight(epoch: number) {
  const sun = SunCalc.getPosition(new Date(epoch), CAMP.latitude, CAMP.longitude);
  const altitude = sun.altitude * 180 / Math.PI;
  const light = Math.max(0, Math.min(1, (altitude + 12) / 38));
  // SunCalc azimuth: radians, south=0, west=positive. World north=-Z, east=+X.
  const direction: [number, number, number] = [-Math.sin(sun.azimuth) * Math.cos(sun.altitude) * 40, Math.sin(sun.altitude) * 40, Math.cos(sun.azimuth) * Math.cos(sun.altitude) * 40];
  const phase = altitude < -8 ? "밤" : altitude < 7 ? (direction[0] > 0 ? "새벽" : "해질녘") : "낮";
  return { light, altitude, direction, phase };
}
export function gridFor(latitude: number, longitude: number) {
  // KMA DFS Lambert conformal conic transform, RE=6371.00877km / GRID=5km.
  const rad = Math.PI / 180, re = 6371.00877 / 5;
  const slat1 = 30 * rad, slat2 = 60 * rad, olat = 38 * rad;
  const sn = Math.log(Math.cos(slat1) / Math.cos(slat2)) / Math.log(Math.tan(Math.PI / 4 + slat2 / 2) / Math.tan(Math.PI / 4 + slat1 / 2));
  const sf = Math.pow(Math.tan(Math.PI / 4 + slat1 / 2), sn) * Math.cos(slat1) / sn;
  const ro = re * sf / Math.pow(Math.tan(Math.PI / 4 + olat / 2), sn);
  const ra = re * sf / Math.pow(Math.tan(Math.PI / 4 + latitude * rad / 2), sn);
  const theta = (longitude - 126) * rad * sn;
  return { nx: Math.floor(ra * Math.sin(theta) + 43 + 0.5), ny: Math.floor(ro - ra * Math.cos(theta) + 136 + 0.5) };
}
export function precipitation(pty: number, sky = 1): WeatherKind {
  if ([1, 4, 5].includes(pty)) return "rain";
  if ([2, 6].includes(pty)) return "sleet";
  if ([3, 7].includes(pty)) return "snow";
  return sky >= 3 ? "cloudy" : "clear";
}
export function neutralWeather(now = Date.now()): Weather {
  return { kind: "cloudy", temperature: null, rainMm: 0, sky: 3, observedAt: 0, fetchedAt: now, version: 0, source: "unavailable", stale: true };
}
export function safeWeather(w: Weather | null, now = Date.now()): Weather {
  return !w || now - w.observedAt > 2 * 3600000 ? { ...neutralWeather(now), version: w?.version ?? 0 } : w;
}
export const weatherNames: Record<WeatherKind, string> = { clear: "맑음", cloudy: "흐림", rain: "비", sleet: "진눈깨비", snow: "눈" };
export const sampleWeather = (kind: WeatherKind, now = Date.now()): Weather => ({ kind, temperature: kind === "snow" ? -2 : kind === "sleet" ? 1 : 18, rainMm: kind === "rain" ? 3 : 0, sky: kind === "clear" ? 1 : 4, observedAt: now, fetchedAt: now, version: now, source: "sample", stale: false });
