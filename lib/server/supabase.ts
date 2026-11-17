import { createClient } from "@supabase/supabase-js";
export function admin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("SUPABASE_NOT_CONFIGURED");
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}
export const configured = () => Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && (process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY));
export const localDemo = () => process.env.ENABLE_LOCAL_DEMO === "true" && !process.env.VERCEL;
export const sceneLab = () => process.env.NODE_ENV === "development" || process.env.NEXT_PUBLIC_ENABLE_SCENE_LAB === "true";
