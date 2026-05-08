/**
 * GET /api/dashboard
 * Returns the authenticated user's video history.
 */
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(_req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const videos = await prisma.video.findMany({
    where: { userId: session.user.id },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      jobId: true,
      status: true,
      prompt: true,
      style: true,
      duration: true,
      title: true,
      youtubeId: true,
      youtubeUrl: true,
      s3VideoUrl: true,
      errorMessage: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  // Stats
  const now = new Date();
  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const thisWeek = videos.filter((v: { createdAt: Date }) => new Date(v.createdAt) >= weekAgo).length;
  const completed = videos.filter((v: { status: string }) => v.status === "completed").length;

  return NextResponse.json({
    videos,
    stats: {
      total: videos.length,
      thisWeek,
      completed,
      failed: videos.filter((v: { status: string }) => v.status === "failed").length,
    },
  });
}
