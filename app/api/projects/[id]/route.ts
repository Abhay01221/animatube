import { NextResponse } from "next/server";
import { requireUser,apiError,ApiError } from "@/lib/server-auth";
import { moveVideoToTrash,restoreVideo } from "@/lib/generation/library";
type Context={params:Promise<{id:string}>};
export async function DELETE(req:Request,{params}:Context){
  try{const user=await requireUser(req),{id}=await params;await moveVideoToTrash(id,user.id);return NextResponse.json({success:true,deleted:true});}catch(error){return apiError(error);}
}
export async function PATCH(req:Request,{params}:Context){
  try{const user=await requireUser(req),{id}=await params;const body=await req.json().catch(()=>null);if(body?.action!=="restore")throw new ApiError(422,"Choose restore to recover a deleted video");await restoreVideo(id,user.id);return NextResponse.json({success:true,restored:true});}catch(error){return apiError(error);}
}
