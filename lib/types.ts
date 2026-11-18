export type Zone = "fire" | "creek" | "deck" | "shelter";
export type Pose = "standing" | "walking" | "sitting" | "reclining" | "dancing";
export type Motion = { x: number; z: number; yaw: number; pose: Pose; zone: Zone; seq: number; sentAt: number; userId: string; pitch?: number; heading?: number; resourceId?:string; inside?: boolean };
export type Member = { userId: string; seat: number; lastSeen: number };
export type CampEvent = { id: string; userId: string; kind: "wave" | "marshmallow" | "skip"; value: number; createdAt: number };
export type Fire = { lit: boolean; woodAt: number; startedAt: number };
export type Room = { id: string; version: number; channelEpoch: number; tentIndex: number; fire: Fire; members: Member[]; events: CampEvent[]; weather?: Weather };
export type WeatherKind = "clear" | "cloudy" | "rain" | "sleet" | "snow";
export type Weather = { kind: WeatherKind; temperature: number | null; rainMm: number; sky: number; observedAt: number; fetchedAt: number; version: number; source: "kma" | "sample" | "unavailable"; stale: boolean };
export const ZONES: Record<Zone, { name: string; x: number; z: number; description: string }> = {
  fire: { name: "모닥불", x: 0, z: 2, description: "따뜻한 불 앞에서, 잠깐 쉬어가요." },
  creek: { name: "계곡가", x: 5, z: -15, description: "흐르는 물에 마음도 가볍게 흘려보내요." },
  deck: { name: "전망 데크", x: -11, z: -12, description: "오늘의 숲을 한 장에 담아두세요." },
  shelter: { name: "텐트 아래", x: -9, z: 8, description: "비가 와도 괜찮은, 아늑한 자리." },
};
export const INITIAL_MOTION: Motion = { x: 0, z: 9, yaw: 0, pose: "standing", zone: "fire", seq: 0, sentAt: 0, userId: "solo" };
