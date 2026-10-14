import assert from "node:assert/strict";
import test from "node:test";
import { isResumable, latestStages, needsProgressPolling, safeCallback, uploadLabel } from "./generation-state";

test("warnings and automatic retries do not stop tracking", () => {
  assert.equal(needsProgressPolling({ status: "processing", stages: [{ stage: 2, name: "Voice", status: "error", log: "Retrying" }] }), true);
  assert.equal(needsProgressPolling({ status: "failed", renderStatus: "retrying" }), true);
  assert.equal(needsProgressPolling({ status: "awaiting_approval" }), true);
});

test("render completion keeps tracking upload but terminal render failure stops", () => {
  assert.equal(needsProgressPolling({ status: "completed", renderStatus: "completed", uploadStatus: "uploading" }), true);
  assert.equal(needsProgressPolling({ status: "completed", uploadStatus: "failed" }), false);
  assert.equal(needsProgressPolling({ status: "failed" }), false);
  assert.equal(isResumable({ status: "failed" }), true);
  assert.equal(isResumable({ status: "completed" }), false);
});

test("latest checkpoint update replaces earlier failure", () => {
  assert.deepEqual(latestStages([{ stage: 1, name: "Script", status: "error" }, { stage: 1, name: "Script", status: "done" }]).map((stage) => stage.status), ["done"]);
});

test("private uploads are never called live and redirects remain local", () => {
  assert.equal(uploadLabel("uploaded"), "Uploaded to YouTube");
  assert.equal(uploadLabel("not_connected"), "YouTube is not connected");
  assert.equal(safeCallback("//example.com"), "/dashboard");
  assert.equal(safeCallback("javascript:alert(1)"), "/dashboard");
  assert.equal(safeCallback("/\\example.com"), "/dashboard");
  assert.equal(safeCallback("/"), "/");
});
