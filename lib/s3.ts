/** Private S3 objects. Persist keys; issue signed URLs only after authorization. */
import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand, HeadObjectCommand, ListObjectVersionsCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { Readable } from "node:stream";
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";

let client: S3Client | undefined;
export function getS3Client(): S3Client {
  if (!client) {
    const accessKeyId = process.env.AWS_ACCESS_KEY_ID?.trim();
    const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY?.trim();
    client = new S3Client({ region: process.env.AWS_REGION?.trim() || "us-east-1",
      ...(process.env.S3_ENDPOINT_URL?{endpoint:process.env.S3_ENDPOINT_URL,forcePathStyle:true}:{}),
      ...(accessKeyId && secretAccessKey ? { credentials: { accessKeyId, secretAccessKey } } : {}) });
  }
  return client;
}
export function getS3Bucket(): string {
  const bucket = process.env.AWS_S3_BUCKET?.trim();
  if (!bucket) throw new Error("AWS_S3_BUCKET is not configured");
  return bucket;
}
export async function uploadToS3(key: string, body: Buffer | Readable | string, contentType: string): Promise<string> {
  await getS3Client().send(new PutObjectCommand({ Bucket: getS3Bucket(), Key: key, Body: body,
    ContentType: contentType, CacheControl: "private, max-age=0" }));
  return key;
}
export async function uploadFileToS3(key: string, filePath: string, contentType: string): Promise<string> {
  const info = await stat(filePath);
  const stream = createReadStream(filePath);
  try {
    await getS3Client().send(new PutObjectCommand({ Bucket: getS3Bucket(), Key: key, Body: stream,
      ContentLength: info.size, ContentType: contentType, CacheControl: "private, max-age=0" }));
    return key;
  } finally { stream.destroy(); }
}
export async function openS3Stream(key: string): Promise<Readable> {
  const response = await getS3Client().send(new GetObjectCommand({ Bucket: getS3Bucket(), Key: key }));
  if (!response.Body) throw new Error("Storage object has no content");
  return response.Body as Readable;
}
export async function downloadFromS3(key: string): Promise<Buffer> {
  const stream = await openS3Stream(key);
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  return Buffer.concat(chunks);
}
export async function verifyS3Object(key: string): Promise<boolean> {
  try {
    const response = await getS3Client().send(new HeadObjectCommand({ Bucket: getS3Bucket(), Key: key }));
    return (response.ContentLength ?? 0) > 0;
  } catch (error) {
    const status = (error as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode;
    if (status === 404 || (error instanceof Error && error.name === "NotFound")) return false;
    throw error;
  }
}
export async function getPresignedUrl(key: string, expiresIn = 300, downloadFilename?: string): Promise<string> {
  return getSignedUrl(getS3Client(), new GetObjectCommand({ Bucket: getS3Bucket(), Key: key,
    ...(downloadFilename ? { ResponseContentDisposition: `attachment; filename="${downloadFilename.replace(/["\r\n\\]/g, "_")}"` } : {}) }),
    { expiresIn: Math.min(Math.max(expiresIn, 1), 3600) });
}
export async function deleteFromS3(key: string): Promise<void> {
  await getS3Client().send(new DeleteObjectCommand({ Bucket: getS3Bucket(), Key: key }));
}
/** Delete all versions and delete markers, so versioning does not keep billed video copies. */
export async function deleteS3Permanently(key:string):Promise<void>{
  let keyMarker:string|undefined,versionMarker:string|undefined;
  const versions:{Key:string;VersionId?:string}[]=[];
  do{
    const page=await getS3Client().send(new ListObjectVersionsCommand({Bucket:getS3Bucket(),Prefix:key,KeyMarker:keyMarker,VersionIdMarker:versionMarker}));
    for(const item of [...page.Versions??[],...page.DeleteMarkers??[]]) if(item.Key===key) versions.push({Key:key,VersionId:item.VersionId});
    keyMarker=page.IsTruncated?page.NextKeyMarker:undefined;versionMarker=page.NextVersionIdMarker;
    if(page.IsTruncated&&!keyMarker)throw new Error("Storage version listing was incomplete");
  }while(keyMarker);
  if(!versions.length){await deleteFromS3(key);return;}
  for(const version of versions)await getS3Client().send(new DeleteObjectCommand({Bucket:getS3Bucket(),...version}));
}
/** Legacy public URL parser support only; new access must use signed URLs. */
export function s3Url(key: string): string {
  return `https://${getS3Bucket()}.s3.${process.env.AWS_REGION?.trim() || "us-east-1"}.amazonaws.com/${key}`;
}
