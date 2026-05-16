/**
 * GET /api/jobs/[jobId]
 * Polling fallback for SSE — returns current job status and stage progress.
 */
import { NextRequest, NextResponse } from "next/server";
import { verifyIdToken } from "@/lib/firebase-admin";
import { prisma } from "@/lib/prisma";
import { getRedisClient } from "@/lib/redis";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ jobId: string }> }
) {
  const { jobId } = await params;
  console.log("[jobs-api] Request for jobId:", jobId);

  // Verify Firebase token
  const authHeader = req.headers.get("Authorization");
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    console.error("[jobs-api] Missing or invalid Authorization header");
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const token = authHeader.split("Bearer ")[1];
  console.log("[jobs-api] Token present, length:", token.length);
  
  let decoded;
  try {
    decoded = await verifyIdToken(token);
    console.log("[jobs-api] Token verified for Firebase UID:", decoded.uid);
  } catch (error) {
    console.error("[jobs-api] Token verification failed:", error);
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Find user by Firebase UID
  const currentUser = await prisma.user.findUnique({
    where: { firebaseUid: decoded.uid },
  });

  if (!currentUser) {
    console.error("[jobs-api] User not found for Firebase UID:", decoded.uid);
    return NextResponse.json(
      { error: "User not found. Please sign in again." },
      { status: 401 }
    );
  }

  console.log("[jobs-api] User found:", currentUser.email, "ID:", currentUser.id);

  const video = await prisma.video.findUnique({ where: { jobId } });
  if (!video) {
    console.error("[jobs-api] Video not found for jobId:", jobId);
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (video.userId !== currentUser.id) {
    console.error("[jobs-api] Job ownership mismatch. Video userId:", video.userId, "Current user:", currentUser.id);
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  console.log("[jobs-api] Job found, status:", video.status, "renderStatus:", video.renderStatus);

  // Read progress events from Redis (use singleton client)
  const redis = getRedisClient();
  const events = await redis.lrange(`progress:${jobId}`, 0, -1);
  // DO NOT call redis.quit() - singleton is reused

  const stages = events.map((e) => {
    try {
      return JSON.parse(e);
    } catch {
      return null;
    }
  }).filter(Boolean);

  console.log("[jobs-api] Returning", stages.length, "stages");

  return NextResponse.json({
    id: video.id,
    jobId,
    status: video.status,
    renderStatus: video.renderStatus,
    uploadStatus: video.uploadStatus,
    title: video.title,
    youtubeUrl: video.youtubeUrl,
    youtubeId: video.youtubeId,
    videoUrl: video.videoUrl ?? null,
    storageProvider: video.storageProvider ?? null,
    s3VideoUrl: video.s3VideoUrl ?? null,
    renderError: video.renderError,
    uploadError: video.uploadError,
    stages,
  });
}
