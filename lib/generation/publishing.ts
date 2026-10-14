import { randomUUID } from "node:crypto";
import { prisma } from "../prisma";
import { ApiError } from "../server-auth";
import { assetFromVideo,verifyAsset } from "../assets";
import { asJson } from "./config";
export async function queueVideoUpload(id:string,userId:string,visibility?:string){
  const video=await prisma.video.findFirst({where:{id,userId,deletedAt:null}});
  if(!video)throw new ApiError(404,"Video not found");
  if(video.renderStatus!=="completed")throw new ApiError(409,"Complete rendering before publishing");
  const user=await prisma.user.findUnique({where:{id:userId},select:{youtubeTokens:true}});
  if(!user?.youtubeTokens)throw new ApiError(409,"Connect YouTube in Settings before publishing");
  if(video.youtubeId)return {jobId:video.jobId,uploadStatus:"uploaded",youtubeUrl:video.youtubeUrl};
  if(["queued","uploading","retrying"].includes(video.uploadStatus))return {jobId:video.jobId,uploadStatus:video.uploadStatus};
  const asset=assetFromVideo(video);
  if(!asset||!await verifyAsset(asset))throw new ApiError(409,"The completed video asset is unavailable");
  const result=await prisma.$transaction(async tx=>{
    const changed=await tx.video.updateMany({where:{id,userId,deletedAt:null,renderStatus:"completed",renderRevision:video.renderRevision,uploadStatus:video.uploadStatus},data:{uploadStatus:"queued",uploadError:null,visibility:visibility??video.visibility}});
    if(!changed.count)throw new ApiError(409,"Publishing state changed; refresh and try again");
    await tx.jobOutbox.create({data:{id:`${video.jobId}-upload-${randomUUID()}`,jobId:video.jobId,kind:"upload",payload:asJson({jobId:video.jobId,userId,asset,title:video.title??"Untitled video",description:video.description??"",tags:video.tags,visibility:visibility??video.visibility,language:video.language,renderRevision:video.renderRevision})}});
    return {jobId:video.jobId,uploadStatus:"queued"};
  });
  return result;
}
