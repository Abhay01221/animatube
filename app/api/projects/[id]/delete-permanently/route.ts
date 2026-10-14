import { NextResponse } from "next/server";
import { requireUser, apiError, ApiError } from "@/lib/server-auth";
import { requestPermanentDeletion } from "@/lib/generation/permanent-deletion";

export const maxDuration=300;
export async function DELETE(req:Request,{params}:{params:Promise<{id:string}>}){
  try {
    const user=await requireUser(req),{id}=await params;
    const body=await req.json().catch(()=>null);
    if(body?.confirm!==true) throw new ApiError(422,"Confirm permanent deletion. This cannot be undone.");
    const result=await requestPermanentDeletion(id,user.id);
    return NextResponse.json({success:true,...result},{status:result.pending?202:200});
  } catch(error){return apiError(error);}
}
