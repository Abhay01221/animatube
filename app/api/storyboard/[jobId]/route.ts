/**
 * GET /api/storyboard/[jobId]
 * Returns storyboard preview for a job before final rendering.
 * Allows users to review and potentially edit scenes before processing.
 */
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import type { Storyboard, StoryboardScene } from "@/lib/types/cinematic";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ jobId: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { jobId } = await params;

  // Fetch video record
  const video = await prisma.video.findUnique({
    where: { jobId },
  });

  if (!video) {
    return NextResponse.json({ error: "Job not found" }, { status: 404 });
  }

  // Check ownership
  if (video.userId !== session.user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Check if storyboard data exists
  if (!video.storyboard) {
    return NextResponse.json(
      { error: "Storyboard not yet generated" },
      { status: 404 }
    );
  }

  return NextResponse.json(video.storyboard);
}

/**
 * POST /api/storyboard/[jobId]
 * Update storyboard scenes (for future editing feature)
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ jobId: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { jobId } = await params;

  // Fetch video record
  const video = await prisma.video.findUnique({
    where: { jobId },
  });

  if (!video) {
    return NextResponse.json({ error: "Job not found" }, { status: 404 });
  }

  // Check ownership
  if (video.userId !== session.user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Parse updated storyboard
  let updatedStoryboard: Storyboard;
  try {
    updatedStoryboard = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  // Update storyboard in database
  await prisma.video.update({
    where: { jobId },
    data: { storyboard: updatedStoryboard as any },
  });

  return NextResponse.json({ success: true });
}
