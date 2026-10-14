import { createHash } from "node:crypto";
import { openAssetStream,verifyAsset,type AssetRef } from "../assets";
import type { Artifact } from "./checkpoints";
export async function describeArtifact(ref:AssetRef):Promise<Artifact> {
  const hash=createHash("sha256"); let size=0;
  for await(const chunk of await openAssetStream(ref)) {
    const bytes=Buffer.isBuffer(chunk)?chunk:Buffer.from(chunk);
    size+=bytes.length; hash.update(bytes);
  }
  if(!size) throw new Error("Generated asset is empty");
  return {...ref,size,sha256:hash.digest("hex")};
}
export async function verifyCheckpointArtifact(asset:Artifact) {
  if(!await verifyAsset(asset)) return false;
  if(!asset.sha256) return true;
  const actual=await describeArtifact(asset);
  return actual.sha256===asset.sha256 && actual.size===asset.size;
}
