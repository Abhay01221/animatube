import { z } from "zod";
import { encrypt,decrypt } from "./encrypt";
const schema=z.object({purpose:z.literal("video-download"),userId:z.string().min(1),videoId:z.string().min(1),revision:z.number().int().positive(),expiresAt:z.number()});
export function createDownloadTicket(userId:string,videoId:string,revision:number,now=Date.now()){
  return encrypt(JSON.stringify({purpose:"video-download",userId,videoId,revision,expiresAt:now+300000}));
}
export function readDownloadTicket(ticket:string,videoId:string,now=Date.now()){
  if(ticket.length>4000)throw new Error("Invalid download link");
  const result=schema.parse(JSON.parse(decrypt(ticket)));
  if(result.videoId!==videoId||result.expiresAt<=now||result.expiresAt>now+300000)throw new Error("Download link expired or invalid");
  return result;
}
