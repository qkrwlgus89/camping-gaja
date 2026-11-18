"use client";
import {GuestAccessError,guestAccessError} from "./auth-errors";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
let client: SupabaseClient | null = null;
export function supabaseBrowser() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  return client ??= createClient(url, key);
}
export type Guest = { token: string; userId: string; mode: "local" | "supabase" };
export async function guest(): Promise<Guest> {
  async function acquire() {
    const sb = supabaseBrowser();
    if (sb) {
      let { data: { session } } = await sb.auth.getSession();
      if (!session) {
        const result = await sb.auth.signInAnonymously();
        if (result.error || !result.data.session) throw guestAccessError(result.error);
        session = result.data.session;
      }
      return { token: session.access_token, userId: session.user.id, mode: "supabase" as const };
    }
    const stored = localStorage.getItem("camp-local-guest");
    if (stored) { try { return JSON.parse(stored) as Guest; } catch { localStorage.removeItem("camp-local-guest"); } }
    const res = await fetch("/api/session", { method: "POST" });
    if (!res.ok) throw new GuestAccessError("guest_service_unavailable", "공동 캠핑장에 연결되지 않았어요. 지금은 혼자 숲을 둘러볼 수 있어요.", res.status);
    const value = await res.json() as Guest;
    localStorage.setItem("camp-local-guest", JSON.stringify(value));
    return value;
  }
  return navigator.locks ? navigator.locks.request("camp-guest", acquire) : acquire();
}
export const errorMessages: Record<string, string> = {
  RESOURCE_BUSY:'다른 캠퍼가 먼저 자리를 잡았어요.',INVALID_RESOURCE:'이 자리는 이용할 수 없어요.',
  EVENT_ACTIVE:'이미 함께하는 시간이 진행 중이에요.',EVENT_FULL:'이번 모임의 여덟 자리가 찼어요.',EVENT_NOT_READY:'네 명 이상 모이면 시작할 수 있어요.',EVENT_EXPIRED:'모임이 끝났어요. 다시 모집할 수 있어요.',EVENT_HOST_ONLY:'모집한 캠퍼가 시작할 수 있어요.',
  BBQ_NOT_READY:'음식을 조금 더 굽고 한 번 뒤집어 주세요.',BBQ_SLOT_BUSY:'이미 음식이 올라가 있어요.',BBQ_TABLE_FULL:'테이블의 음식을 먼저 나눠 먹어 주세요.',

  CAMP_SETUP_REQUIRED: "공동 캠핑장을 준비 중이에요. 운영 설정이 완료되면 다시 연결할 수 있어요.",
  ROOM_FULL: "이 캠프는 네 자리가 모두 찼어요.", INVITE_EXPIRED: "초대가 만료되었거나 이미 사용된 링크예요.",
  ROOM_EXPIRED: "오래 비어 있던 캠프가 문을 닫았어요.", SEAT_EXPIRED: "90초 동안 연결이 없어 자리가 만료되었어요. 새 초대를 받아 주세요.",
  RATE_LIMITED: "잠깐 숨을 고르고 다시 시도해 주세요.", AUTH_REQUIRED: "게스트 세션이 만료되었어요. 새 초대를 받아 다시 들어와 주세요.",
  FIRE_NOT_LIT: "먼저 불을 피워 주세요.", SERVICE_UNAVAILABLE: "친구 캠프에 연결하지 못했어요. 혼자 캠핑은 계속할 수 있어요.",
};
