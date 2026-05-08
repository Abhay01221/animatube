/**
 * AWS S3 helpers — upload, download, presigned URLs.
 * All intermediate assets use a 7-day lifecycle; final MP4s are permanent.
 */
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { Readable } from "stream";

const s3 = new S3Client({
  region: process.env.AWS_REGION ?? "us-east-1",
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
  },
});

const BUCKET = process.env.AWS_S3_BUCKET!;

/** Upload a Buffer or Readable stream to S3. Returns the S3 key. */
export async function uploadToS3(
  key: string,
  body: Buffer | Readable | string,
  contentType: string
): Promise<string> {
  await s3.send(
    new PutObjectCommand({
      Bucket: BUCKET,
      Key: key,
      Body: body,
      ContentType: contentType,
    })
  );
  return key;
}

/** Upload a local file path to S3 using a read stream. */
export async function uploadFileToS3(
  key: string,
  filePath: string,
  contentType: string
): Promise<string> {
  const fs = await import("fs");
  const stream = fs.createReadStream(filePath);
  return uploadToS3(key, stream, contentType);
}

/** Download an S3 object and return it as a Buffer. */
export async function downloadFromS3(key: string): Promise<Buffer> {
  const response = await s3.send(
    new GetObjectCommand({ Bucket: BUCKET, Key: key })
  );
  const stream = response.Body as Readable;
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    stream.on("data", (chunk: Buffer) => chunks.push(chunk));
    stream.on("end", () => resolve(Buffer.concat(chunks)));
    stream.on("error", reject);
  });
}

/** Generate a presigned GET URL (default 1 hour expiry). */
export async function getPresignedUrl(
  key: string,
  expiresIn = 3600
): Promise<string> {
  return getSignedUrl(
    s3,
    new GetObjectCommand({ Bucket: BUCKET, Key: key }),
    { expiresIn }
  );
}

/** Delete an object from S3. */
export async function deleteFromS3(key: string): Promise<void> {
  await s3.send(new DeleteObjectCommand({ Bucket: BUCKET, Key: key }));
}

/** Build the public S3 URL for a key (only works for public buckets). */
export function s3Url(key: string): string {
  return `https://${BUCKET}.s3.${process.env.AWS_REGION ?? "us-east-1"}.amazonaws.com/${key}`;
}
