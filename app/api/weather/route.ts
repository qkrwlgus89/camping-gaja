import { getWeather } from "@/lib/server/weather";
export const dynamic = "force-dynamic";
export const maxDuration = 30;
export async function GET() {
  return Response.json(await getWeather(), { headers: { "Cache-Control": "no-store" } });
}
