import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { requireUser,apiError,ApiError } from "@/lib/server-auth";
import { uploadToS3,getPresignedUrl } from "@/lib/s3";
export const runtime="nodejs";
export async function POST(req:Request){
  try{
    const user=await requireUser(req);
    const length=Number(req.headers.get("content-length"));if(length>25*1024*1024)throw new ApiError(413,"Upload must be smaller than 25 MB");
    const data=await req.formData(),file=data.get("file");if(!(file instanceof File)||!file.size)throw new ApiError(422,"Select a media file");
    if(file.size>24*1024*1024)throw new ApiError(413,"Upload must be smaller than 24 MB");
    const bytes=Buffer.from(await file.arrayBuffer());
    let type:"image"|"clip"|"audio",ext:string,contentType:string;
    if(bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))){type="image";ext="png";contentType="image/png";}
    else if(bytes[0]===255&&bytes[1]===216&&bytes[2]===255){type="image";ext="jpg";contentType="image/jpeg";}
    else if(bytes.toString("ascii",0,4)==="RIFF"&&bytes.toString("ascii",8,12)==="WEBP"){type="image";ext="webp";contentType="image/webp";}
    else if(bytes.toString("ascii",4,8)==="ftyp"&&file.type.startsWith("video/")){type="clip";ext="mp4";contentType="video/mp4";}
    else if(file.type.startsWith("audio/")&&(bytes.toString("ascii",0,3)==="ID3"||bytes[0]===255&&((bytes[1]??0)&224)===224||bytes.toString("ascii",0,4)==="RIFF"&&bytes.toString("ascii",8,12)==="WAVE")){
      if(data.get("licensed")!=="true")throw new ApiError(422,"Confirm that you have permission to use the music");type="audio";ext=bytes.toString("ascii",0,4)==="RIFF"?"wav":"mp3";contentType=ext==="wav"?"audio/wav":"audio/mpeg";
    }else throw new ApiError(422,"Supported files: PNG, JPEG, WebP, MP4, MP3, or WAV");
    const key=`uploads/${user.id}/${randomUUID()}.${ext}`;await uploadToS3(key,bytes,contentType);
    return NextResponse.json({asset:{provider:"s3",s3Key:key,key,type},url:await getPresignedUrl(key,300)},{status:201});
  }catch(error){return apiError(error);}
}
