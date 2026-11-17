// Single-process adapter for local verification only. Never selected on Vercel.
import { randomBytes, randomUUID } from "node:crypto";
import type { Motion, Room, Weather } from "../types";
type LocalRoom = Room & { invites: Map<string, { expiresAt: number; used: boolean }>; requests: Map<string, Room>; touchedAt: number; motions: Map<string, Motion> };
type State = { sessions: Map<string, string>; rooms: Map<string, LocalRoom>; limits: Map<string, { n: number; at: number }> };
const globalState = globalThis as unknown as { campLocal?: State };
const state: State = globalState.campLocal ??= { sessions: new Map(), rooms: new Map(), limits: new Map() };
export class CampError extends Error {
  constructor(public code: string, public status = 400) { super(code); }
}
export function localSession() {
  const token = randomBytes(32).toString("hex"), userId = randomUUID();
  state.sessions.set(token, userId);
  return { token, userId, mode: "local" };
}
export function localUser(token: string) { return state.sessions.get(token); }
function view(room: LocalRoom): Room {
  return structuredClone({ id: room.id, version: room.version, channelEpoch: room.channelEpoch, tentIndex: room.tentIndex, fire: room.fire, members: room.members, events: room.events.slice(-15), weather: room.weather });
}
export function localCommand(actor: string, action: string, id: string | null, payload: Record<string, unknown>, now = Date.now()): Room {
  const bucket = `${actor}:${action === "motion" ? "motion" : action}`;
  const limit = state.limits.get(bucket) ?? { n: 0, at: now };
  if (now - limit.at > 60000) { limit.n = 0; limit.at = now; }
  if (++limit.n > (action === "motion" ? 900 : action === "read" ? 300 : action === "create" ? 6 : 90)) throw new CampError("RATE_LIMITED", 429);
  state.limits.set(bucket, limit);
  for (const [key, room] of state.rooms) if (now - room.touchedAt > 30 * 60000) state.rooms.delete(key);
  if (action === "create") {
    const room: LocalRoom = { id: randomUUID(), version: 1, channelEpoch: 1, tentIndex: [...state.rooms.values()].reduce((n, r) => Math.max(n,r.tentIndex+1),0), fire: { lit: payload.lit === true, woodAt: Number(payload.woodAt ?? now), startedAt: now }, members: [{ userId: actor, seat: 0, lastSeen: now }], events: [], invites: new Map(), requests: new Map(), touchedAt: now, motions: new Map() };
    state.rooms.set(room.id, room);
    return view(room);
  }
  const room = state.rooms.get(id ?? "");
  if (!room) throw new CampError("ROOM_EXPIRED", 404);
  const old = room.members.length;
  room.members = room.members.filter(m => now - m.lastSeen < 90000);
  if (room.members.length !== old) { room.version++; room.channelEpoch++; }
  const member = room.members.find(m => m.userId === actor);
  if (action === "join" && !member) {
    const invite = room.invites.get(String(payload.tokenHash));
    if (room.members.length >= 4) throw new CampError("ROOM_FULL", 409);
    if (!invite || invite.used || invite.expiresAt <= now) throw new CampError("INVITE_EXPIRED", 410);
    invite.used = true;
    room.members.push({ userId: actor, seat: [0,1,2,3].find(seat => !room.members.some(m => m.seat === seat))!, lastSeen: now });
    room.version++; room.channelEpoch++;
  } else if (!member) throw new CampError("SEAT_EXPIRED", 403);
  if (action === "heartbeat" || action === "join") room.members.find(m => m.userId === actor)!.lastSeen = now;
  if (action === "leave") { room.members = room.members.filter(m => m.userId !== actor); room.motions.delete(actor); room.version++; room.channelEpoch++; }
  if (action === "invite") {
    if (room.members.length >= 4) throw new CampError("ROOM_FULL", 409);
    room.invites.clear();
    room.invites.set(String(payload.tokenHash), { expiresAt: now + 1800000, used: false });
  }
  const requestKey = `${actor}:${payload.requestId}`;
  if (["fire", "wave", "marshmallow", "skip", "weather"].includes(action)) {
    if (room.requests.has(requestKey)) return view(room); // a retry returns current authoritative state
    if (action === "fire") {
      if (payload.kind === "add" && !room.fire.lit) throw new CampError("FIRE_NOT_LIT");
      room.fire = { lit: payload.kind !== "stop", woodAt: now, startedAt: payload.kind === "start" ? now : room.fire.startedAt };
    } else if (action === "weather") room.weather = payload.weather as Weather | undefined;
    else room.events.push({ id: String(payload.requestId), userId: actor, kind: action as "wave" | "skip" | "marshmallow", value: Number(payload.value ?? 0), createdAt: now });
    room.version++;
    room.requests.set(requestKey, view(room));
  }
  room.touchedAt = now;
  if (action === "motion") room.motions.set(actor, payload.motion as Motion);
  return view(room);
}
export function localMotions(id: string): Motion[] { return [...(state.rooms.get(id)?.motions.values() ?? [])]; }

export function localRooms() { return [...state.rooms.values()].map(view); }
