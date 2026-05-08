/**
 * GET  /api/settings — fetch user settings
 * POST /api/settings — save user settings
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const SettingsSchema = z.object({
  defaultVoice: z.enum(["male", "female", "ai_narrator"]).optional(),
  defaultLanguage: z.enum(["english", "hindi", "spanish"]).optional(),
  defaultVisibility: z.enum(["private", "unlisted", "public"]).optional(),
  defaultStyle: z
    .enum(["educational", "storytelling", "motivational", "documentary", "anime-style"])
    .optional(),
});

export async function GET(_req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: {
      settings: true,
      youtubeTokens: true,
      email: true,
      name: true,
      image: true,
    },
  });

  return NextResponse.json({
    settings: user?.settings ?? {},
    youtubeConnected: !!user?.youtubeTokens,
    email: user?.email,
    name: user?.name,
    image: user?.image,
  });
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = SettingsSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 422 }
    );
  }

  const user = await prisma.user.update({
    where: { id: session.user.id },
    data: { settings: parsed.data },
    select: { settings: true },
  });

  return NextResponse.json({ settings: user.settings });
}
