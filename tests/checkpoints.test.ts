import test from "node:test";
import assert from "node:assert/strict";
import { emptyManifest,readManifest,runCheckpointedPipeline,inspectResume,STAGES,ApprovalRequired,type Manifest,type StageKey,type PipelineDependencies } from "../lib/generation/checkpoints";

function fixture(fail?:StageKey){
  let saved:Manifest=emptyManifest();let enabled=true;let revision=1;
  const missing=new Set<string>();const calls:StageKey[]=[];
  const deps:PipelineDependencies={save:async m=>{saved=structuredClone(m);},verify:async a=>!missing.has(a.key),input:(stage,outputs)=>({revision,stage,outputs}),run:async stage=>{calls.push(stage);if(enabled&&stage===fail)throw new Error("Injected provider failure");return {data:{stage},artifacts:[{provider:"s3",key:stage}]};}};
  return {deps,calls,missing,get saved(){return saved;},disableFailure(){enabled=false;},changeRevision(){revision++;}};
}
for(const stage of STAGES)test(`failure at ${stage} resumes without repeating completed providers`,async()=>{
  const f=fixture(stage);await assert.rejects(runCheckpointedPipeline(emptyManifest(),f.deps),/Injected/);
  const prior=[...f.calls];f.disableFailure();
  const preview=await inspectResume(f.saved,f.deps);assert.equal(preview.resumeFrom,stage);assert.deepEqual(preview.reusedStages,STAGES.slice(0,STAGES.indexOf(stage)));
  await runCheckpointedPipeline(readManifest(f.saved),f.deps);
  assert.deepEqual(f.calls.slice(prior.length),STAGES.slice(STAGES.indexOf(stage)));
  assert.equal(f.saved.stages.storage?.status,"completed");
});
test("a new worker instance resumes the persisted JSON manifest",async()=>{
  const first=fixture("assembly");await assert.rejects(runCheckpointedPipeline(emptyManifest(),first.deps));
  const restarted=fixture();await runCheckpointedPipeline(readManifest(JSON.parse(JSON.stringify(first.saved))),restarted.deps);
  assert.deepEqual(restarted.calls,["assembly","captions","storage"]);
});
test("missing or changed assets rebuild their dependent stages",async()=>{
  const f=fixture();await runCheckpointedPipeline(emptyManifest(),f.deps);f.missing.add("visuals");f.calls.length=0;
  await runCheckpointedPipeline(readManifest(f.saved),f.deps);assert.deepEqual(f.calls,["visuals","assembly","captions","storage"]);
});
test("tampered checkpoint output is rejected even if its asset exists",async()=>{
  const f=fixture();await runCheckpointedPipeline(emptyManifest(),f.deps);
  const corrupt=readManifest(f.saved);corrupt.stages.voice!.output!.data={unexpected:"replacement"};f.calls.length=0;
  await runCheckpointedPipeline(corrupt,f.deps);assert.deepEqual(f.calls,["voice","visuals","assembly","captions","storage"]);
});
test("malformed manifest/checkpoint data recovers as incomplete work",()=>{
  const invalid=readManifest({version:1,stages:{voice:{status:"completed",output:{artifacts:null}}},sceneCache:{voice:null}});
  assert.equal(invalid.stages.voice,undefined);assert.deepEqual(invalid.sceneCache.voice,[]);
});
test("changed input revision invalidates earlier outputs",async()=>{
  const f=fixture();await runCheckpointedPipeline(emptyManifest(),f.deps);f.calls.length=0;f.changeRevision();await runCheckpointedPipeline(readManifest(f.saved),f.deps);assert.deepEqual(f.calls,[...STAGES]);
});
test("storyboard approval pause preserves the completed script",async()=>{
  const f=fixture();const run=f.deps.run;let approved=false;
  f.deps.run=async(stage,outputs,manifest)=>{if(stage==="voice"&&!approved)throw new ApprovalRequired();return run(stage,outputs,manifest);};
  await assert.rejects(runCheckpointedPipeline(emptyManifest(),f.deps),ApprovalRequired);
  assert.equal(f.saved.stages.script?.status,"completed");assert.equal(f.saved.stages.voice?.status,"pending");
  approved=true;f.calls.length=0;await runCheckpointedPipeline(readManifest(f.saved),f.deps);assert.equal(f.calls.includes("script"),false);
});
