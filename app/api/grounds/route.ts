import {groundCommand} from '@/lib/server/ground';
import {apiError,jsonBody} from '@/lib/server/rooms';
export const dynamic='force-dynamic';
export async function GET(request:Request){try{return Response.json(await groundCommand(request,{action:'read'}),{headers:{'Cache-Control':'no-store'}});}catch(e){return apiError(e);}}
export async function POST(request:Request){try{return Response.json(await groundCommand(request,await jsonBody(request)),{headers:{'Cache-Control':'no-store'}});}catch(e){return apiError(e);}}
