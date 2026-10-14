import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { requireUser,apiError } from "@/lib/server-auth";
import { ownedVideo } from "@/lib/generation/access";
import { configFromVideo } from "@/lib/generation/config";
import { createGeneration } from "@/lib/generation/submission";
export async function POST(req:Request,{params}:{params:Promise<{jobId:string}>}){
  try{
    const user=await requireUser(req);const {jobId}=await params;const source=await ownedVideo(jobId,user.id);
    const video=await createGeneration(user.id,{...configFromVideo(source),parentVideoId:source.id},req.headers.get("Idempotency-Key")??randomUUID());
    return NextResponse.json({jobId:video.jobId,creditsReserved:1},{status:201});
  }catch(error){return apiError(error);}
}
