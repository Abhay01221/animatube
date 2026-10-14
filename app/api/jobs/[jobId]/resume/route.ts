import { NextResponse } from "next/server";
import { requireUser,apiError,ApiError } from "@/lib/server-auth";
import { ownedVideo,canResumeVideo } from "@/lib/generation/access";
import { configFromVideo } from "@/lib/generation/config";
import { readManifest,inspectResume } from "@/lib/generation/checkpoints";
import { stageInput } from "@/lib/generation/inputs";
import { verifyCheckpointArtifact } from "@/lib/generation/artifacts";
import { scheduleResume } from "@/lib/generation/submission";
import { z } from "zod";
type Context={params:Promise<{jobId:string}>};
export async function GET(req:Request,context:Context){
  try{
    const user=await requireUser(req);const {jobId}=await context.params;
    const video=await ownedVideo(jobId,user.id);const config=configFromVideo(video);
    const approved=video.approvedRevision===video.renderRevision?video.scriptJson:null;
    const preview=await inspectResume(readManifest(video.generationManifest),{input:(stage,outputs)=>stageInput(config,approved,stage,outputs),verify:verifyCheckpointArtifact});
    return NextResponse.json({...preview,additionalCredits:video.creditState==="refunded"?1:0,canResume:canResumeVideo(video),revision:video.renderRevision});
  }catch(error){return apiError(error);}
}
export async function POST(req:Request,context:Context){
  try{
    const user=await requireUser(req);const {jobId}=await context.params;
    const video=await ownedVideo(jobId,user.id);
    if(!canResumeVideo(video)&&video.renderStatus!=="queued")throw new ApiError(409,"This generation is active, complete, or awaiting storyboard approval.");
    let body:unknown;try{body=await req.json();}catch{throw new ApiError(400,"Review the resume preview before continuing");}
    const parsed=z.object({expectedAdditionalCredits:z.union([z.literal(0),z.literal(1)]),expectedRevision:z.number().int().positive()}).safeParse(body);if(!parsed.success)throw new ApiError(422,"Review the resume preview and cost before continuing");
    const queued=await scheduleResume(jobId,user.id,parsed.data.expectedRevision,parsed.data.expectedAdditionalCredits);
    return NextResponse.json({jobId:queued.jobId,status:queued.renderStatus});
  }catch(error){return apiError(error);}
}
