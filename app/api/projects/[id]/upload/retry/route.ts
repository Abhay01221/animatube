/**
 * POST /api/projects/:id/upload/retry
 * 
 * Retry a failed YouTube upload.
 * Does NOT re-render the video.
 */
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { uploadQueue } from "@/lib/queue";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: projectId } = await params;
    const session = await auth();
    if (!session?.user?.email) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Find the video project
    const video = await prisma.video.findFirst({
      where: {
        id: projectId,
        user: { email: session.user.email },
      },
    });

    if (!video) {
      return NextResponse.json({ error: "Video not found" }, { status: 404 });
    }

    // Check if render is complete
    if (video.renderStatus !== "completed") {
      return NextResponse.json(
        { error: "Video rendering must be completed before upload" },
        { status: 400 }
      );
    }

    // Check if local file exists
    if (!video.localFilePath) {
      return NextResponse.json(
        { error: "Local video file not found" },
        { status: 400 }
      );
    }

    // Check if upload actually failed
    if (video.uploadStatus !== "failed") {
      return NextResponse.json(
        { error: "Can only retry failed uploads" },
        { status: 400 }
      );
    }

    // Queue the upload job (fresh attempt)
    await uploadQueue.add("upload-video-retry", {
      jobId: video.jobId,
      userId: video.userId,
      localFilePath: video.localFilePath,
      title: video.title || "Untitled Video",
      description: video.description || "",
      tags: video.tags || [],
      visibility: video.visibility,
    });

    // Update status to queued
    await prisma.video.update({
      where: { id: projectId },
      data: { 
        uploadStatus: "queued",
        uploadError: null, // Clear previous error
      },
    });

    return NextResponse.json({
      message: "Upload retry queued successfully",
      uploadStatus: "queued",
      previousError: video.uploadError,
    });

  } catch (error) {
    console.error("[Upload Retry API] Error:", error);
    return NextResponse.json(
      { error: "Failed to queue upload retry" },
      { status: 500 }
    );
  }
}
