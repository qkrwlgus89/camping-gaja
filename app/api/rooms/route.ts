import { apiError, command, jsonBody } from "@/lib/server/rooms";
export async function POST(request: Request) {
  try { return Response.json(await command(request, "create", null, await jsonBody(request)), { headers: { "Cache-Control": "no-store" } }); }
  catch (e) { return apiError(e); }
}
