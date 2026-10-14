import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "../prisma";
import { ApiError } from "../server-auth";
import { asJson, type GenerationConfig } from "./config";
import { fingerprint } from "./checkpoints";

export async function createGeneration(userId:string, config:GenerationConfig, requestKey:string) {
  if (!requestKey || requestKey.length > 100) throw new ApiError(400,"Invalid Idempotency-Key");
  try {
    return await prisma.$transaction(async tx => {
      const existing = await tx.video.findUnique({where:{userId_requestKey:{userId,requestKey}}});
      if (existing) {if(existing.deletedAt)throw new ApiError(409,"This generation is in Trash. Restore it before continuing.");if(fingerprint({...existing.generationOptions as object,channelInstructions:""})!==fingerprint({...config,channelInstructions:""}))throw new ApiError(409,"This request key was already used for different generation options");return existing;}
      if(config.channelProfileId){
        const profile=await tx.channelProfile.findFirst({where:{id:config.channelProfileId,userId}});if(!profile)throw new ApiError(404,"Channel profile not found");
        const episodes=await tx.video.findMany({where:{userId,channelProfileId:profile.id,renderStatus:"completed"},select:{title:true},take:15,orderBy:{createdAt:"desc"}});
        config={...config,channelInstructions:(`Channel profile: ${profile.name}\nApproved preferences: ${JSON.stringify(profile.settings)}\nEarlier episode titles (avoid repeating topics or contradicting established terminology): ${episodes.map(e=>e.title).filter(Boolean).join("; ")}`).slice(0,15000)};
      }
      if (config.parentVideoId && !(await tx.video.updateMany({where:{id:config.parentVideoId,userId,deletedAt:null},data:{updatedAt:new Date()}})).count) throw new ApiError(404,"Parent video not found");
      if(config.musicAsset&&!config.musicAsset.key.startsWith(`uploads/${userId}/`))throw new ApiError(422,"Music must be an authorized uploaded asset");
      const debit = await tx.user.updateMany({where:{id:userId,credits:{gte:1}},data:{credits:{decrement:1},videosGenerated:{increment:1}}});
      if (!debit.count) throw new ApiError(402,"No credits remaining. This pilot has a fixed credit allowance.");
      const hourlyCount = await tx.video.count({where:{userId,createdAt:{gte:new Date(Date.now()-3600000)}}});
      if (hourlyCount >= 5) throw new ApiError(429,"Maximum 5 new videos per hour. Resuming a saved job remains available.");
      const jobId = `job_${randomUUID()}`;
      const video = await tx.video.create({data:{userId,jobId,requestKey,prompt:config.prompt,style:config.style,duration:config.duration,voice:config.voice,language:config.language,visibility:config.visibility,tags:[],generationOptions:asJson(config),creditState:"reserved",status:"pending",renderStatus:"queued",parentVideoId:config.parentVideoId,channelProfileId:config.channelProfileId}});
      await tx.creditLedger.create({data:{userId,jobId,operationKey:`${jobId}-debit-1`,amount:-1,reason:"Generation reservation"}});
      await tx.jobOutbox.create({data:{id:`${jobId}-render-1`,jobId,kind:"render",payload:asJson({jobId,userId,queueVersion:1,renderRevision:1})}});
      return video;
    });
  } catch(error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      const existing = await prisma.video.findUnique({where:{userId_requestKey:{userId,requestKey}}});
      if(existing) {
        if(existing.deletedAt)throw new ApiError(409,"This generation is in Trash. Restore it before continuing.");
        if(fingerprint({...existing.generationOptions as object,channelInstructions:""})!==fingerprint({...config,channelInstructions:""}))throw new ApiError(409,"This request key was already used for different generation options");
        return existing;
      }
    }
    throw error;
  }
}

export async function refundFailedGeneration(jobId:string,queueVersion:number) {
  await prisma.$transaction(async tx => {
    const video = await tx.video.findUnique({where:{jobId}});
    if (!video || video.queueVersion !== queueVersion) return;
    const changed = await tx.video.updateMany({where:{jobId,queueVersion,creditState:"reserved",renderStatus:"failed"},data:{creditState:"refunded"}});
    if (!changed.count) return;
    await tx.creditLedger.create({data:{userId:video.userId,jobId,operationKey:`${jobId}-refund-${queueVersion}`,amount:1,reason:"Terminal render failure"}});
    await tx.user.update({where:{id:video.userId},data:{credits:{increment:1}}});
  });
}

export async function scheduleResume(jobId:string,userId:string,expectedRevision?:number,expectedAdditionalCredits?:number) {
  return prisma.$transaction(async tx => {
    const video=await tx.video.findFirst({where:{jobId,userId,deletedAt:null}});
    if(!video) throw new ApiError(404,"Job not found");
    if(expectedRevision!==undefined && video.renderRevision!==expectedRevision) throw new ApiError(409,"Storyboard changed; reload before resuming.");
    if(expectedAdditionalCredits!==undefined&&expectedAdditionalCredits!==(video.creditState==="refunded"?1:0))throw new ApiError(409,"Credit state changed. Review the current resume cost before continuing.");
    if(video.renderStatus==="completed") throw new ApiError(409,"This render is already completed.");
    if(video.renderStatus==="awaiting_approval" && video.approvedRevision!==video.renderRevision) throw new ApiError(409,"Approve the storyboard before resuming.");
    if(video.executionLease && video.executionLease>new Date()) throw new ApiError(409,"Generation is already running.");
    if(video.renderStatus==="queued") return video;
    const nextVersion=video.queueVersion+1;
    const claimed=await tx.video.updateMany({where:{id:video.id,queueVersion:video.queueVersion,deletedAt:null,OR:[{executionLease:null},{executionLease:{lt:new Date()}}]},data:{queueVersion:nextVersion,renderStatus:"queued",status:"pending",renderError:null,executionToken:null,executionLease:null,creditState:video.creditState==="refunded"?"reserved":video.creditState}});
    if(!claimed.count) throw new ApiError(409,"A resume is already being scheduled.");
    if(video.creditState==="refunded") {
      const debit=await tx.user.updateMany({where:{id:userId,credits:{gte:1}},data:{credits:{decrement:1}}});
      if(!debit.count) throw new ApiError(402,"Resume needs the one credit previously refunded after failure.");
      await tx.creditLedger.create({data:{userId,jobId,operationKey:`${jobId}-debit-${nextVersion}`,amount:-1,reason:"Re-reserve refunded generation credit"}});
    }
    await tx.jobOutbox.create({data:{id:`${jobId}-render-${nextVersion}`,jobId,kind:"render",payload:asJson({jobId,userId,queueVersion:nextVersion,renderRevision:video.renderRevision})}});
    return {...video,queueVersion:nextVersion,renderStatus:"queued"};
  });
}
