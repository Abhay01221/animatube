export interface ProgressStage {
  stage: number;
  name: string;
  status: string;
  log?: string;
}

export interface GenerationState {
  id?: string;
  jobId?: string;
  status: string;
  renderStatus?: string | null;
  uploadStatus?: string | null;
  title?: string | null;
  prompt?: string;
  videoUrl?: string | null;
  playbackKey?:string;
  youtubeUrl?: string | null;
  visibility?: string;
  renderError?: string | null;
  uploadError?: string | null;
  stages?: ProgressStage[];
  resumeAvailable?: boolean;
  credits?: number;
  createdAt?: string;
  generationManifest?: { stages?: Record<string, { status: string; error?: string }> } | null;
}

const RUNNING = new Set(["pending", "queued", "processing", "running", "retrying", "awaiting_approval"]);

export function needsProgressPolling(state: GenerationState): boolean {
  const render = state.renderStatus ?? state.status;
  if (["failed", "interrupted", "cancelled"].includes(render)) return false;
  return RUNNING.has(render) || ["pending", "queued", "processing", "uploading", "retrying"].includes(state.uploadStatus ?? "");
}

export function isResumable(state: GenerationState): boolean {
  return state.resumeAvailable === true || ["failed", "interrupted", "cancelled"].includes(state.renderStatus ?? state.status);
}

export function latestStages(stages: ProgressStage[]): ProgressStage[] {
  return Array.from(new Map(stages.map((stage) => [stage.stage, stage])).values()).sort((a, b) => a.stage - b.stage);
}

export function uploadLabel(status?: string | null): string {
  const labels: Record<string, string> = {
    uploaded: "Uploaded to YouTube", completed: "Uploaded to YouTube", uploading: "Uploading to YouTube", processing: "Uploading to YouTube",
    pending: "YouTube upload queued", queued: "YouTube upload queued", retrying: "Retrying YouTube upload", failed: "YouTube upload failed",
    not_connected: "YouTube is not connected", not_requested: "YouTube upload was not requested", skipped: "YouTube upload was not requested",
  };
  return labels[status ?? ""] ?? "YouTube upload was not requested";
}

export function safeCallback(value: string | null | undefined): string {
  return value?.startsWith("/") && !value.startsWith("//") && !value.includes("\\") ? value : "/dashboard";
}
