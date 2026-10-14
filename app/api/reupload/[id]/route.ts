import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser,apiError,ApiError } from "@/lib/server-auth";
import { queueVideoUpload } from "@/lib/generation/publishing";
export async function POST(req:Request,{params}:{params:Promise<{id:string}>}){
  try{
    const user=await requireUser(req);const {id}=await params;
    const text=await req.text();let visibility:string|undefined;
    if(text){let body:unknown;try{body=JSON.parse(text);}catch{throw new ApiError(400,"Invalid JSON body");}const parsed=z.object({visibility:z.enum(["private","unlisted","public"]).optional()}).safeParse(body);if(!parsed.success)throw new ApiError(422,"Invalid visibility");visibility=parsed.data.visibility;}
    return NextResponse.json(await queueVideoUpload(id,user.id,visibility));
  }catch(error){return apiError(error);}
}
