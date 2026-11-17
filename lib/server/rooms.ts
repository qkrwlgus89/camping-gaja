import { createHash, randomBytes } from "node:crypto";
import { admin, configured, localDemo, sceneLab } from "./supabase";
import { CampError, localCommand, localMotions, localUser } from "./local";
import { validMotion } from "../world";
import { sampleWeather } from "../environment";
import type { Room, WeatherKind } from "../types";
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export function sameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  // Next.js can normalize request.url behind its development proxy.
  const host = request.headers.get("host") || new URL(request.url).host;
  if (origin && new URL(origin).host !== host) throw new CampError("ORIGIN_DENIED", 403);
}
export async function userFor(request: Request) {
  const token = request.headers.get("authorization")?.replace(/^Bearer /, "");
  if (!token) throw new CampError("AUTH_REQUIRED", 401);
  if (localDemo() && !configured()) {
    const actor = localUser(token);
    if (!actor) throw new CampError("AUTH_REQUIRED", 401);
    return actor;
  }
  if (!configured()) throw new CampError("SERVICE_UNAVAILABLE", 503);
  const { data, error } = await admin().auth.getUser(token);
  if (error || !data.user) throw new CampError("AUTH_REQUIRED", 401);
  return data.user.id;
}
export async function command(request: Request, action: string, id: string | null, body: Record<string, unknown>) {
  sameOrigin(request);
  if (id && !uuid.test(id)) throw new CampError("INVALID_ROOM");
  const actor = await userFor(request);
  const payload: Record<string, unknown> = {};
  let inviteToken: string | undefined;
  if (action === "create") {
    payload.lit = body.lit === true;
    payload.woodAt = typeof body.woodAt === "number" && Number.isFinite(body.woodAt) ? Math.max(Date.now() - 1800000, Math.min(Date.now(), body.woodAt)) : Date.now();
  }
  if (action === "join") {
    if (typeof body.token !== "string" || !/^[a-f0-9]{64}$/.test(body.token)) throw new CampError("INVITE_EXPIRED", 410);
    payload.tokenHash = createHash("sha256").update(body.token).digest("hex");
  }
  if (action === "invite") {
    inviteToken = randomBytes(32).toString("hex");
    payload.tokenHash = createHash("sha256").update(inviteToken).digest("hex");
  }
  if (["fire", "wave", "marshmallow", "skip", "weather"].includes(action)) {
    if (typeof body.requestId !== "string" || !uuid.test(body.requestId)) throw new CampError("INVALID_REQUEST");
    payload.requestId = body.requestId;
    if (action === "fire") {
      if (!["start", "add", "stop"].includes(String(body.kind))) throw new CampError("INVALID_ACTION");
      payload.kind = body.kind;
    }
    if (action === "skip" || action === "marshmallow") {
      if (!Number.isInteger(body.value) || Number(body.value) < 0 || Number(body.value) > 5) throw new CampError("INVALID_VALUE");
      payload.value = body.value;
    }
    if (action === "weather") {
      if (!sceneLab()) throw new CampError("LAB_DISABLED", 403);
      if (body.kind === "live") payload.weather = null;
      else if (["clear", "cloudy", "rain", "sleet", "snow"].includes(String(body.kind))) payload.weather = sampleWeather(body.kind as WeatherKind);
      else if (["stale", "failure"].includes(String(body.kind))) payload.weather = { ...sampleWeather("cloudy"), observedAt: 0, source: "unavailable", stale: true };
      else throw new CampError("INVALID_VALUE");
    }
  }
  if (action === "motion") {
    if (!localDemo() || configured()) throw new CampError("USE_PRIVATE_BROADCAST");
    if (!validMotion(body.motion) || body.motion.userId !== actor) throw new CampError("INVALID_MOTION");
    payload.motion = body.motion;
  }
  const allowed = ["create", "read", "join", "invite", "heartbeat", "leave", "fire", "wave", "marshmallow", "skip", "weather", "motion"];
  if (!allowed.includes(action)) throw new CampError("INVALID_ACTION");
  let room: Room;
  if (localDemo() && !configured()) room = localCommand(actor, action, id, payload);
  else {
    const { data, error } = await admin().rpc("camp_command", { p_actor: actor, p_action: action, p_room: id, p_payload: payload });
    if (error) {
      if (["PGRST202", "PGRST205", "42P01", "42883"].includes(error.code)) throw new CampError("CAMP_SETUP_REQUIRED", 503);
      const code = ["ROOM_FULL", "ROOM_EXPIRED", "SEAT_EXPIRED", "INVITE_EXPIRED", "RATE_LIMITED", "FIRE_NOT_LIT"].find(s => error.message.includes(s));
      throw new CampError(code ?? "ROOM_SERVICE_ERROR", code === "RATE_LIMITED" ? 429 : code === "SEAT_EXPIRED" ? 403 : code === "ROOM_FULL" ? 409 : code === "INVITE_EXPIRED" ? 410 : code === "ROOM_EXPIRED" ? 404 : 503);
    }
    room = data as Room;
  }
  return { room, userId: actor, ...(inviteToken ? { inviteToken, expiresAt: Date.now() + 1800000 } : {}), ...(localDemo() && !configured() && id ? { motions: localMotions(id) } : {}) };
}
export async function jsonBody(request: Request): Promise<Record<string, unknown>> {
  const raw = await request.text();
  if (raw.length > 4096) throw new CampError("REQUEST_TOO_LARGE", 413);
  try { const body = JSON.parse(raw); if (!body || typeof body !== "object" || Array.isArray(body)) throw Error(); return body; }
  catch { throw new CampError("INVALID_REQUEST"); }
}
export function apiError(e: unknown) {
  const error = e instanceof CampError ? e : new CampError("SERVICE_UNAVAILABLE", 503);
  return Response.json({ error: error.code }, { status: error.status, headers: { "Cache-Control": "no-store" } });
}
