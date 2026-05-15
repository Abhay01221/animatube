/**
 * GET /api/download/[id]
 * Returns a download URL for the final MP4.
 *
 * storageProvider drives the URL strategy:
 *   "supabase" → Supabase signed URL with Content-Disposition: attachment
 *   "s3"       → public S3 URL (no expiry)
 *   null       → legacy: fall back to videoUrl / s3VideoUrl behaviour
 */
import { NextRequest, NextResponse } from "next/server";
import { verifyIdToken } from "@/lib/firebase-admin";
import { prisma } from "@/lib/prisma";
import { getVideoDownloadUrl } from "@/lib/storage";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  // Verify Firebase token
  const authHeader = req.headers.get("Authorization");
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const token = authHeader.split("Bearer ")[1];

  let decoded;
  try {
    decoded = await verifyIdToken(token);
  } catch (error) {
    console.error("[download] Token verification failed:", error);
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Find user by Firebase UID
  const currentUser = await prisma.user.findUnique({
    where: { firebaseUid: decoded.uid },
  });

  if (!currentUser) {
    return NextResponse.json(
      { error: "User not found. Please sign in again." },
      { status: 401 }
    );
  }

  const { id } = await params;

  const video = await prisma.video.findUnique({ where: { id } });
  if (!video || video.userId !== currentUser.id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  console.log(`[download] Video record found. id=${id}`);
  console.log(`[download] storageProvider=${video.storageProvider ?? "null"}`);
  console.log(`[download] videoUrl=${video.videoUrl ?? "null"}`);
  console.log(`[download] s3Key=${video.s3Key ?? "null"}`);
  console.log(`[download] s3VideoUrl=${video.s3VideoUrl ?? "null"}`);
  console.log(`[download] status=${video.status}, renderStatus=${video.renderStatus}`);

  if (!video.videoUrl && !video.s3VideoUrl) {
    return NextResponse.json({ error: "Video URL not available" }, { status: 404 });
  }

  try {
    const url = await getVideoDownloadUrl(
      video.videoUrl ?? null,
      // For s3 provider use s3Key; for supabase/legacy use s3VideoUrl (bucket path)
      video.storageProvider === "s3" ? (video.s3Key ?? null) : (video.s3VideoUrl ?? null),
      "download",
      video.title ?? null,
      video.storageProvider ?? null
    );
    return NextResponse.json({ url });
  } catch (err) {
    console.error("[download] Failed to get download URL:", err);
    return NextResponse.json(
      { error: "Failed to generate download URL", detail: (err as Error).message },
      { status: 500 }
    );
  }
}
