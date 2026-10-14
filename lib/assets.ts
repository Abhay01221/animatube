import { createReadStream, createWriteStream } from "node:fs";
import { mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { supabaseAdmin } from "./supabase";
import { getPresignedUrl, openS3Stream, uploadFileToS3, verifyS3Object, getS3Client, getS3Bucket, deleteS3Permanently } from "./s3";
import { ListObjectsV2Command, ListObjectVersionsCommand } from "@aws-sdk/client-s3";

export interface AssetRef { provider: "s3" | "supabase"; key: string }
export const ASSET_BUCKET = "videos";
/** Only call after ownership has been established for an exact project prefix. */
export async function listAssetPrefix(provider: AssetRef["provider"], prefix: string): Promise<AssetRef[]> {
  validateAssetRef({provider,key:prefix});
  const found: AssetRef[] = [];
  if(provider === "s3") {
    let token: string | undefined;
    do {
      const page = await getS3Client().send(new ListObjectsV2Command({Bucket:getS3Bucket(),Prefix:prefix,ContinuationToken:token}));
      for(const object of page.Contents ?? []) if(object.Key?.startsWith(prefix)) found.push({provider,key:object.Key});
      token = page.IsTruncated ? page.NextContinuationToken : undefined;
      if(page.IsTruncated && !token) throw new Error("Storage listing was incomplete");
    } while(token);
    // A previous render may have only old versions/delete markers, invisible to ListObjectsV2.
    let keyMarker:string|undefined,versionMarker:string|undefined;
    do {
      const page=await getS3Client().send(new ListObjectVersionsCommand({Bucket:getS3Bucket(),Prefix:prefix,KeyMarker:keyMarker,VersionIdMarker:versionMarker}));
      for(const object of [...page.Versions??[],...page.DeleteMarkers??[]]) if(object.Key?.startsWith(prefix)) found.push({provider,key:object.Key});
      keyMarker=page.IsTruncated?page.NextKeyMarker:undefined;versionMarker=page.NextVersionIdMarker;
      if(page.IsTruncated&&!keyMarker)throw new Error("Storage version listing was incomplete");
    } while(keyMarker);
  } else {
    const walk = async(folder:string):Promise<void> => {
      for(let offset=0;;offset+=100) {
        const {data,error} = await supabaseAdmin.storage.from(ASSET_BUCKET).list(folder,{limit:100,offset,sortBy:{column:"name",order:"asc"}});
        if(error) throw error;
        for(const entry of data ?? []) {
          const key = `${folder}/${entry.name}`;
          validateAssetRef({provider,key});
          if(!key.startsWith(prefix)) throw new Error("Storage returned an unexpected object");
          if(entry.id === null) await walk(key); else found.push({provider,key});
        }
        if(!data || data.length < 100) break;
      }
    };
    await walk(prefix.replace(/\/$/,""));
  }
  return [...new Map(found.map(asset=>[asset.key,asset])).values()];
}
export async function deleteAsset(ref:AssetRef):Promise<void> {
  validateAssetRef(ref);
  if(ref.provider === "s3") await deleteS3Permanently(ref.key);
  else {
    const {error} = await supabaseAdmin.storage.from(ASSET_BUCKET).remove([ref.key]);
    if(error) throw error;
    // Signing a missing Supabase object can itself fail. Verify absence using its directory.
    const separator=ref.key.lastIndexOf("/"),folder=separator<0?"":ref.key.slice(0,separator),name=ref.key.slice(separator+1);
    const {data,error:listingError}=await supabaseAdmin.storage.from(ASSET_BUCKET).list(folder,{search:name,limit:100});
    if(listingError)throw listingError;
    if(data?.some(object=>object.name===name))throw new Error("Storage still contains a deleted object");
    return;
  }
  if(await verifyAsset(ref)) throw new Error("Storage still contains a deleted object");
}
export function validateAssetRef(ref: AssetRef): void {
  if (!["s3", "supabase"].includes(ref.provider) || !ref.key || ref.key.startsWith("/") ||
      ref.key.includes("\\") || ref.key.split("/").includes("..") || /^[a-z]+:/i.test(ref.key)) {
    throw new Error("Invalid storage asset reference");
  }
}
interface VideoAssetFields { storageProvider?: string | null; s3Key?: string | null; s3VideoUrl?: string | null; videoUrl?: string | null }
export function assetFromVideo(video: VideoAssetFields): AssetRef | null {
  const key = video.s3Key || video.s3VideoUrl;
  const provider = video.storageProvider;
  if ((provider === "s3" || provider === "supabase") && key && !/^https?:/i.test(key)) {
    const ref: AssetRef = { provider, key }; validateAssetRef(ref); return ref;
  }
  if (video.videoUrl) {
    try {
      const url = new URL(video.videoUrl);
      const match = url.pathname.match(/\/storage\/v1\/object\/(?:public|sign|authenticated)\/videos\/(.+)/);
      const supabaseHost = process.env.NEXT_PUBLIC_SUPABASE_URL ? new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).host : null;
      if (match && supabaseHost === url.host) {
        const ref: AssetRef = { provider: "supabase", key: decodeURIComponent(match[1]) };
        validateAssetRef(ref); return ref;
      }
      const bucket = process.env.AWS_S3_BUCKET;
      if (bucket && url.hostname.startsWith(`${bucket}.s3`) && url.hostname.endsWith(".amazonaws.com")) {
        const ref: AssetRef = { provider: "s3", key: decodeURIComponent(url.pathname.slice(1)) };
        validateAssetRef(ref); return ref;
      }
    } catch { return null; }
  }
  if (!provider && key && !/^https?:/i.test(key)) {
    const ref: AssetRef = { provider: "s3", key }; validateAssetRef(ref); return ref;
  }
  return null;
}
export async function getAssetUrl(ref: AssetRef, expiresSeconds = 300, downloadFilename?: string): Promise<string> {
  validateAssetRef(ref);
  const expiry = Math.min(Math.max(expiresSeconds, 1), 3600);
  if (ref.provider === "s3") return getPresignedUrl(ref.key, expiry, downloadFilename);
  const { data, error } = await supabaseAdmin.storage.from(ASSET_BUCKET).createSignedUrl(ref.key, expiry,
    downloadFilename ? { download: downloadFilename } : undefined);
  if (error || !data?.signedUrl) throw new Error("Unable to authorize storage access");
  return data.signedUrl;
}
export async function verifyAsset(ref: AssetRef): Promise<boolean> {
  validateAssetRef(ref);
  if (ref.provider === "s3") return verifyS3Object(ref.key);
  const response = await fetch(await getAssetUrl(ref), { method: "HEAD", signal: AbortSignal.timeout(30000), cache: "no-store" });
  if (response.status === 404) return false;
  if (!response.ok) throw new Error(`Storage verification failed (${response.status})`);
  return Number(response.headers.get("content-length") ?? 1) > 0;
}
export async function openAssetStream(ref: AssetRef): Promise<Readable> {
  validateAssetRef(ref);
  if (ref.provider === "s3") return openS3Stream(ref.key);
  const response = await fetch(await getAssetUrl(ref), { signal: AbortSignal.timeout(30 * 60 * 1000), cache: "no-store" });
  if (!response.ok || !response.body) throw new Error(`Storage download failed (${response.status})`);
  return Readable.fromWeb(response.body as import("node:stream/web").ReadableStream<Uint8Array>);
}
export async function downloadAsset(ref: AssetRef, targetPath: string): Promise<void> {
  await mkdir(dirname(targetPath), { recursive: true });
  await pipeline(await openAssetStream(ref), createWriteStream(targetPath));
}
export async function uploadAssetFile(ref: AssetRef, filePath: string, contentType: string): Promise<void> {
  validateAssetRef(ref);
  if (ref.provider === "s3") { await uploadFileToS3(ref.key, filePath, contentType); return; }
  const stream = createReadStream(filePath);
  try {
    const { error } = await supabaseAdmin.storage.from(ASSET_BUCKET).upload(ref.key, stream,
      { contentType, upsert: true, cacheControl: "0", duplex: "half" });
    if (error) throw error;
  } finally { stream.destroy(); }
}
