/**
 * GET /api/jobs/[jobId]
 * Polling fallback for SSE — returns current job status and stage progress.
 */
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { createRedisConnection } from "@/lib/redis";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ jobId: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { jobId } = await params;

  const video = await prisma.video.findUnique({ where: { jobId } });
  if (!video || video.userId !== session.user.id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Read progress events from Redis
  const redis = createRedisConnection();
  const events = await redis.lrange(`progress:${jobId}`, 0, -1);
  await redis.quit();

  const stages = events.map((e) => {
    try {
      return JSON.parse(e);
    } catch {
      return null;
    }
  }).filter(Boolean);

  return NextResponse.json({
    id: video.id,
    jobId,
    status: video.status,
    renderStatus: video.renderStatus,
    uploadStatus: video.uploadStatus,
    title: video.title,
    youtubeUrl: video.youtubeUrl,
    youtubeId: video.youtubeId,
    s3VideoUrl: video.s3VideoUrl,
    renderError: video.renderError,
    uploadError: video.uploadError,
    stages,
  });
}
