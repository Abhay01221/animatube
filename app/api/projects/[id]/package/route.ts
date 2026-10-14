import { NextResponse } from "next/server";
import { requireUser,apiError,ApiError } from "@/lib/server-auth";
import { prisma } from "@/lib/prisma";
import { readManifest } from "@/lib/generation/checkpoints";
import { configFromVideo } from "@/lib/generation/config";
import { assetFromVideo,getAssetUrl } from "@/lib/assets";
export async function GET(req:Request,{params}:{params:Promise<{id:string}>}){
  try{const user=await requireUser(req);const {id}=await params;const video=await prisma.video.findFirst({where:{id,userId:user.id,deletedAt:null}});if(!video)throw new ApiError(404,"Video not found");if(video.renderStatus!=="completed")throw new ApiError(409,"Complete rendering to export the publication package");
    const config=configFromVideo(video),manifest=readManifest(video.generationManifest),captions=manifest.stages.captions?.output?.data as {srtKey?:string;vttKey?:string}|undefined,asset=assetFromVideo(video);
    const signed=async(key?:string)=>key?getAssetUrl({provider:"s3",key},300):null;
    return NextResponse.json({title:video.title,description:video.description,tags:video.tags,language:video.language,visibility:video.visibility,renderRevision:video.renderRevision,videoUrl:asset?await getAssetUrl(asset,300):null,captions:{srt:await signed(captions?.srtKey),vtt:await signed(captions?.vttKey)},sources:config.sources,storyboard:video.storyboard,channelProfileId:video.channelProfileId,parentVideoId:video.parentVideoId,expiresInSeconds:300});
  }catch(error){return apiError(error);}
}
