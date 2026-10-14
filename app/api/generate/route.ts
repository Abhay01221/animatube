import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { requireUser, apiError, ApiError } from "@/lib/server-auth";
import { GenerationSchema } from "@/lib/generation/config";
import { createGeneration } from "@/lib/generation/submission";
import { generatedVisualCapabilities } from "@/lib/cinematic/generated-provider";
export async function POST(req:Request) {
  try {
    const user=await requireUser(req);
    let body:unknown;
    try{body=await req.json();}catch{throw new ApiError(400,"Invalid JSON body");}
    const parsed=GenerationSchema.safeParse(body);
    if(!parsed.success) return NextResponse.json({error:"Invalid generation options",details:parsed.error.flatten()},{status:422});
    if(parsed.data.visualStyle!=="stock"&&!generatedVisualCapabilities().enabled)throw new ApiError(422,"Generated illustrations are unavailable. Choose stock footage; you can add your own images and diagrams in the storyboard.");
    const video=await createGeneration(user.id,parsed.data,req.headers.get("Idempotency-Key")??randomUUID());
    return NextResponse.json({jobId:video.jobId,status:video.renderStatus,creditsReserved:1},{status:201});
  }catch(error){return apiError(error);}
}
