import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser,apiError,ApiError } from "@/lib/server-auth";
import { prisma } from "@/lib/prisma";
import { uploadToS3,getPresignedUrl,downloadFromS3 } from "@/lib/s3";
import { renderThumbnail } from "@/lib/generation/thumbnails";
import { uploadThumbnail } from "@/lib/youtube";
export async function POST(req:Request,{params}:{params:Promise<{id:string}>}){
  try{const user=await requireUser(req);const {id}=await params;const video=await prisma.video.findFirst({where:{id,userId:user.id,deletedAt:null}});if(!video)throw new ApiError(404,"Video not found");let body:unknown;try{body=await req.json();}catch{throw new ApiError(400,"Invalid JSON body");}
    const parsed=z.object({title:z.string().trim().min(1).max(150).optional(),style:z.enum(["bold","clean","cinematic"]).default("bold"),publish:z.boolean().default(false)}).safeParse(body);if(!parsed.success)throw new ApiError(422,"Invalid thumbnail options");
    if(parsed.data.publish){if(!video.youtubeId||!video.thumbnailKey)throw new ApiError(409,"Choose a thumbnail and publish the video first");await uploadThumbnail(user.id,video.youtubeId,await downloadFromS3(video.thumbnailKey));return NextResponse.json({published:true});}
    const key=`uploads/${user.id}/thumbnails/${randomUUID()}.png`;await uploadToS3(key,renderThumbnail(parsed.data.title??video.title??"New video",parsed.data.style),"image/png");
    const url=await getPresignedUrl(key,3600);await prisma.video.update({where:{id},data:{thumbnailKey:key,thumbnailUrl:null}});return NextResponse.json({url});
  }catch(error){return apiError(error);}
}
