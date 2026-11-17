import { apiError, command, jsonBody } from "@/lib/server/rooms";
type Context = { params: Promise<{ id: string }> };
export async function GET(request: Request, context: Context) {
  try { return Response.json(await command(request, "read", (await context.params).id, {}), { headers: { "Cache-Control": "no-store" } }); }
  catch (e) { return apiError(e); }
}
export async function POST(request: Request, context: Context) {
  try {
    const body = await jsonBody(request);
    return Response.json(await command(request, String(body.action), (await context.params).id, body), { headers: { "Cache-Control": "no-store" } });
  } catch (e) { return apiError(e); }
}
