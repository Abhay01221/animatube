/**
 * GET /api/dashboard
 * Returns the authenticated user's video history with granular status.
 */
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getFileSize } from "@/lib/local-storage";

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
      status: true, // Legacy field
      renderStatus: true,
      uploadStatus: true,
      subtitlesAdded: true,
      prompt: true,
      style: true,
      duration: true,
      title: true,
      localFilePath: true,
      youtubeId: true,
      youtubeUrl: true,
      s3VideoUrl: true,
      renderError: true,
      uploadError: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  // Enhance with file size and download URL
  const enhancedVideos = videos.map((video) => {
    const fileSizeMB = video.localFilePath ? getFileSize(video.jobId) : null;
    const fileSizeFormatted = fileSizeMB 
      ? `${(fileSizeMB / 1024 / 1024).toFixed(2)} MB`
      : null;

    return {
      ...video,
      fileSizeMB: fileSizeMB ? fileSizeMB / 1024 / 1024 : null,
      fileSizeFormatted,
      downloadUrl: video.renderStatus === "completed" && video.localFilePath
        ? `/api/projects/${video.id}/download`
        : null,
    };
  });

  // Stats
  const now = new Date();
  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const thisWeek = enhancedVideos.filter((v) => new Date(v.createdAt) >= weekAgo).length;
  const renderCompleted = enhancedVideos.filter((v) => v.renderStatus === "completed").length;
  const uploaded = enhancedVideos.filter((v) => v.uploadStatus === "uploaded").length;

  return NextResponse.json({
    videos: enhancedVideos,
    stats: {
      total: enhancedVideos.length,
      thisWeek,
      renderCompleted,
      uploaded,
      renderFailed: enhancedVideos.filter((v) => v.renderStatus === "failed").length,
      uploadFailed: enhancedVideos.filter((v) => v.uploadStatus === "failed").length,
    },
  });
}
