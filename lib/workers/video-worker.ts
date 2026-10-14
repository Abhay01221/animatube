import { randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Worker, type Job } from "bullmq";
import { prisma } from "../prisma";
import { VIDEO_QUEUE_NAME, type VideoJobData } from "../queue";
import { createRedisConnection, getRedisClient } from "../redis";
import { downloadAsset } from "../assets";
import { uploadToS3 } from "../s3";
import { generateCinematicScript, type CinematicScriptResult } from "../stages/cinematic-script";
import { generateVoiceover } from "../stages/voice";
import { fetchCinematicVisuals, type CinematicTimelineEntry } from "../stages/cinematic-visuals";
import { assembleCinematicVideo, type RenderSceneCheckpoint } from "../stages/cinematic-assembly";
import { addCinematicSubtitles } from "../stages/cinematic-subtitles";
import { uploadFinalVideoToStorage } from "../storage";
import type { VoiceSceneCheckpoint } from "../types/cinematic";
import { asJson, configFromVideo } from "../generation/config";
import { ApprovalRequired, fingerprint, readManifest, runCheckpointedPipeline, STAGES, type Json, type StageOutput, type StageKey } from "../generation/checkpoints";
import { stageInput } from "../generation/inputs";
import { describeArtifact, verifyCheckpointArtifact } from "../generation/artifacts";
import { refundFailedGeneration } from "../generation/submission";
import { generateSceneScript } from "../cinematic/scene-script-generator";
import { sceneScriptSchema,storyPlanSchema } from "../cinematic/schemas";
import { configuredGeneratedProvider } from "../cinematic/generated-provider";

