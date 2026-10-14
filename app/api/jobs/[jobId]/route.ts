import { NextResponse } from "next/server";
import { requireUser,apiError } from "@/lib/server-auth";
import { ownedVideo,canResumeVideo } from "@/lib/generation/access";
import { progressStages,publicManifest } from "@/lib/generation/status";
import { assetFromVideo,getAssetUrl } from "@/lib/assets";
import { fingerprint } from "@/lib/generation/checkpoints";
export async function GET(req:Request,{params}:{params:Promise<{jobId:string}>}){
  try{
    const user=await requireUser(req);const {jobId}=await params;const video=await ownedVideo(jobId,user.id);
    const asset=assetFromVideo(video);let videoUrl:string|null=null;
    if(video.renderStatus==="completed"&&asset)try{videoUrl=await getAssetUrl(asset,3600);}catch{ /* A temporary playback outage does not erase saved progress. */ }
    const renderStatus=video.renderStatus==="processing"&&video.executionLease&&video.executionLease<new Date()?"interrupted":video.renderStatus;
    return NextResponse.json({id:video.id,jobId,status:video.status,renderStatus,uploadStatus:video.uploadStatus,title:video.title,youtubeId:video.youtubeId,youtubeUrl:video.youtubeUrl,visibility:video.visibility,videoUrl,playbackKey:fingerprint({asset,revision:video.renderRevision}),renderError:video.renderError,uploadError:video.uploadError,createdAt:video.createdAt,updatedAt:video.updatedAt,credits:user.credits,resumeAvailable:canResumeVideo(video),renderRevision:video.renderRevision,approvedRevision:video.approvedRevision,generationManifest:publicManifest(video.generationManifest),stages:progressStages(video.generationManifest,video.renderStatus)});
  }catch(error){return apiError(error);}
}
