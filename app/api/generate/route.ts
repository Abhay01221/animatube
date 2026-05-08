/**
 * POST /api/generate
 * Validates input, creates a BullMQ job, returns jobId.
 * Rate limited to 5 requests/hour per user.
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { videoQueue, type VideoJobData } from "@/lib/queue";
import { prisma } from "@/lib/prisma";
import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

// ─── Input validation schema ──────────────────────────────────────────────────
const GenerateSchema = z.object({
  prompt: z.string().min(10, "Prompt must be at least 10 characters").max(500),
  style: z.enum(["educational", "storytelling", "motivational", "documentary", "anime-style"]),
  duration: z.enum(["short", "long"]),
  voice: z.enum(["male", "female", "ai_narrator"]),
  language: z.enum(["english", "hindi", "spanish"]),
  visibility: z.enum(["private", "unlisted", "public"]).default("private"),
});

// ─── Rate limiter (Upstash Redis) ─────────────────────────────────────────────
// Falls back gracefully if Upstash env vars are not set
let ratelimit: Ratelimit | null = null;
if (process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN) {
  ratelimit = new Ratelimit({
    redis: Redis.fromEnv(),
    limiter: Ratelimit.slidingWindow(5, "1 h"),
    analytics: false,
  });
}

export async function POST(req: NextRequest) {
  // Auth check
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userId = session.user.id;

  // Rate limiting
  if (ratelimit) {
    const { success, remaining } = await ratelimit.limit(userId);
    if (!success) {
      return NextResponse.json(
        { error: "Rate limit exceeded. Max 5 videos per hour." },
        { status: 429, headers: { "X-RateLimit-Remaining": String(remaining) } }
      );
    }
  }

  // Parse and validate body
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = GenerateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 422 }
    );
  }

  const { prompt, style, duration, voice, language, visibility } = parsed.data;

  // Create DB record first (so we have a jobId)
  const video = await prisma.video.create({
    data: {
      userId,
      jobId: `job_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      status: "pending",
      prompt,
      style,
      duration,
      voice,
      language,
      visibility,
    },
  });

  // Enqueue BullMQ job
  const jobData: VideoJobData = {
    jobId: video.jobId,
    userId,
    prompt,
    style,
    duration,
    voice,
    language,
    visibility,
  };

  await videoQueue.add("generate-video", jobData, {
    jobId: video.jobId,
  });

  return NextResponse.json({ jobId: video.jobId }, { status: 201 });
}
