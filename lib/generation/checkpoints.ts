import { createHash } from "node:crypto";
import { z } from "zod";

export const STAGES = ["script", "voice", "visuals", "assembly", "captions", "storage"] as const;
export type StageKey = typeof STAGES[number];
export type Json = null | boolean | number | string | Json[] | { [key: string]: Json };
export interface Artifact { provider: "s3" | "supabase"; key: string; sha256?: string; size?: number }
export interface StageOutput { data: Json; artifacts: Artifact[] }
export interface Checkpoint {
  status: "pending" | "running" | "completed" | "retrying" | "failed" | "cancelled";
  inputHash: string;
  outputHash?: string;
  output?: StageOutput;
  attempts: number;
  startedAt?: string;
  completedAt?: string;
  elapsedMs?: number;
  providerCost?: number;
  error?: string;
}
export interface Manifest {
  version: 1;
  scriptPlan?: {inputHash:string;storyPlan:Json;artifact:Artifact};
  stages: Partial<Record<StageKey, Checkpoint>>;
  sceneCache: { voice: Json[]; visuals: Json[]; assembly?: Json[] };
  updatedAt: string;
}
export function stableStringify(value: unknown): string {
  if (value === undefined) return "null";
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  const object = value as Record<string, unknown>;
  return `{${Object.keys(object).filter(k => object[k] !== undefined).sort().map(k => `${JSON.stringify(k)}:${stableStringify(object[k])}`).join(",")}}`;
}
export const fingerprint = (value: unknown) => createHash("sha256").update(stableStringify(value)).digest("hex");
export function emptyManifest(): Manifest {
  return { version: 1, stages: {}, sceneCache: { voice: [], visuals: [] }, updatedAt: new Date().toISOString() };
}
export function readManifest(value: unknown): Manifest {
  if (!value || typeof value !== "object") return emptyManifest();
  const candidate = value as Partial<Manifest>;
  if (candidate.version !== 1 || !candidate.stages || typeof candidate.stages !== "object") return emptyManifest();
  // JSON round-trip prevents accidental mutation of the database object's snapshot.
  const copy = JSON.parse(JSON.stringify(candidate)) as Manifest;
  const artifact=z.object({provider:z.enum(["s3","supabase"]),key:z.string().min(1),sha256:z.string().regex(/^[a-f0-9]{64}$/).optional(),size:z.number().int().positive().optional()});
  const checkpoint=z.object({status:z.enum(["pending","running","completed","retrying","failed","cancelled"]),inputHash:z.string(),outputHash:z.string().optional(),output:z.object({data:z.json(),artifacts:z.array(artifact)}).optional(),attempts:z.number().int().nonnegative(),startedAt:z.string().optional(),completedAt:z.string().optional(),elapsedMs:z.number().nonnegative().optional(),providerCost:z.number().nonnegative().optional(),error:z.string().optional()});
  const plan=z.object({inputHash:z.string(),storyPlan:z.json(),artifact}).safeParse(copy.scriptPlan);
  if(plan.success)copy.scriptPlan=plan.data as Manifest["scriptPlan"];else delete copy.scriptPlan;
  for(const stage of STAGES){const parsed=checkpoint.safeParse(copy.stages[stage]);if(parsed.success)copy.stages[stage]=parsed.data as Checkpoint;else delete copy.stages[stage];}
  const cache=copy.sceneCache;
  copy.sceneCache={voice:Array.isArray(cache?.voice)?cache.voice.filter(isObject):[],visuals:Array.isArray(cache?.visuals)?cache.visuals.filter(isObject):[],assembly:Array.isArray(cache?.assembly)?cache.assembly.filter(isObject):[]};
  return copy;
}
function isObject(value:Json):boolean{return value!==null&&typeof value==="object"&&!Array.isArray(value);}
export class ApprovalRequired extends Error {
  constructor() { super("Review and approve your storyboard to continue."); this.name = "ApprovalRequired"; }
}
export interface PipelineDependencies {
  save(manifest: Manifest): Promise<void>;
  verify(artifact: Artifact): Promise<boolean>;
  input(stage: StageKey, outputs: Partial<Record<StageKey, StageOutput>>): unknown;
  run(stage: StageKey, outputs: Partial<Record<StageKey, StageOutput>>, manifest: Manifest): Promise<StageOutput>;
  event?(stage: StageKey, status: Checkpoint["status"], reused: boolean): Promise<void>;
}
export async function checkpointValid(checkpoint: Checkpoint | undefined, hash: string, verify: PipelineDependencies["verify"]): Promise<boolean> {
  if (checkpoint?.status !== "completed" || checkpoint.inputHash !== hash || !checkpoint.output) return false;
  if (checkpoint.outputHash !== fingerprint(checkpoint.output)) return false;
  for (const asset of checkpoint.output.artifacts) if (!await verify(asset)) return false;
  return true;
}
export async function inspectResume(manifest: Manifest, deps: Pick<PipelineDependencies, "input" | "verify">) {
  const outputs: Partial<Record<StageKey, StageOutput>> = {};
  const reusedStages: StageKey[] = [];
  let invalid = false;
  const invalidStages: StageKey[] = [];
  for (const stage of STAGES) {
    if (!invalid && await checkpointValid(manifest.stages[stage], fingerprint(deps.input(stage, outputs)), deps.verify)) {
      reusedStages.push(stage);
      outputs[stage] = manifest.stages[stage]!.output;
    } else { invalid = true; invalidStages.push(stage); }
  }
  return { resumeFrom: invalidStages[0] ?? null, reusedStages, invalidStages };
}
export async function runCheckpointedPipeline(manifest: Manifest, deps: PipelineDependencies) {
  const outputs: Partial<Record<StageKey, StageOutput>> = {};
  let invalidated = false;
  for (const stage of STAGES) {
    const hash = fingerprint(deps.input(stage, outputs));
    const prior = manifest.stages[stage];
    if (!invalidated && await checkpointValid(prior, hash, deps.verify)) {
      outputs[stage] = prior!.output;
      await deps.event?.(stage, "completed", true);
      continue;
    }
    invalidated = true;
    // Descendants cannot remain marked completed after an upstream change/failure.
    for (const descendant of STAGES.slice(STAGES.indexOf(stage) + 1)) delete manifest.stages[descendant];
    const started = Date.now();
    manifest.stages[stage] = { status: "running", inputHash: hash, attempts: (prior?.attempts ?? 0) + 1, startedAt: new Date().toISOString() };
    manifest.updatedAt = new Date().toISOString();
    await deps.save(manifest);
    await deps.event?.(stage, "running", false);
    try {
      const output = await deps.run(stage, outputs, manifest);
      outputs[stage] = output;
      manifest.stages[stage] = { ...manifest.stages[stage]!, status: "completed", output, outputHash: fingerprint(output), completedAt: new Date().toISOString(), elapsedMs: Date.now() - started };
      manifest.updatedAt = new Date().toISOString();
      await deps.save(manifest);
      await deps.event?.(stage, "completed", false);
    } catch (error) {
      // Approval is a deliberate pause. Keep completed script and scene caches.
      manifest.stages[stage] = { ...manifest.stages[stage]!, status: error instanceof ApprovalRequired ? "pending" : "failed", error: error instanceof Error ? error.message : "Generation failed", elapsedMs: Date.now() - started };
      await deps.save(manifest);
      throw error;
    }
  }
  return outputs;
}
