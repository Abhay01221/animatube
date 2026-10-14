"use client";

import { useEffect, useState,useRef } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { useAuth } from "./auth/AuthProvider";

interface ResumePreview {
  resumeFrom: string | null;
  reusedStages: string[];
  invalidStages: string[];
  additionalCredits: number;
  canResume: boolean;
  revision?:number;
}

export function ResumeControls({ jobId, onResumed }: { jobId: string; onResumed?: () => void }) {
  const { user } = useAuth();
  const router = useRouter();
  const [preview, setPreview] = useState<ResumePreview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [restartReview, setRestartReview] = useState(false);
  const restartKey=useRef<string|null>(null);

  useEffect(() => {
    if (!user) return;
    const controller = new AbortController();
    async function load() {
      try {
        const token = await user!.getIdToken();
        const response = await fetch(`/api/jobs/${encodeURIComponent(jobId)}/resume`, { headers: { Authorization: `Bearer ${token}` }, signal: controller.signal });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error ?? "Unable to verify saved stages");
        setPreview(result);
      } catch (error) { if (!controller.signal.aborted) setError(error instanceof Error ? error.message : "Unable to verify saved stages"); }
    }
    void load();
    return () => controller.abort();
  }, [jobId, user]);

  async function submit(restart: boolean) {
    if (!user || busy || !restart && !preview?.canResume) return;
    setBusy(true);
    try {
      const token = await user.getIdToken();
      const key=restartKey.current??crypto.randomUUID();if(restart)restartKey.current=key;
      const response = await fetch(`/api/jobs/${encodeURIComponent(jobId)}/${restart ? "restart" : "resume"}`, { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json",...(restart?{"Idempotency-Key":key}:{}) }, body: JSON.stringify({ jobId,expectedAdditionalCredits:preview?.additionalCredits,expectedRevision:preview?.revision }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Unable to queue generation");
      toast.success(restart ? "A new generation was queued" : "Resuming from your saved work");
      if (result.jobId && result.jobId !== jobId) router.push(`/generate/${encodeURIComponent(result.jobId)}`);
      else onResumed?.();
    } catch (error) { toast.error(error instanceof Error ? error.message : "Unable to resume"); }
    finally { setBusy(false); }
  }

  return <section className="mt-5 space-y-3 rounded-xl border border-amber-800/60 bg-amber-950/10 p-4" aria-label="Recovery actions">
    <h3 className="font-medium text-amber-200">Continue with your saved instructions</h3>
    {error ? <p role="alert" className="text-sm text-red-300">{error}</p> : preview ? <div className="space-y-1 text-sm text-zinc-300"><p>Resume from: <strong>{preview.resumeFrom ?? "all stages complete"}</strong></p><p>Reuse: {preview.reusedStages.length ? preview.reusedStages.join(", ") : "No valid completed stages"}</p>{preview.invalidStages.length > 0 && <p>Rebuild missing or outdated outputs: {preview.invalidStages.join(", ")}</p>}<p>Additional charge: {preview.additionalCredits} credit{preview.additionalCredits === 1 ? "" : "s"}{preview.additionalCredits > 0 ? " (the previous attempt was refunded)" : ""}.</p></div> : <p className="text-sm text-zinc-400">Verifying your saved outputs…</p>}
    <div className="flex flex-wrap gap-3"><button onClick={() => submit(false)} disabled={busy || !preview?.canResume} className="rounded-lg bg-violet-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-40">{busy ? "Queuing…" : "Resume generation"}</button><button onClick={() => setRestartReview((shown) => !shown)} disabled={busy} className="rounded-lg border border-zinc-700 px-4 py-2 text-sm text-zinc-300">Start over</button></div>
    {restartReview && <div className="space-y-2 rounded-lg bg-zinc-900 p-3 text-sm text-zinc-300"><p>Start a new video with the original prompt and options. This regenerates all stages and costs 1 credit.</p><button disabled={busy} onClick={() => submit(true)} className="rounded-md bg-zinc-700 px-3 py-2 text-white disabled:opacity-40">Start over · 1 credit</button></div>}
  </section>;
}
