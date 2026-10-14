import { NextRequest, NextResponse } from "next/server";
import { createYouTubeOAuthClient, saveYouTubeTokens, youtubeAppUrl } from "@/lib/youtube";
import { hashOAuthState, readOAuthState, YOUTUBE_STATE_COOKIE } from "@/lib/youtube-oauth-state";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  let connected = false;
  try {
    const code = req.nextUrl.searchParams.get("code");
    const nonce = req.nextUrl.searchParams.get("state");
    const cookie = req.cookies.get(YOUTUBE_STATE_COOKIE)?.value;
    if (!code || !nonce || !cookie || req.nextUrl.searchParams.has("error")) throw new Error("Authorization was not completed");
    const state = readOAuthState(cookie, nonce);
    // Atomic consumption rejects replay and concurrent callback submissions.
    const consumed = await prisma.verificationToken.deleteMany({ where: { identifier: `youtube:${state.userId}`,
      token: hashOAuthState(nonce), expires: { gt: new Date() } } });
    if (consumed.count !== 1) throw new Error("Authorization state already used or expired");
    const user = await prisma.user.findUnique({ where: { id: state.userId }, select: { firebaseUid: true, emailVerified: true } });
    if (!user?.emailVerified || user.firebaseUid !== state.firebaseUid) throw new Error("Account identity changed");
    const client = createYouTubeOAuthClient();
    const { tokens } = await client.getToken({ code, codeVerifier: state.verifier });
    await saveYouTubeTokens(state.userId, tokens);
    connected = true;
  } catch (error) { console.warn("[YouTube OAuth] Connection incomplete", error instanceof Error ? error.name : "UnknownError"); }
  const url = new URL("/settings", youtubeAppUrl());
  url.searchParams.set("youtube", connected ? "connected" : "error");
  const response = NextResponse.redirect(url);
  response.cookies.set(YOUTUBE_STATE_COOKIE, "", { path: "/api/youtube/callback", httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", maxAge: 0 });
  response.headers.set("Cache-Control", "no-store");
  return response;
}
