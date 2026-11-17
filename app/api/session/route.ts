import { configured, localDemo } from "@/lib/server/supabase";
import { localSession } from "@/lib/server/local";
import { apiError, sameOrigin } from "@/lib/server/rooms";
export async function POST(request: Request) {
  try {
    sameOrigin(request);
    if (!localDemo() || configured()) return Response.json({ error: "USE_SUPABASE_AUTH" }, { status: 503 });
    return Response.json(localSession(), { headers: { "Cache-Control": "no-store" } });
  } catch (e) { return apiError(e); }
}
