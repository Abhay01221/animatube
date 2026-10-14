import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser,apiError,ApiError } from "@/lib/server-auth";
import { prisma } from "@/lib/prisma";
import { configFromVideo } from "@/lib/generation/config";
import { createGeneration } from "@/lib/generation/submission";
import { sceneScriptSchema } from "@/lib/cinematic/schemas";
const schema=z.object({kind:z.enum(["short","translation"]),language:z.enum(["english","hindi","spanish"]).optional(),sceneIds:z.array(z.number().int().positive()).min(1).max(10).optional(),hook:z.string().trim().min(10).max(1000).optional(),targetDuration:z.number().int().min(15).max(60).default(30)});
export async function POST(req:Request,{params}:{params:Promise<{id:string}>}){
  try{const user=await requireUser(req);const {id}=await params;const video=await prisma.video.findFirst({where:{id,userId:user.id,deletedAt:null}});if(!video)throw new ApiError(404,"Video not found");let body:unknown;try{body=await req.json();}catch{throw new ApiError(400,"Invalid JSON body");}const parsed=schema.safeParse(body);if(!parsed.success)throw new ApiError(422,"Invalid variant options");const options=parsed.data,config=configFromVideo(video),script=sceneScriptSchema.parse(video.scriptJson);
    const selected=options.sceneIds?script.scenes.filter(scene=>options.sceneIds!.includes(scene.scene_id)):script.scenes;
    if(!selected.length||options.sceneIds&&selected.length!==new Set(options.sceneIds).size)throw new ApiError(422,"Select valid scenes from the approved video");
    const context=selected.map(scene=>scene.narration).join("\n");
    const prompt=options.kind==="short"?`Create a self-contained ${options.targetDuration}-second vertical educational short. Open with this hook: ${options.hook??"Ask a compelling question about the key takeaway"}. Use only these approved facts and retain their meaning:\n${context}`:`Translate and adapt this approved narration into ${options.language??config.language}, preserving its facts and source references. Localize examples only when their meaning remains accurate:\n${context}`;
    const variant=await createGeneration(user.id,{...config,prompt:prompt.slice(0,20000),parentVideoId:video.id,variantKind:options.kind,variantSceneIds:selected.map(s=>s.scene_id),approvalRequired:true,language:options.language??config.language,aspectRatio:options.kind==="short"?"9:16":config.aspectRatio,targetDuration:options.kind==="short"?options.targetDuration:config.targetDuration},req.headers.get("Idempotency-Key")??randomUUID());
    return NextResponse.json({jobId:variant.jobId,creditsReserved:1,approvalRequired:true},{status:201});
  }catch(error){return apiError(error);}
}
