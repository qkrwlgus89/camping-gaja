"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { guest, Guest, supabaseBrowser, errorMessages } from "./client";
import type { CampEvent, Fire, Motion, Room } from "./types";
import { validMotion } from "./world";
type Reply = { room: Room; userId: string; motions?: Motion[]; inviteToken?: string; expiresAt?: number };
export function useRoom(onEvent: (e: CampEvent) => void) {
  const [room, setRoom] = useState<Room | null>(null);
  const [identity, setIdentity] = useState<Guest | null>(null);
  const [status, setStatus] = useState<"solo" | "connecting" | "connected" | "reconnecting" | "expired">("solo");
  const [error, setError] = useState("");
  const [pendingInvite, setPendingInvite] = useState<{ id: string; token: string } | null>(null);
  const [friend, setFriend] = useState<Motion | null>(null);
  const [inviteUrl, setInviteUrl] = useState("");
  const active = useRef<Room | null>(null), auth = useRef<Guest | null>(null);
  const channel = useRef<RealtimeChannel | null>(null);
  const eventFn = useRef(onEvent), seenEvents = useRef(new Set<string>()), joinedAt = useRef(Date.now());
  const latestMotion = useRef<Motion | null>(null), outgoing = useRef(0), generation = useRef(0);
  const lastPackets = useRef(new Map<string, number>());
  const peer = useRef<Motion | null>(null);
  const online = useRef(true), readBusy = useRef(false);
  eventFn.current = onEvent;
  const receiveMotion = useCallback((motion: unknown, members = active.current?.members) => {
    if (!validMotion(motion) || motion.userId === auth.current?.userId || !members?.some(m => m.userId === motion.userId)) return;
    if (motion.seq <= (lastPackets.current.get(motion.userId) ?? -1)) return;
    lastPackets.current.set(motion.userId, motion.seq);
    peer.current = motion; setFriend(motion);
  }, []);
  const apply = useCallback((reply: Reply) => {
    if (active.current && reply.room.id === active.current.id && reply.room.version < active.current.version) return;
    active.current = reply.room; setRoom(reply.room);
    if (peer.current && !reply.room.members.some(m => m.userId === peer.current?.userId)) { peer.current = null; setFriend(null); }
    for (const e of reply.room.events) {
      if (!seenEvents.current.has(e.id) && e.createdAt >= joinedAt.current && Date.now() - e.createdAt < 12000) {
        seenEvents.current.add(e.id); eventFn.current(e);
      }
    }
    reply.motions?.forEach(m => receiveMotion(m, reply.room.members));
  }, [receiveMotion]);
  const request = useCallback(async (action: string, body: Record<string, unknown> = {}, id = active.current?.id) => {
    const who = await guest(); auth.current = who; setIdentity(who);
    const route = action === "create" ? "/api/rooms" : `/api/rooms/${id}`;
    const res = await fetch(route, { method: action === "read" ? "GET" : "POST", headers: { Authorization: `Bearer ${who.token}`, ...(action !== "read" ? { "Content-Type": "application/json" } : {}) }, ...(action !== "read" ? { body: JSON.stringify({ ...body, action }) } : {}), signal: AbortSignal.timeout(10000), cache: "no-store" });
    const reply = await res.json();
    if (!res.ok) {
      if (reply.error === "AUTH_REQUIRED" && who.mode === "local") localStorage.removeItem("camp-local-guest");
      if (["SEAT_EXPIRED", "ROOM_EXPIRED", "AUTH_REQUIRED"].includes(reply.error) && active.current) setStatus("expired");
      throw new Error(errorMessages[reply.error] ?? "연결을 확인해 주세요. 잠시 후 다시 시도할 수 있어요.");
    }
    return reply as Reply;
  }, []);
  const enter = useCallback((reply: Reply) => {
    joinedAt.current = Date.now(); seenEvents.current.clear(); lastPackets.current.clear();
    apply(reply); setStatus("connected"); setPendingInvite(null); setError("");
    localStorage.setItem("camp-room", reply.room.id);
    const url = new URL(location.href); url.searchParams.set("room", reply.room.id); url.hash = "";
    history.replaceState(null, "", url);
  }, [apply]);
  useEffect(() => {
    const url = new URL(location.href);
    const id = url.searchParams.get("room");
    const token = new URLSearchParams(url.hash.slice(1)).get("invite");
    let cancelled = false;
    if (id && token) { setPendingInvite({ id, token }); return; }
    const saved = id || localStorage.getItem("camp-room");
    if (saved) {
      setStatus("connecting");
      request("heartbeat", {}, saved).then(reply => { if (!cancelled) enter(reply); }).catch(e => { if (!cancelled) { setStatus("expired"); setError(e.message); } });
    }
    return () => { cancelled = true; };
  }, [enter, request]);
  const join = async () => {
    if (!pendingInvite) return false;
    setStatus("connecting"); setError("");
    try { enter(await request("join", { token: pendingInvite.token }, pendingInvite.id)); return true; }
    catch (e) { setStatus("solo"); setError((e as Error).message); return false; }
  };
  const invite = async (fire: Fire) => {
    setError("");
    try {
      if (!active.current) enter(await request("create", { lit: fire.lit, woodAt: fire.woodAt }));
      const reply = await request("invite"); apply(reply);
      const url = new URL(location.href); url.searchParams.set("room", reply.room.id); url.hash = `invite=${reply.inviteToken}`;
      setInviteUrl(url.toString()); return url.toString();
    } catch (e) { setError((e as Error).message); return ""; }
  };
  const act = async (action: string, body: Record<string, unknown> = {}) => {
    if (!active.current || status !== "connected" || !online.current) return false;
    const requestId = crypto.randomUUID();
    try {
      let reply: Reply;
      try { reply = await request(action, { ...body, requestId }); }
      catch (e) {
        if (navigator.onLine && (e instanceof TypeError || ["TimeoutError", "AbortError"].includes((e as Error).name))) reply = await request(action, { ...body, requestId });
        else throw e;
      }
      apply(reply); return true;
    }
    catch (e) { setError((e as Error).message); if (!navigator.onLine) setStatus("reconnecting"); return false; }
  };
  const leave = async (force = false) => {
    if (active.current && status !== "expired") {
      try { if (navigator.onLine) await request("leave"); else if (!force) throw Error("연결 후 나가거나 혼자 계속하기를 선택해 주세요."); } catch (e) { if (!force) { setError((e as Error).message); return false; } }
    }
    generation.current++; active.current = null; setRoom(null); setFriend(null); setStatus("solo"); setPendingInvite(null); setInviteUrl(""); setError("");
    localStorage.removeItem("camp-room");
    const url = new URL(location.href); url.searchParams.delete("room"); url.hash = ""; history.replaceState(null, "", url);
    return true;
  };
  const sendMotion = useCallback((m: Motion, force = false) => {
    const who = auth.current, current = active.current;
    if (!who || !current || !online.current) return;
    const motion = { ...m, userId: who.userId, seq: Date.now() * 100 + (outgoing.current++ % 100), sentAt: Date.now() };
    latestMotion.current = motion;
    if (force || outgoing.current % 10 === 0) localStorage.setItem(`camp-motion:${current.id}`, JSON.stringify(motion));
    if (!force && performance.now() - outgoingTime.current < 95) return;
    outgoingTime.current = performance.now();
    if (who.mode === "local") void request("motion", { motion }).then(apply).catch(() => { setStatus("reconnecting"); });
    else if (channel.current?.state === "joined") void channel.current.send({ type: "broadcast", event: "motion", payload: motion });
  }, [apply, request]);
  const outgoingTime = useRef(0);
  useEffect(() => {
    if (!room?.id || !identity) return;
    const id = room.id, turn = ++generation.current;
    let disposed = false;
    const stillHere = () => !disposed && turn === generation.current;
    const read = async (heartbeat = false) => {
      if (!navigator.onLine || readBusy.current || !stillHere()) return;
      readBusy.current = true;
      try {
        const reply = await request(heartbeat ? "heartbeat" : "read", {}, id);
        if (stillHere()) { apply(reply); if (identity.mode === "local" || channel.current?.state === "joined") setStatus("connected"); }
      } catch (e) { if (stillHere()) { setError((e as Error).message); setStatus(s => s === "expired" ? s : "reconnecting"); } }
      finally { readBusy.current = false; }
    };
    const sb = supabaseBrowser();
    if (sb && identity.mode === "supabase") {
      const ch = sb.channel(`camp:${id}:${room.channelEpoch}`, { config: { private: true, broadcast: { self: false } } });
      channel.current = ch;
      ch.on("broadcast", { event: "motion" }, ({ payload }) => receiveMotion(payload));
      ch.on("broadcast", { event: "hello" }, () => { if (latestMotion.current) sendMotion(latestMotion.current, true); });
      ch.on("postgres_changes", { event: "UPDATE", schema: "public", table: "camp_rooms", filter: `id=eq.${id}` }, () => { void read(); });
      ch.on("postgres_changes", { event: "UPDATE", schema: "public", table: "camp_weather", filter: "camp_id=eq.inje" }, () => window.dispatchEvent(new Event("camp-weather-updated")));
      void sb.realtime.setAuth(identity.token).then(() => {
        if (!stillHere()) return;
        ch.subscribe(state => {
          if (!stillHere()) return;
          if (state === "SUBSCRIBED") {
            setStatus("connected"); void read(true);
            void ch.send({ type: "broadcast", event: "hello", payload: {} });
            if (latestMotion.current) sendMotion(latestMotion.current, true);
          } else if (["CHANNEL_ERROR", "TIMED_OUT", "CLOSED"].includes(state)) setStatus("reconnecting");
        });
      });
    }
    const poll = setInterval(() => { void read(); }, identity.mode === "local" ? 450 : 4000);
    const heartbeat = setInterval(() => { void read(true); }, 30000);
    const connection = () => {
      online.current = navigator.onLine;
      if (!navigator.onLine) setStatus("reconnecting");
      else { void read(true); if (latestMotion.current) sendMotion(latestMotion.current, true); }
    };
    const visibility = () => { if (!document.hidden) connection(); };
    addEventListener("online", connection); addEventListener("offline", connection); document.addEventListener("visibilitychange", visibility);
    return () => { disposed = true; clearInterval(poll); clearInterval(heartbeat); removeEventListener("online", connection); removeEventListener("offline", connection); document.removeEventListener("visibilitychange", visibility); if (channel.current) { void sb?.removeChannel(channel.current); channel.current = null; } };
  // identity.token refresh is handled by Supabase's auth client; avoid rebuilding on each read.
  }, [room?.id, room?.channelEpoch, identity?.userId, apply, receiveMotion, request, sendMotion]);
  const create = async (fire: Fire) => { if (active.current) return; try { enter(await request("create", { lit: fire.lit, woodAt: fire.woodAt })); } catch (e) { setError((e as Error).message); } };
  return { room, identity, status, error, setError, pendingInvite, join, invite, inviteUrl, act, leave, friend, sendMotion, create };
}
