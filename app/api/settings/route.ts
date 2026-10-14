import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser, apiError, ApiError } from "@/lib/server-auth";
import { prisma } from "@/lib/prisma";

const SettingsSchema = z.object({
  defaultVoice: z.enum(["male", "female", "ai_narrator"]).optional(),
  defaultLanguage: z.enum(["english", "hindi", "spanish"]).optional(),
  defaultVisibility: z.enum(["private", "unlisted", "public"]).optional(),
  defaultStyle: z.enum(["educational", "storytelling", "motivational", "documentary", "anime-style"]).optional(),
  defaultAspectRatio: z.enum(["16:9", "9:16"]).optional(),
  defaultResolution: z.enum(["720p", "1080p"]).optional(),
  defaultFrameRate: z.union([z.literal(24), z.literal(30)]).optional(),
  defaultDuration: z.enum(["short", "long"]).optional(),
  channelProfile: z.object({ name: z.string().max(100).optional(), description: z.string().max(2000).optional(),
    terminology: z.array(z.object({ term: z.string().min(1).max(100), pronunciation: z.string().min(1).max(200) })).max(100).optional(),
    intro: z.string().max(1000).optional(), outro: z.string().max(1000).optional(),
    captionPreset: z.enum(["clean", "bold", "minimal"]).optional(),
  }).optional(),
}).strict();

export async function GET(req: Request) {
  try {
    const user = await requireUser(req);
    return NextResponse.json({ settings: user.settings || {}, youtubeConnected: !!user.youtubeTokens,
      email: user.email, name: user.name, image: user.image, credits: user.credits,
    }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return apiError(error); }
}
export async function POST(req: Request) {
  try {
    const user = await requireUser(req);
    let body: unknown;
    try { body = await req.json(); } catch { throw new ApiError(400, "Invalid JSON"); }
    const parsed = SettingsSchema.safeParse(body);
    if (!parsed.success) return NextResponse.json({ error: "Invalid settings", details: parsed.error.flatten() }, { status: 422 });
    const existing = typeof user.settings === "object" && user.settings !== null && !Array.isArray(user.settings) ? user.settings : {};
    const updated = await prisma.user.update({ where: { id: user.id }, data: { settings: { ...existing, ...parsed.data } }, select: { settings: true } });
    return NextResponse.json({ settings: updated.settings });
  } catch (error) { return apiError(error); }
}
