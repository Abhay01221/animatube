/**
 * POST /api/generate
 * Validates input, checks credits, creates a BullMQ job, returns jobId.
 * Rate limited to 5 requests/hour per user.
 * Deducts 1 credit atomically to prevent race conditions.
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { verifyIdToken } from "@/lib/firebase-admin";
import { videoQueue, type VideoJobData } from "@/lib/queue";
import { prisma } from "@/lib/prisma";
import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

// ─── Input validation schema ──────────────────────────────────────────────────
const GenerateSchema = z.object({
  prompt: z.string().min(10, "Prompt must be at least 10 characters").max(20000),
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
  // Firebase token verification
  const authHeader = req.headers.get("Authorization");
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const token = authHeader.split("Bearer ")[1];
  
  let decoded;
  try {
    decoded = await verifyIdToken(token);
  } catch (error) {
    console.error("[generate] Token verification failed:", error);
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Find user by Firebase UID
  const user = await prisma.user.findUnique({
    where: { firebaseUid: decoded.uid },
  });

  if (!user) {
    return NextResponse.json(
      { error: "User not found. Please sign in again." },
      { status: 401 }
    );
  }

  const userId = user.id;

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

  // Credit check and deduction (atomic transaction to prevent race conditions)
  try {
    await prisma.$transaction(async (tx) => {
      const user = await tx.user.findUnique({
        where: { id: userId },
        select: { credits: true },
      });

      if (!user || user.credits <= 0) {
        throw new Error("NO_CREDITS");
      }

      // Deduct credit atomically
      await tx.user.update({
        where: { id: userId },
        data: {
          credits: { decrement: 1 },
          videosGenerated: { increment: 1 },
        },
      });
    });
  } catch (error: any) {
    if (error.message === "NO_CREDITS") {
      return NextResponse.json(
        { error: "No credits remaining" },
        { status: 402 }
      );
    }
    throw error;
  }

  // Create DB record (so we have a jobId)
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
