export const dynamic = "force-dynamic";
export function GET() {
  return Response.json({ epochMs: Date.now() }, { headers: { "Cache-Control": "no-store" } });
}
