import { prisma } from "../prisma";
import { ApiError } from "../server-auth";
import { assetFromVideo, deleteAsset, listAssetPrefix, validateAssetRef, type AssetRef } from "../assets";
import { asJson } from "./config";
import { readManifest } from "./checkpoints";
import type { Video } from "@prisma/client";

interface DeletionPlan { videoId:string; userId:string; jobId:string; assets:AssetRef[]; discovered:boolean }
const taskId = (jobId:string) => `${jobId}-purge`;
const identity = (asset:AssetRef) => `${asset.provider}:${asset.key}`;
const unique = (assets:AssetRef[]) => [...new Map(assets.map(asset=>[identity(asset),asset])).values()];
const isDeleting = (status:string) => status === "deleting";

function projectReferences(video:Video):AssetRef[] {
  const found:AssetRef[]=[];
  const visit=(value:unknown):void=>{
    if(!value || typeof value!=="object") return;
    if(Array.isArray(value)){value.forEach(visit);return;}
    const item=value as Record<string,unknown>;
    const key=typeof item.key==="string"?item.key:typeof item.s3Key==="string"?item.s3Key:null;
    if(key && (item.provider==="s3" || item.provider==="supabase" || typeof item.s3Key==="string")){
      const ref:AssetRef={provider:item.provider==="supabase"?"supabase":"s3",key};
      validateAssetRef(ref);found.push(ref);
    }
    Object.values(item).forEach(visit);
  };
  visit(video.generationManifest);visit(video.scriptJson);visit(video.generationOptions);visit(video.scenes);
  const final=assetFromVideo(video);if(final)found.push(final);
  for(const key of [video.s3VoiceUrl,video.s3RawVideoUrl,video.thumbnailKey]){
    if(key && !/^https?:/i.test(key)){const ref:AssetRef={provider:"s3",key};validateAssetRef(ref);found.push(ref);}
  }
  return unique(found);
}
function ownedAsset(video:Video,asset:AssetRef):boolean {
  // Uploaded source material/music is reusable. Only a dedicated generated thumbnail is owned here.
  if(asset.key===video.thumbnailKey && asset.key.startsWith(`uploads/${video.userId}/thumbnails/`)) return true;
  return asset.key.startsWith(`jobs/${video.jobId}/`) || asset.key.startsWith(`jobs/${video.jobId}_r`) ||
    asset.key.startsWith(`videos/${video.jobId}/`) || asset.key===`videos/${video.jobId}.mp4`;
}

export async function requestPermanentDeletion(id:string,userId:string){
  const outboxId=await prisma.$transaction(async tx=>{
    const video=await tx.video.findFirst({where:{id,userId}});
    if(!video) throw new ApiError(404,"Video not found");
    if(!video.deletedAt) throw new ApiError(409,"Move this video to Trash before permanently deleting it.");
    if(isDeleting(video.renderStatus)) return taskId(video.jobId);
    const children=await tx.video.findMany({where:{parentVideoId:id,userId}});
    if(children.some(child=>(child.generationOptions as {variantKind?:string}|null)?.variantKind==="translation" && readManifest(child.generationManifest).stages.script?.status!=="completed"))
      throw new ApiError(409,"A translation still needs this video's storyboard. Finish or permanently delete that translation first.");
    const claimed=await tx.video.updateMany({where:{id,userId,deletedAt:{not:null},renderStatus:{equals:video.renderStatus,notIn:["queued","processing","retrying"]},uploadStatus:{notIn:["queued","uploading","processing","retrying"]},OR:[{executionLease:null},{executionLease:{lt:new Date()}}]},data:{renderStatus:"deleting",renderError:null,executionToken:null,executionLease:null}});
    if(!claimed.count) throw new ApiError(409,"This video changed or still has active work. Refresh Trash and try again.");
    const plan:DeletionPlan={videoId:id,userId,jobId:video.jobId,assets:projectReferences(video).filter(ref=>ownedAsset(video,ref)),discovered:false};
    await tx.jobOutbox.create({data:{id:taskId(video.jobId),jobId:video.jobId,kind:"purge",payload:asJson(plan)}});
    // Old deliveries are harmless, but do not dispatch more queued work for this project.
    await tx.jobOutbox.updateMany({where:{jobId:video.jobId,kind:{not:"purge"},status:"pending"},data:{status:"cancelled",leaseUntil:null}});
    return taskId(video.jobId);
  });
  return processPermanentDeletion(outboxId,true);
}

