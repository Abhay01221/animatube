import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { requireUser,apiError,ApiError } from "@/lib/server-auth";
import { prisma } from "@/lib/prisma";
import { ownedVideo } from "@/lib/generation/access";
import { storyboardEditSchema,applyStoryboard } from "@/lib/generation/storyboard";
import { asJson,configFromVideo } from "@/lib/generation/config";
import { fingerprint,readManifest } from "@/lib/generation/checkpoints";
import { getAssetUrl } from "@/lib/assets";
import { sceneScriptSchema } from "@/lib/cinematic/schemas";
type Context={params:Promise<{jobId:string}>};
export async function GET(req:Request,context:Context){
  try{
    const user=await requireUser(req);const {jobId}=await context.params;const video=await ownedVideo(jobId,user.id);
    if(!video.storyboard||!video.scriptJson)throw new ApiError(404,"Storyboard has not been generated yet");
    const script=sceneScriptSchema.parse(video.scriptJson);const manifest=readManifest(video.generationManifest);
    const channel=video.channelProfileId?await prisma.channelProfile.findFirst({where:{id:video.channelProfileId,userId:user.id}}):null;
    const approvedAssets=(channel?.settings as {approvedAssets?:unknown[]}|null)?.approvedAssets??[];
    const scenes=await Promise.all(script.scenes.map(async(scene,index)=>{
      const visual=manifest.sceneCache.visuals.find(c=>(c as {scene?:{scene_id?:number}}).scene?.scene_id===scene.scene_id) as {s3Key?:string;type?:string;placeholder?:boolean}|undefined;
      const audio=manifest.sceneCache.voice.find(c=>(c as {sceneIndex?:number}).sceneIndex===index) as {s3Key?:string}|undefined;
      const signed=async(key?:string)=>{if(!key)return undefined;try{return await getAssetUrl({provider:"s3",key},3600);}catch{return undefined;}};
      const url=await signed(visual?.s3Key);
      return {...scene,narration_preview:scene.narration,estimated_duration:scene.duration_seconds,camera_notes:scene.camera_direction,editable:true,audio_url:await signed(audio?.s3Key),thumbnail_url:visual?.type==="image"?url:undefined,visual_url:visual?.type==="clip"?url:undefined,placeholder:visual?.placeholder??false,sourceStatus:scene.source_references?.length?"Review source references":"No source reference supplied"};
    }));
    return NextResponse.json({storyboard:{job_id:jobId,scenes,total_duration:scenes.reduce((n,s)=>n+s.estimated_duration,0),overall_style:configFromVideo(video).visualStyle,title:script.title,description:script.description,tags:script.tags},revision:video.renderRevision,approvedRevision:video.approvedRevision,additionalCredits:["refunded","consumed"].includes(video.creditState)?1:0,sources:configFromVideo(video).sources,approvedAssets});
  }catch(error){return apiError(error);}
}
export async function POST(req:Request,context:Context){
  try{
    const user=await requireUser(req);const {jobId}=await context.params;const video=await ownedVideo(jobId,user.id);
    let body:unknown;try{body=await req.json();}catch{throw new ApiError(400,"Invalid JSON body");}
    const parsed=storyboardEditSchema.safeParse(body);if(!parsed.success)return NextResponse.json({error:"Invalid storyboard",details:parsed.error.flatten()},{status:422});
    const edit=parsed.data;
    const additionalCredits=["refunded","consumed"].includes(video.creditState)?1:0;
    if(edit.approve&&edit.expectedAdditionalCredits!==additionalCredits)throw new ApiError(409,"Review the current approval cost before continuing");
    if(video.executionLease&&video.executionLease>new Date()||["queued","retrying"].includes(video.renderStatus)||["queued","uploading","retrying"].includes(video.uploadStatus))throw new ApiError(409,"Generation or publishing is active. Your edits can be saved after it pauses or finishes.");
    let script;try{script=applyStoryboard(video.scriptJson,edit.storyboard.scenes,user.id,jobId);}catch(error){throw new ApiError(422,error instanceof Error?error.message:"Invalid scenes");}
    const config={...configFromVideo(video),...(edit.sources?{sources:edit.sources}:{})};
    for(const scene of script.scenes)for(const ref of scene.source_references??[]){const source=config.sources.find(s=>s.id===ref.sourceId);if(!source||!source.text.includes(ref.passage)||!ref.passage.trim())throw new ApiError(422,"Source references must quote a passage from an approved source");}
    script={...script,title:edit.title??script.title,description:edit.description??script.description,tags:edit.tags??script.tags};
    const changed=fingerprint(script)!==fingerprint(video.scriptJson)||edit.regenerateSceneId!==undefined||fingerprint(config.sources)!==fingerprint(configFromVideo(video).sources);
    const revision=video.renderRevision+(changed?1:0);
    const manifest=readManifest(video.generationManifest);
    if(edit.regenerateSceneId!==undefined){
      const index=script.scenes.findIndex(s=>s.scene_id===edit.regenerateSceneId);if(index<0)throw new ApiError(422,"Scene not found");
      if(edit.regenerateKind!=="visual"){manifest.sceneCache.voice=manifest.sceneCache.voice.filter(c=>(c as {sceneIndex?:number}).sceneIndex!==index);delete manifest.stages.voice;}
      if(edit.regenerateKind!=="voice"){manifest.sceneCache.visuals=manifest.sceneCache.visuals.filter(c=>(c as {scene?:{scene_id?:number}}).scene?.scene_id!==edit.regenerateSceneId);delete manifest.stages.visuals;}
      manifest.sceneCache.assembly=(manifest.sceneCache.assembly??[]).filter(c=>(c as {sceneIndex?:number}).sceneIndex!==index);delete manifest.stages.assembly;delete manifest.stages.captions;delete manifest.stages.storage;
    }
    const result=await prisma.$transaction(async tx=>{
      const history=Array.isArray(video.publicationHistory)?video.publicationHistory:[];
      const claim=await tx.video.updateMany({where:{id:video.id,deletedAt:null,renderRevision:edit.expectedRevision,queueVersion:video.queueVersion,OR:[{executionLease:null},{executionLease:{lt:new Date()}}]},data:{renderRevision:revision,approvedRevision:edit.approve?revision:null,scriptJson:asJson(script),scenes:asJson(script.scenes),title:script.title,description:script.description,tags:script.tags,generationOptions:asJson(config),generationManifest:asJson(manifest),storyboard:asJson({...edit.storyboard,total_duration:script.scenes.reduce((n,s)=>n+s.duration_seconds,0)}),renderStatus:"awaiting_approval",status:"pending",renderError:null,executionLease:null,executionToken:null,...(changed&&video.youtubeId?{publicationHistory:asJson([...history,{revision:video.renderRevision,youtubeId:video.youtubeId,youtubeUrl:video.youtubeUrl,visibility:video.visibility}]),youtubeId:null,youtubeUrl:null,uploadStatus:"not_started"}:{})}});
      if(!claim.count)throw new ApiError(409,"Storyboard or generation state changed. Reload the saved revision.");
      if(edit.approve){
        const nextVersion=video.queueVersion+1;
        if(additionalCredits){
          const debit=await tx.user.updateMany({where:{id:user.id,credits:{gte:1}},data:{credits:{decrement:1}}});if(!debit.count)throw new ApiError(402,"Approval needs one credit for this render.");
          await tx.creditLedger.create({data:{userId:user.id,jobId,operationKey:`${jobId}-debit-${nextVersion}`,amount:-1,reason:video.creditState==="refunded"?"Re-reserve refunded generation credit":"Render edited or regenerated video"}});
        }
        await tx.video.update({where:{id:video.id},data:{queueVersion:nextVersion,renderStatus:"queued",creditState:additionalCredits?"reserved":video.creditState,uploadStatus:"not_started"}});
        await tx.jobOutbox.create({data:{id:`${jobId}-render-${nextVersion}`,jobId,kind:"render",payload:asJson({jobId,userId:user.id,queueVersion:nextVersion,renderRevision:revision})}});
      }
      return {success:true,revision,approvedRevision:edit.approve?revision:null,status:edit.approve?"queued":"awaiting_approval"};
    },{isolationLevel:Prisma.TransactionIsolationLevel.ReadCommitted});
    return NextResponse.json(result);
  }catch(error){return apiError(error);}
}
