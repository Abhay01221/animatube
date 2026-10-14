import { Readable } from "node:stream";
import { NextRequest,NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { readDownloadTicket } from "@/lib/download-ticket";
import { assetFromVideo,openAssetStream } from "@/lib/assets";
import { ApiError,apiError } from "@/lib/server-auth";
export const runtime="nodejs";
export async function GET(req:NextRequest,{params}:{params:Promise<{id:string}>}){
  try{
    const {id}=await params;let ticket;
    try{ticket=readDownloadTicket(req.nextUrl.searchParams.get("ticket")??"",id);}catch{throw new ApiError(410,"Download link expired. Return to Animatube and click Download again.");}
    const video=await prisma.video.findFirst({where:{id,userId:ticket.userId,deletedAt:null,renderRevision:ticket.revision,renderStatus:"completed"}});
    if(!video)throw new ApiError(404,"This completed video is unavailable");
    const asset=assetFromVideo(video);if(!asset)throw new ApiError(404,"Video storage reference unavailable");
    const stream=await openAssetStream(asset);
    const filename=`${(video.title??"video").replace(/[^a-z0-9_\-.]/gi,"_").slice(0,120)}.mp4`;
    return new NextResponse(Readable.toWeb(stream) as ReadableStream<Uint8Array>,{headers:{"Content-Type":"video/mp4","Content-Disposition":`attachment; filename="${filename}"`,"Cache-Control":"private, no-store","Referrer-Policy":"no-referrer","X-Content-Type-Options":"nosniff"}});
  }catch(error){return apiError(error);}
}
