import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser,apiError,ApiError } from "@/lib/server-auth";
import { prisma } from "@/lib/prisma";
import { asJson } from "@/lib/generation/config";
const schema=z.object({id:z.string().optional(),name:z.string().trim().min(1).max(100),settings:z.object({description:z.string().max(2000).default(""),voice:z.enum(["male","female","ai_narrator"]).default("ai_narrator"),language:z.enum(["english","hindi","spanish"]).default("english"),visualStyle:z.enum(["stock","illustration","anime"]).default("stock"),captionPreset:z.enum(["clean","bold","minimal"]).default("clean"),pronunciation:z.record(z.string().max(100),z.string().max(200)).default({}),intro:z.string().max(1000).default(""),outro:z.string().max(1000).default(""),terminology:z.string().max(5000).default("")})});
const profileSchema=schema.extend({settings:schema.shape.settings.extend({approvedAssets:z.array(z.object({name:z.string().min(1).max(200),key:z.string().min(1).max(2000),type:z.enum(["image","clip"])})).max(20).default([])})});
export async function GET(req:Request){try{const user=await requireUser(req);return NextResponse.json({channels:await prisma.channelProfile.findMany({where:{userId:user.id},orderBy:{name:"asc"}})});}catch(error){return apiError(error);}}
export async function POST(req:Request){
  try{const user=await requireUser(req);let body:unknown;try{body=await req.json();}catch{throw new ApiError(400,"Invalid JSON body");}const parsed=profileSchema.safeParse(body);if(!parsed.success)throw new ApiError(422,"Invalid channel profile");const {id,name,settings}=parsed.data;
    if(settings.approvedAssets.some(asset=>!asset.key.startsWith(`uploads/${user.id}/`)||asset.key.split("/").includes("..")||asset.key.includes("\\")))throw new ApiError(422,"Channel assets must belong to your account");
    if(id){const changed=await prisma.channelProfile.updateMany({where:{id,userId:user.id},data:{name,settings:asJson(settings)}});if(!changed.count)throw new ApiError(404,"Channel profile not found");return NextResponse.json({channel:await prisma.channelProfile.findUnique({where:{id}})});}
    return NextResponse.json({channel:await prisma.channelProfile.create({data:{userId:user.id,name,settings:asJson(settings)}})},{status:201});
  }catch(error){return apiError(error);}
}
export async function DELETE(req:Request){try{const user=await requireUser(req);const id=new URL(req.url).searchParams.get("id");if(!id)throw new ApiError(422,"Channel ID required");const deleted=await prisma.channelProfile.deleteMany({where:{id,userId:user.id}});if(!deleted.count)throw new ApiError(404,"Channel not found");return NextResponse.json({deleted:true});}catch(error){return apiError(error);}}
