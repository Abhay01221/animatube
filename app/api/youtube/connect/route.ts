import { NextRequest, NextResponse } from "next/server";
import { CodeChallengeMethod } from "google-auth-library";
import { requireUser, apiError, ApiError } from "@/lib/server-auth";
import { createYouTubeOAuthClient } from "@/lib/youtube";
import { createOAuthState, YOUTUBE_STATE_COOKIE } from "@/lib/youtube-oauth-state";
import { prisma } from "@/lib/prisma";

export async function POST(req: NextRequest) {
  try {
    const user = await requireUser(req);
    if (!user.firebaseUid || !user.emailVerified) throw new ApiError(403, "Verify your email before connecting YouTube.");
    const state = createOAuthState(user.id, user.firebaseUid);
    const client = createYouTubeOAuthClient();
    await prisma.verificationToken.create({ data: { identifier: `youtube:${user.id}`, token: state.token, expires: new Date(state.expires) } });
    const url = client.generateAuthUrl({ access_type: "offline", prompt: "consent", include_granted_scopes: true,
      scope: ["https://www.googleapis.com/auth/youtube.upload"], state: state.nonce,
      code_challenge: state.challenge, code_challenge_method: CodeChallengeMethod.S256 });
    const response = NextResponse.json({ url }, { headers: { "Cache-Control": "no-store" } });
    response.cookies.set(YOUTUBE_STATE_COOKIE, state.cookie, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production",
      path: "/api/youtube/callback", maxAge: 600 });
    return response;
  } catch (error) { return apiError(error); }
}
