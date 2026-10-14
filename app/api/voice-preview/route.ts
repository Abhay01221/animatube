import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser,apiError,ApiError } from "@/lib/server-auth";
import { prisma } from "@/lib/prisma";
import { generateVoiceover } from "@/lib/stages/voice";
import { getPresignedUrl } from "@/lib/s3";
export const runtime="nodejs";
export async function POST(req:Request){
  try{
    const user=await requireUser(req);let body:unknown;try{body=await req.json();}catch{throw new ApiError(400,"Invalid JSON body");}
    const parsed=z.object({voice:z.enum(["male","female","ai_narrator"]),language:z.enum(["english","hindi","spanish"]),text:z.string().trim().min(1).max(200).optional()}).safeParse(body);if(!parsed.success)throw new ApiError(422,"Invalid voice preview options");
    const id=`preview_${user.id}_${randomUUID()}`;
    await prisma.$transaction(async tx=>{await tx.user.update({where:{id:user.id},data:{videosGenerated:{increment:0}}});const count=await tx.creditLedger.count({where:{userId:user.id,reason:"Voice preview",createdAt:{gte:new Date(Date.now()-60000)}}});if(count>=5)throw new ApiError(429,"Maximum five voice previews per minute");await tx.creditLedger.create({data:{userId:user.id,jobId:id,operationKey:id,amount:0,reason:"Voice preview"}});});
    const text=parsed.data.text??({english:"Welcome. Let's explore this idea together.",hindi:"नमस्ते। आइए इस विषय को मिलकर समझते हैं।",spanish:"Hola. Vamos a explorar esta idea juntos."}[parsed.data.language]);
    const result=await generateVoiceover(id,[{segment:text,duration_seconds:10,visual_cue:"Voice preview"}],parsed.data.voice,undefined,{language:parsed.data.language});
    return NextResponse.json({url:await getPresignedUrl(result.s3Key,300),creditsCharged:0});
  }catch(error){return apiError(error);}
}