/** Durable, idempotent cleanup. A failed request remains in Trash and the worker retries it. */
export async function processPermanentDeletion(id:string,manual=false):Promise<{deleted:boolean;pending:boolean;sharedAssets:number}> {
  const row=await prisma.jobOutbox.findUnique({where:{id}});
  if(!row || row.kind!=="purge") throw new Error("Deletion task not found");
  if(row.status==="sent") return {deleted:true,pending:false,sharedAssets:0};
  const plan=row.payload as unknown as DeletionPlan;
  const now=new Date();let lease=new Date(Date.now()+10*60*1000);
  const claimed=await prisma.jobOutbox.updateMany({where:{id,OR:[{status:"pending",...(manual?{}:{OR:[{leaseUntil:null},{leaseUntil:{lt:now}}]})},{status:"dispatching",leaseUntil:{lt:now}}]},data:{status:"dispatching",leaseUntil:lease,attempts:{increment:1}}});
  if(!claimed.count) return {deleted:false,pending:true,sharedAssets:0};
  try {
    if(!plan.discovered){
      const discovered:AssetRef[]=[];
      if(process.env.AWS_S3_BUCKET) for(const prefix of [`jobs/${plan.jobId}/`,`jobs/${plan.jobId}_r`,`videos/${plan.jobId}/`]) discovered.push(...await listAssetPrefix("s3",prefix));
      if(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY) discovered.push(...await listAssetPrefix("supabase",`videos/${plan.jobId}/`));
      plan.assets=unique([...plan.assets,...discovered]);plan.discovered=true;
      await prisma.jobOutbox.updateMany({where:{id,status:"dispatching",leaseUntil:lease},data:{payload:asJson(plan)}});
    }
    // Include active and trashed projects: both may need these clips again. Match exact keys,
    // also inside channel/user settings, rather than ever deleting a user's uploads directory.
    const [videos,profiles,account]=await Promise.all([
      prisma.video.findMany({where:{id:{not:plan.videoId}}}),prisma.channelProfile.findMany(),
      prisma.user.findMany({select:{settings:true}}),
    ]);
    const references=JSON.stringify([...videos,...profiles.map(profile=>profile.settings),...account.map(user=>user.settings)]);
    const remaining:AssetRef[]=[];
    for(const asset of plan.assets){
      if(references.includes(JSON.stringify(asset.key))){remaining.push(asset);continue;}
      await deleteAsset(asset);
      // Renew the claim between objects; no other worker may finish this cleanup concurrently.
      const nextLease=new Date(Date.now()+10*60*1000);
      const renewed=await prisma.jobOutbox.updateMany({where:{id,status:"dispatching",leaseUntil:lease},data:{leaseUntil:nextLease}});
      if(!renewed.count) throw new Error("Deletion ownership changed");
      lease=nextLease;
    }
    await prisma.$transaction(async tx=>{
      const owned=await tx.jobOutbox.updateMany({where:{id,status:"dispatching",leaseUntil:lease},data:{lastError:null}});
      if(!owned.count)throw new Error("Deletion ownership changed");
      await tx.video.deleteMany({where:{id:plan.videoId,userId:plan.userId,deletedAt:{not:null},renderStatus:"deleting"}});
      await tx.jobOutbox.update({where:{id},data:remaining.length?
        {status:"pending",leaseUntil:new Date(Date.now()+60000),lastError:null,payload:asJson({...plan,assets:remaining})}:
        {status:"sent",leaseUntil:null,lastError:null,dispatchedAt:new Date(),payload:{}}});
    });
    return {deleted:true,pending:false,sharedAssets:remaining.length};
  } catch(error) {
    const details=error as {code?:string;$metadata?:{httpStatusCode?:number}};
    console.error("[PermanentDeletion] Cleanup will retry",{name:error instanceof Error?error.name:"UnknownError",code:details?.code,status:details?.$metadata?.httpStatusCode});
    await prisma.$transaction(async tx=>{
      await tx.jobOutbox.updateMany({where:{id,status:"dispatching",leaseUntil:lease},data:{status:"pending",leaseUntil:new Date(Date.now()+60000),lastError:"Cloud cleanup interrupted; retry scheduled."}});
      await tx.video.updateMany({where:{id:plan.videoId,userId:plan.userId,renderStatus:"deleting"},data:{renderError:"Cloud deletion is pending. Cleanup will retry automatically; you can also retry here."}});
    });
    return {deleted:false,pending:true,sharedAssets:0};
  }
}
