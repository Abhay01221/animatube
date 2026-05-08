/**
 * GET /api/download/[id]
 * Returns a presigned S3 URL for downloading the final MP4.
 */
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getPresignedUrl } from "@/lib/s3";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  const video = await prisma.video.findUnique({ where: { id } });
  if (!video || video.userId !== session.user.id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (!video.s3VideoUrl) {
    return NextResponse.json({ error: "Video not ready" }, { status: 400 });
  }

  // Generate a 1-hour presigned URL
  const url = await getPresignedUrl(video.s3VideoUrl, 3600);
  return NextResponse.json({ url });
}