export type StageStatus = "pending" | "active" | "done" | "error";
export interface StageUpdate { stage:number; name:string; status:StageStatus; log?:string; terminal?:boolean }
const NAMES = ["Writing script", "Generating voiceover", "Preparing visuals", "Assembling video", "Adding captions", "Saving video"];
const json=(value:unknown):Json=>JSON.parse(JSON.stringify(value)) as Json;
function output<T>(outputs:Partial<Record<StageKey,StageOutput>>,stage:StageKey):T {
  const result=outputs[stage]; if(!result) throw new Error(`Missing ${stage} checkpoint`);
  return result.data as T;
}
class StaleExecution extends Error {}
export interface VideoWorkerProviders {
  script:typeof generateCinematicScript;voice:typeof generateVoiceover;visuals:typeof fetchCinematicVisuals;
  assembly:typeof assembleCinematicVideo;captions:typeof addCinematicSubtitles;storage:typeof uploadFinalVideoToStorage;
  progress:typeof publishProgress;
}
export async function publishProgress(jobId:string,update:StageUpdate) {
  const redis=getRedisClient(); const entry=JSON.stringify(update);
  await redis.multi().rpush(`progress:${jobId}`,entry).ltrim(`progress:${jobId}`,-500,-1).expire(`progress:${jobId}`,604800).publish(`progress-channel:${jobId}`,entry).exec();
}
export async function processVideoJob(job:Pick<Job<VideoJobData>,"data"|"attemptsMade"|"opts">,providers:Partial<VideoWorkerProviders>={}):Promise<void> {
  const generateScript=providers.script??generateCinematicScript,generateVoice=providers.voice??generateVoiceover;
  const fetchVisuals:typeof fetchCinematicVisuals=providers.visuals??((...args)=>{args[6]={...args[6],generatedProvider:args[6]?.visualStyle!=="stock"?configuredGeneratedProvider():undefined};return fetchCinematicVisuals(...args);});
  const assemble=providers.assembly??assembleCinematicVideo;
  const addCaptions=providers.captions??addCinematicSubtitles,store=providers.storage??uploadFinalVideoToStorage;
  const progress=providers.progress??publishProgress;
  const video=await prisma.video.findFirst({where:{jobId:job.data.jobId,userId:job.data.userId}});
  if(!video) return; // A permanently deleted project's stale queue delivery is a no-op.
  if(video.deletedAt)return;
  // Old queued upload requests must never generate a new video.
  if(job.data.reuploadOnly) { const {queueVideoUpload}=await import("../generation/publishing"); await queueVideoUpload(video.id,video.userId); return; }
  const queueVersion=job.data.queueVersion??video.queueVersion;
  if(queueVersion!==video.queueVersion || (job.data.renderRevision && job.data.renderRevision!==video.renderRevision) || video.renderStatus==="completed") return;
  const config=configFromVideo(video);
  const manifest=readManifest(video.generationManifest);
  const approvedScript=video.approvedRevision===video.renderRevision?video.scriptJson:null;
  const token=randomUUID();
  const acquired=await prisma.video.updateMany({where:{id:video.id,queueVersion,deletedAt:null,OR:[{executionLease:null},{executionLease:{lt:new Date()}}]},data:{executionToken:token,executionLease:new Date(Date.now()+60000),status:"processing",renderStatus:"processing",renderError:null}});
  if(!acquired.count) throw new Error("This generation already has an active worker");
  const controller=new AbortController();
  const owned={id:video.id,queueVersion,executionToken:token,deletedAt:null};
  const heartbeat=setInterval(()=>{void prisma.video.updateMany({where:owned,data:{executionLease:new Date(Date.now()+60000)}}).then(result=>{if(!result.count)controller.abort(new StaleExecution("Generation ownership changed"));}).catch(()=>controller.abort(new Error("Unable to renew generation lease")));},15000);
  const dir=await mkdtemp(join(tmpdir(),"animatube-render-"));
  const assetId=`${video.jobId}_r${video.renderRevision}_a${queueVersion}_${token.slice(0,8)}`;
  const persist=async()=>{
    controller.signal.throwIfAborted();
    const saved=await prisma.video.updateMany({where:owned,data:{generationManifest:asJson(manifest),executionLease:new Date(Date.now()+60000)}});
    if(!saved.count)throw new StaleExecution("A newer run owns this video");
  };
  const log=(stage:number)=>(message:string)=>progress(video.jobId,{stage,name:NAMES[stage-1],status:"active",log:message}).catch(()=>undefined);
  try {
    await runCheckpointedPipeline(manifest,{
      save:persist,verify:verifyCheckpointArtifact,
      input:(stage,outputs)=>stageInput(config,approvedScript,stage,outputs),
      event:async(stage,status,reused)=>{await progress(video.jobId,{stage:STAGES.indexOf(stage)+1,name:NAMES[STAGES.indexOf(stage)],status:status==="completed"?"done":"active",log:reused?"Reusing verified saved output":undefined});},
      run:async(stage,outputs):Promise<StageOutput>=>{
        controller.signal.throwIfAborted();
        if(stage==="script") {
          let result:CinematicScriptResult;
          if(approvedScript) {
            result={storyPlan:storyPlanSchema.parse(video.storyPlan),script:sceneScriptSchema.parse(approvedScript)};
            await uploadToS3(`jobs/${assetId}/cinematic-script.json`,JSON.stringify(result.script),"application/json");
          }else {
            const sourceContext=config.sources.length?`\n\nApproved reference material (cite source IDs for factual claims; mark unsupported claims):\n${config.sources.map(source=>`SOURCE ${source.id}: ${source.title}\n${source.text}`).join("\n\n")}`:"";
            if(config.variantKind==="translation"&&video.parentVideoId){
              const parent=await prisma.video.findFirst({where:{id:video.parentVideoId,userId:video.userId}});
              if(!parent)throw new Error("Original language version is unavailable");
              const parentScript=sceneScriptSchema.parse(parent.scriptJson),parentPlan=storyPlanSchema.parse(parent.storyPlan);
              const selected=parentScript.scenes.filter(s=>!config.variantSceneIds||config.variantSceneIds.includes(s.scene_id));
              const plan={...parentPlan,total_duration:selected.reduce((n,s)=>n+s.duration_seconds,0),scenes:selected.map((s,i)=>({...parentPlan.scenes.find(p=>p.scene===s.scene_id)??parentPlan.scenes[i],scene:s.scene_id,duration_seconds:s.duration_seconds}))};
              const translated=await generateSceneScript(plan,`Translate this approved narration into ${config.language}; preserve facts, source IDs, and scene count:\n${JSON.stringify(selected)}${sourceContext}`,config.style,config.language,log(1));
              const cache=readManifest(parent.generationManifest).sceneCache.visuals;
              translated.scenes=translated.scenes.map((scene,index)=>{const original=selected[index],visual=cache.find(c=>(c as {scene?:{scene_id?:number}}).scene?.scene_id===original.scene_id) as {s3Key?:string;type?:"clip"|"image"}|undefined;return {...scene,scene_id:original.scene_id,visual_prompt:original.visual_prompt,diagram:original.diagram,source_references:original.source_references,visual_asset:visual?.s3Key?{s3Key:visual.s3Key,type:visual.type??"image",provider:"s3"}:original.visual_asset};});
              result={storyPlan:plan,script:translated};
              await uploadToS3(`jobs/${assetId}/cinematic-script.json`,JSON.stringify(result.script),"application/json");
            }else {
              const planHash=fingerprint(stageInput(config,null,"script",{}));
              let savedStoryPlan;
              if(manifest.scriptPlan?.inputHash===planHash&&await verifyCheckpointArtifact(manifest.scriptPlan.artifact)){
                const parsed=storyPlanSchema.safeParse(manifest.scriptPlan.storyPlan);if(parsed.success)savedStoryPlan=parsed.data;
              }
              result=await generateScript(assetId,config.prompt+sourceContext+(config.channelInstructions?`\n\nChannel rules:\n${config.channelInstructions}`:""),config.style,config.duration,config.language,log(1),{...config,savedStoryPlan,onStoryPlanComplete:async(plan,key)=>{manifest.scriptPlan={inputHash:planHash,storyPlan:json(plan),artifact:await describeArtifact({provider:"s3",key})};await persist();}});
            }
          }
          result.script.scenes=result.script.scenes.map(scene=>({...scene,source_references:(scene.source_references??[]).filter(ref=>!!ref.passage.trim()&&config.sources.some(source=>source.id===ref.sourceId&&source.text.includes(ref.passage)))}));
          const storyboard={job_id:video.jobId,created_at:new Date().toISOString(),overall_style:config.visualStyle,total_duration:result.script.scenes.reduce((sum,scene)=>sum+scene.duration_seconds,0),scenes:result.script.scenes.map(scene=>({...scene,narration_preview:scene.narration,estimated_duration:scene.duration_seconds,camera_notes:scene.camera_direction,editable:true}))};
          const saved=await prisma.video.updateMany({where:owned,data:{scriptJson:asJson(result.script),storyPlan:asJson(result.storyPlan),scenes:asJson(result.script.scenes),characters:asJson(result.script.characters??[]),storyboard:asJson(storyboard),title:result.script.title,description:result.script.description,tags:result.script.tags}});
          if(!saved.count)throw new StaleExecution();
          return {data:json(result),artifacts:[await describeArtifact({provider:"s3",key:`jobs/${assetId}/cinematic-script.json`})]};
        }
        const script=output<CinematicScriptResult>(outputs,"script").script;
        if(stage==="voice") {
          if(config.approvalRequired && video.approvedRevision!==video.renderRevision)throw new ApprovalRequired();
          const voice=await generateVoice(assetId,script.scenes.map(scene=>({segment:scene.narration,duration_seconds:scene.duration_seconds,visual_cue:scene.visual_prompt})),config.voice,log(2),{language:config.language,pronunciationOverrides:config.pronunciation,sceneCache:manifest.sceneCache.voice as unknown as VoiceSceneCheckpoint[],signal:controller.signal,onSceneComplete:async scene=>{manifest.sceneCache.voice=manifest.sceneCache.voice.filter(c=>(c as {sceneIndex?:number}).sceneIndex!==scene.sceneIndex);manifest.sceneCache.voice.push(json(scene));await persist();}});
          await prisma.video.updateMany({where:owned,data:{s3VoiceUrl:voice.s3Key}});
          return {data:json(voice),artifacts:await Promise.all([voice.s3Key,...voice.sceneAssets.map(scene=>scene.s3Key)].map(key=>describeArtifact({provider:"s3",key})))};
        }
        const voice=output<Awaited<ReturnType<typeof generateVoiceover>>>(outputs,"voice");
        if(stage==="visuals") {
          const timeline=await fetchVisuals(assetId,script.scenes,script.characters,voice.durationSeconds,dir,log(3),{...config,signal:controller.signal,sceneDurations:voice.sceneDurations,cachedAssets:manifest.sceneCache.visuals as unknown as CinematicTimelineEntry[],onSceneComplete:async scene=>{manifest.sceneCache.visuals=manifest.sceneCache.visuals.filter(c=>(c as {scene?:{scene_id?:number}}).scene?.scene_id!==scene.scene.scene_id);manifest.sceneCache.visuals.push(json(scene));await persist();}});
          const placeholders=timeline.filter(scene=>scene.placeholder).length;
          if(placeholders)await log(3)(`${placeholders} scene(s) use clearly marked placeholder visuals. Replace them in the storyboard for a finished video.`);
          return {data:json(timeline),artifacts:await Promise.all(timeline.map(scene=>describeArtifact({provider:"s3",key:scene.s3Key})))};
        }
        const timeline=output<CinematicTimelineEntry[]>(outputs,"visuals");
        if(stage==="assembly") {
          const key=await assemble(assetId,timeline,voice.s3Key,dir,log(4),{...config,musicS3Key:config.musicAsset?.key,signal:controller.signal,sceneCache:manifest.sceneCache.assembly as unknown as RenderSceneCheckpoint[],onSceneComplete:async scene=>{manifest.sceneCache.assembly??=[];manifest.sceneCache.assembly=manifest.sceneCache.assembly.filter(c=>(c as {sceneIndex?:number}).sceneIndex!==scene.sceneIndex);manifest.sceneCache.assembly.push(json(scene));await persist();}});
          await prisma.video.updateMany({where:owned,data:{s3RawVideoUrl:key}});
          return {data:{s3Key:key},artifacts:[await describeArtifact({provider:"s3",key})]};
        }
        if(stage==="captions") {
          const raw=output<{s3Key:string}>(outputs,"assembly");
          const key=await addCaptions(assetId,script.scenes,timeline,raw.s3Key,dir,{...config,words:voice.words},log(5));
          const srtKey=`jobs/${assetId}/captions.srt`;const vttKey=`jobs/${assetId}/captions.vtt`;
          await prisma.video.updateMany({where:owned,data:{subtitlesAdded:true}});
          return {data:{s3Key:key,srtKey,vttKey},artifacts:await Promise.all([key,srtKey,vttKey].map(key=>describeArtifact({provider:"s3",key})))};
        }
        const caption=output<{s3Key:string}>(outputs,"captions");
        const local=join(dir,"final_video.mp4");
        await downloadAsset({provider:"s3",key:caption.s3Key},local);
        const stored=await store(video.jobId,local,dir,{token,queueVersion});
        return {data:json(stored),artifacts:[await describeArtifact({provider:stored.storageProvider,key:stored.videoS3Key})]};
      },
    });
    const done=await prisma.video.updateMany({where:owned,data:{status:"completed",renderStatus:"completed",renderError:null,creditState:video.creditState==="reserved"?"consumed":video.creditState,executionToken:null,executionLease:null}});
    if(!done.count)throw new StaleExecution();
    await progress(video.jobId,{stage:6,name:"render_complete",status:"done",log:"Video ready. YouTube publishing is optional.",terminal:true});
  }catch(error) {
    if(error instanceof StaleExecution || controller.signal.reason instanceof StaleExecution)return;
    const approval=error instanceof ApprovalRequired;
    const willRetry=!approval && job.attemptsMade+1<(job.opts.attempts??1);
    const changed=await prisma.video.updateMany({where:owned,data:{status:approval?"pending":willRetry?"processing":"failed",renderStatus:approval?"awaiting_approval":willRetry?"retrying":"failed",renderError:approval?null:error instanceof Error?error.message.slice(0,1000):"Generation failed",executionToken:null,executionLease:null}});
    if(!changed.count)return;
    if(approval){await progress(video.jobId,{stage:2,name:"awaiting_approval",status:"pending",log:error.message});return;}
    if(!willRetry)await refundFailedGeneration(video.jobId,queueVersion);
    await progress(video.jobId,{stage:Math.max(1,STAGES.findIndex(stage=>manifest.stages[stage]?.status==="failed")+1),name:willRetry?"retrying":"failed",status:willRetry?"pending":"error",log:willRetry?"Retrying from saved checkpoints":"Generation paused after failed attempts. Resume is available.",terminal:!willRetry});
    throw error;
  }finally {clearInterval(heartbeat);await rm(dir,{recursive:true,force:true});}
}
export function createVideoWorker(){
  const worker=new Worker<VideoJobData>(VIDEO_QUEUE_NAME,job=>processVideoJob(job),{connection:createRedisConnection(),concurrency:Number(process.env.VIDEO_CONCURRENCY??1)});
  worker.on("error",error=>console.error("[VideoWorker]",error.message));
  worker.on("failed",job=>console.warn("[VideoWorker] Attempt failed",job?.id));
  return worker;
}
