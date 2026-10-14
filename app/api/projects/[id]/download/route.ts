import { NextResponse } from "next/server";
import { Readable } from "node:stream";
import { requireUser, apiError, ApiError } from "@/lib/server-auth";
import { prisma } from "@/lib/prisma";
import { assetFromVideo, openAssetStream } from "@/lib/assets";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser(req);
    const { id } = await params;
    const video = await prisma.video.findFirst({ where: { id, userId: user.id, deletedAt:null } });
    if (!video) throw new ApiError(404, "Video not found");
    if (video.renderStatus !== "completed") throw new ApiError(409, "Video is not ready yet");
    const asset = assetFromVideo(video);
    if (!asset) throw new ApiError(404, "Video storage reference unavailable");
    const filename = `${(video.title || "video").replace(/[^a-z0-9_\-.]/gi, "_").slice(0, 120)}.mp4`;
    const stream = await openAssetStream(asset);
    return new NextResponse(Readable.toWeb(stream) as ReadableStream, { headers: {
      "Content-Type": "video/mp4", "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff",
    } });
  } catch (error) { return apiError(error); }
}
