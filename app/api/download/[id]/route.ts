import { NextRequest, NextResponse } from "next/server";
import { requireUser, apiError, ApiError } from "@/lib/server-auth";
import { prisma } from "@/lib/prisma";
import { assetFromVideo, getAssetUrl,verifyAsset } from "@/lib/assets";
import { createDownloadTicket } from "@/lib/download-ticket";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser(req);
    const { id } = await params;
    const video = await prisma.video.findFirst({ where: { id, userId: user.id, deletedAt:null } });
    if (!video) throw new ApiError(404, "Video not found");
    if (video.renderStatus !== "completed") throw new ApiError(409, "Video is not ready yet");
    const asset = assetFromVideo(video);
    if (!asset) throw new ApiError(404, "Video storage reference unavailable");
    if(!await verifyAsset(asset))throw new ApiError(404,"The saved video file is missing. Open the video workspace to recover it.");
    const mode = req.nextUrl.searchParams.get("mode");
    const url = mode==="stream"?await getAssetUrl(asset,300):`/api/download/${encodeURIComponent(id)}/file?ticket=${encodeURIComponent(createDownloadTicket(user.id,id,video.renderRevision))}`;
    return NextResponse.json({ url, expiresIn: 300 }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return apiError(error); }
}
