import { NextResponse } from "next/server";
import { requireUser, apiError } from "@/lib/server-auth";
export async function GET(req: Request) {
  try { const user = await requireUser(req); return NextResponse.json({ connected: !!user.youtubeTokens }, { headers: { "Cache-Control": "no-store" } }); }
  catch (error) { return apiError(error); }
}
