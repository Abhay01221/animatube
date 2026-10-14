"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Download } from "lucide-react";
import { StageTracker } from "./StageTracker";
import { useAuth } from "./auth/AuthProvider";
import { ResumeControls } from "./ResumeControls";
import { StoryboardEditor } from "./StoryboardEditor";
import { PublicationTools } from "./PublicationTools";
import { VideoPlayer } from "./VideoPlayer";
import { isResumable, latestStages, needsProgressPolling, uploadLabel, type GenerationState } from "./generation-state";

export function ProgressSSE({ jobId }: { jobId: string }) {
  const { user, loading: authLoading } = useAuth();
  const [state, setState] = useState<GenerationState | null>(null);
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [busy, setBusy] = useState(false);
  const [showStoryboard, setShowStoryboard] = useState(false);
  const [observedAt, setObservedAt] = useState(0);
  const [downloadLink,setDownloadLink]=useState<string|null>(null);

  useEffect(()=>{
    const refresh=()=>{if(document.visibilityState==="visible")setRefreshKey(key=>key+1);};
    window.addEventListener("focus",refresh);document.addEventListener("visibilitychange",refresh);
    return()=>{window.removeEventListener("focus",refresh);document.removeEventListener("visibilitychange",refresh);};
  },[]);

  useEffect(() => {
    if (!user || authLoading) return;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    async function poll() {
      let continuePolling = true;
      try {
        const fetchStatus = async (forceRefresh: boolean) => {
          const token = await user!.getIdToken(forceRefresh);
          return fetch(`/api/jobs/${encodeURIComponent(jobId)}`, { headers: { Authorization: `Bearer ${token}` }, signal: controller.signal, cache: "no-store" });
        };
        let response = await fetchStatus(false);
        if (response.status === 401) response = await fetchStatus(true);
        if (!response.ok) {
          if ([401, 403, 404].includes(response.status)) continuePolling = false;
          throw new Error(response.status === 401 ? "Please sign in again to view progress." : response.status === 404 ? "This job was not found in your account." : "Progress could not be loaded. Reconnecting automatically…");
        }
        const result: GenerationState = await response.json();
        if (!controller.signal.aborted) { setState(current=>!result.videoUrl&&current?.playbackKey===result.playbackKey?{...result,videoUrl:current?.videoUrl}:result); setObservedAt(Date.now()); setConnectionError(null); }
        continuePolling = needsProgressPolling(result);
      } catch (error) {
        if (!controller.signal.aborted) setConnectionError(error instanceof Error ? error.message : "Reconnecting to progress…");
      } finally {
        if (!controller.signal.aborted && continuePolling) timer = setTimeout(poll, 2500);
      }
    }
    void poll();
    return () => { controller.abort(); clearTimeout(timer); };
  }, [jobId, user, authLoading, refreshKey]);

  async function download() {
    if (!state?.id || !user || busy) return;
    setBusy(true);
    setDownloadLink(null);
    try {
      const token = await user.getIdToken();
      const response = await fetch(`/api/download/${state.id}`, { headers: { Authorization: `Bearer ${token}` } });
      const result = await response.json();
      if (!response.ok || !result.url) throw new Error(result.error ?? "Download is unavailable");
      setDownloadLink(result.url);
      const link = document.createElement("a"); link.href = result.url; link.download = `${state.title ?? jobId}.mp4`; document.body.appendChild(link); link.click(); link.remove();
    } catch (error) { toast.error(error instanceof Error ? error.message : "Download failed"); }
    finally { setBusy(false); }
  }

  async function retryUpload() {
    if (!state?.id || !user || busy) return;
    setBusy(true);
    try {
      const token = await user.getIdToken();
      const response = await fetch(`/api/reupload/${state.id}`, { method: "POST", headers: { Authorization: `Bearer ${token}` } });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Unable to queue the upload");
      toast.success("Upload queued using your completed video"); setRefreshKey((key) => key + 1);
    } catch (error) { toast.error(error instanceof Error ? error.message : "Upload failed"); }
    finally { setBusy(false); }
  }

  if (authLoading) return <p role="status" className="text-center text-sm text-zinc-400">Restoring your session…</p>;
  if (!user) return <div className="rounded-xl border border-zinc-800 p-6 text-center"><p className="text-zinc-300">Sign in to view and resume your video.</p><Link className="mt-3 inline-block text-violet-300 underline" href={`/sign-in?callbackUrl=${encodeURIComponent(`/generate/${jobId}`)}`}>Sign in</Link></div>;

  const renderStatus = state?.renderStatus ?? state?.status;
  const ready = renderStatus === "completed";
  const awaitingApproval = renderStatus === "awaiting_approval";
  const resumable = state ? isResumable(state) : false;
  const elapsedMinutes = state?.createdAt ? Math.max(0, Math.floor((observedAt - new Date(state.createdAt).getTime()) / 60000)) : null;
  const headline = ready ? "Your video is ready" : awaitingApproval ? "Your storyboard is ready for review" : resumable ? "Generation needs attention" : state ? "Generation in progress" : "Loading saved progress…";

  return <div className="w-full space-y-5">
    <div aria-live="polite"><h2 className="text-xl font-semibold text-white">{headline}</h2><p className="mt-2 text-sm text-zinc-400">{renderStatus?.replaceAll("_", " ") ?? "Connecting"}{elapsedMinutes !== null && !ready ? ` · ${elapsedMinutes} minutes since creation` : ""}{typeof state?.credits === "number" ? ` · ${state.credits} credits available` : ""}</p>{state?.title && <p className="mt-2 text-zinc-300">{state.title}</p>}</div>
    <button onClick={()=>setRefreshKey(key=>key+1)} className="text-sm text-violet-300 underline">Refresh status</button>
    {connectionError && <div className="rounded-lg border border-amber-800 p-3 text-sm text-amber-200" role="status">{connectionError}<button onClick={() => setRefreshKey((key) => key + 1)} className="ml-3 underline">Refresh progress</button></div>}
    {awaitingApproval && <div className="rounded-lg border border-violet-800 bg-violet-950/20 p-4" role="status"><p className="font-medium text-violet-200">Next step: approve your storyboard</p><p className="mt-1 text-sm text-zinc-300">Review the saved scenes below, then choose Approve and render. Voiceover, visuals, assembly, captions, and final storage will continue automatically.</p></div>}
    {awaitingApproval && <StoryboardEditor jobId={jobId} editable onSaved={() => setRefreshKey((key) => key + 1)} />}
    {state?.renderError && <p role="alert" className="rounded-lg bg-red-950/20 p-3 text-sm text-red-300">{state.renderError}</p>}
    {resumable && <ResumeControls jobId={jobId} onResumed={() => setRefreshKey((key) => key + 1)} />}
    {ready && <section className="space-y-4 rounded-xl border border-emerald-900 bg-emerald-950/10 p-4" aria-label="Completed video">
      <button onClick={download} disabled={busy || !state?.id} className="flex w-full items-center justify-center gap-2 rounded-lg bg-violet-600 px-4 py-3 text-base font-semibold text-white hover:bg-violet-500 disabled:opacity-40"><Download className="h-5 w-5" aria-hidden="true"/>{busy ? "Preparing download…" : "Download video (MP4)"}</button>
      {downloadLink&&<a href={downloadLink} download className="block rounded border border-violet-500 px-4 py-3 text-center font-medium text-violet-200">Save MP4 · click if download did not start</a>}
      {state?.videoUrl && <VideoPlayer key={state.playbackKey??state.id} src={state.videoUrl} controls preload="metadata" className="max-h-[70vh] w-full rounded-lg" aria-label={state.title ?? "Generated video"} />}
      {state?.id&&<PublicationTools id={state.id} onPublished={()=>setRefreshKey(key=>key+1)}/>}
      <div className="border-t border-zinc-800 pt-3"><p className="text-sm text-zinc-300">{uploadLabel(state?.uploadStatus)}{state?.youtubeUrl && state.visibility ? ` · ${state.visibility}` : ""}</p>{state?.uploadError && <p className="mt-2 text-sm text-amber-300">{state.uploadError}</p>}
        {state?.youtubeUrl && <a href={state.youtubeUrl} target="_blank" rel="noopener noreferrer" className="mt-2 inline-block text-sm text-violet-300 underline">View on YouTube</a>}
        {state?.uploadStatus === "failed" && <button onClick={retryUpload} disabled={busy} className="mt-3 rounded-md border border-violet-800 px-3 py-2 text-sm text-violet-300 disabled:opacity-40">Retry upload · Reuse completed video</button>}
        {["not_connected", "not_requested", "skipped"].includes(state?.uploadStatus ?? "") && <Link href="/settings" className="mt-2 inline-block text-sm text-zinc-400 underline">Manage YouTube connection</Link>}
      </div>
    </section>}
    <StageTracker stages={latestStages(state?.stages ?? [])} />
    {!awaitingApproval && state && <button onClick={() => setShowStoryboard((shown) => !shown)} className="text-sm text-violet-300 underline">{showStoryboard ? "Hide storyboard" : "View storyboard"}</button>}
    {!awaitingApproval && showStoryboard && <StoryboardEditor jobId={jobId} editable={resumable || ready} onSaved={() => setRefreshKey((key) => key + 1)} />}
  </div>;
}
