"use client";

/**
 * Client component that connects to the SSE endpoint and drives the
 * StageTracker + completion state.
 */
import { useEffect, useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ExternalLink, Download, PartyPopper } from "lucide-react";
import { toast } from "sonner";
import { StageTracker } from "./StageTracker";
import type { StageUpdate } from "@/lib/worker";

interface ProgressSSEProps {
  jobId: string;
}

interface JobState {
  stages: StageUpdate[];
  status: "processing" | "completed" | "failed";
  youtubeUrl?: string;
  youtubeId?: string;
  title?: string;
  videoId?: string;
}

export function ProgressSSE({ jobId }: ProgressSSEProps) {
  const [state, setState] = useState<JobState>({
    stages: [],
    status: "processing",
  });
  const [confetti, setConfetti] = useState(false);
  const [downloading, setDownloading] = useState(false);

  const fetchInitialState = useCallback(async () => {
    try {
      const res = await fetch(`/api/jobs/${jobId}`);
      if (!res.ok) return;
      const data = await res.json();
      setState((prev) => ({
        ...prev,
        stages: data.stages ?? [],
        status: data.status,
        youtubeUrl: data.youtubeUrl,
        youtubeId: data.youtubeId,
        title: data.title,
        videoId: data.id,
      }));
    } catch {
      // ignore
    }
  }, [jobId]);

  const handleDownload = async () => {
    if (!state.videoId) {
      toast.error("Video ID not found");
      return;
    }

    setDownloading(true);
    toast.loading("Preparing download...", { id: "download" });

    try {
      const res = await fetch(`/api/download/${state.videoId}`);
      
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || "Failed to get download URL");
      }
      
      const data = await res.json();
      
      if (!data.url) {
        throw new Error("Missing download URL");
      }

      toast.success("Starting download...", { id: "download" });
      
      // Trigger browser download
      window.open(data.url, "_blank");
      
      // Fallback: if window.open is blocked, use location.href
      setTimeout(() => {
        if (!document.hasFocus()) {
          window.location.href = data.url;
        }
      }, 100);
      
    } catch (err) {
      console.error("Download failed:", err);
      toast.error(`Download failed: ${(err as Error).message}`, { id: "download" });
    } finally {
      setDownloading(false);
    }
  };

  useEffect(() => {
    // Load initial state
    fetchInitialState();

    // Connect to SSE
    const eventSource = new EventSource(`/api/jobs/${jobId}/sse`);

    eventSource.onmessage = (event) => {
      try {
        const update = JSON.parse(event.data) as StageUpdate & {
          type?: string;
          status?: string;
        };

        // Completion signal
        if (update.name === "complete" || update.type === "done") {
          setState((prev) => ({
            ...prev,
            status: "completed",
            youtubeUrl: update.log ?? prev.youtubeUrl,
          }));
          setConfetti(true);
          eventSource.close();
          // Refresh full state from API
          fetchInitialState();
          return;
        }

        // Stage update
        if (update.stage) {
          setState((prev) => {
            const stages = [...prev.stages];
            // Replace or append
            const idx = stages.findLastIndex((s) => s.stage === update.stage);
            if (idx >= 0 && update.status !== "active") {
              stages[idx] = update;
            } else {
              stages.push(update);
            }
            return { ...prev, stages };
          });
        }

        // Error
        if (update.status === "error") {
          setState((prev) => ({ ...prev, status: "failed" }));
          eventSource.close();
        }
      } catch {
        // ignore parse errors
      }
    };

    eventSource.onerror = () => {
      // SSE closed — fall back to polling
      eventSource.close();
      const poll = setInterval(async () => {
        const res = await fetch(`/api/jobs/${jobId}`);
        if (!res.ok) return;
        const data = await res.json();
        setState((prev) => ({
          ...prev,
          stages: data.stages ?? prev.stages,
          status: data.status,
          youtubeUrl: data.youtubeUrl ?? prev.youtubeUrl,
          title: data.title ?? prev.title,
        }));
        if (data.status === "completed" || data.status === "failed") {
          clearInterval(poll);
          if (data.status === "completed") setConfetti(true);
        }
      }, 3000);
    };

    return () => eventSource.close();
  }, [jobId, fetchInitialState]);

  // Deduplicate stages for display (keep latest status per stage number)
  const displayStages = deduplicateStages(state.stages);

  return (
    <div className="w-full">
      <StageTracker stages={displayStages} />

      {/* Completion card */}
      <AnimatePresence>
        {state.status === "completed" && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            transition={{ duration: 0.5, ease: "easeOut" }}
            className="mt-8 p-6 rounded-2xl border border-violet-500/30 bg-violet-950/20 text-center"
          >
            {confetti && <ConfettiEffect />}
            <div className="flex items-center justify-center gap-2 mb-3">
              <PartyPopper className="w-6 h-6 text-violet-400" />
              <h2 className="text-xl font-semibold text-white">
                {state.youtubeUrl ? "Your video is live!" : "Your video is ready!"}
              </h2>
            </div>
            {state.title && (
              <p className="text-zinc-400 text-sm mb-4">{state.title}</p>
            )}
            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              {state.youtubeUrl && (
                <a
                  href={state.youtubeUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 px-6 py-3 bg-red-600 hover:bg-red-500 text-white rounded-lg font-medium transition-colors duration-300"
                >
                  <ExternalLink className="w-4 h-4" />
                  View on YouTube
                </a>
              )}
              <button
                onClick={handleDownload}
                disabled={downloading}
                className="inline-flex items-center gap-2 px-6 py-3 bg-[#1f1f1f] hover:bg-zinc-700 text-zinc-200 rounded-lg font-medium transition-colors duration-300 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {downloading ? (
                  <>
                    <span className="w-4 h-4 border-2 border-zinc-400 border-t-transparent rounded-full animate-spin" />
                    Preparing...
                  </>
                ) : (
                  <>
                    <Download className="w-4 h-4" />
                    Download MP4
                  </>
                )}
              </button>
            </div>
            {!state.youtubeUrl && (
              <p className="text-zinc-500 text-xs mt-4">
                YouTube upload failed. You can still download your video or retry the upload from the dashboard.
              </p>
            )}
          </motion.div>
        )}

        {state.status === "failed" && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="mt-8 p-6 rounded-2xl border border-red-500/30 bg-red-950/20 text-center"
          >
            <p className="text-red-400 font-medium">Video generation failed</p>
            <p className="text-zinc-500 text-sm mt-1">
              Check the error above and try again.
            </p>
            <a
              href="/"
              className="inline-block mt-4 px-6 py-2 bg-[#1f1f1f] hover:bg-zinc-700 text-zinc-200 rounded-lg text-sm transition-colors duration-300"
            >
              Try again
            </a>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/** Keep only the latest update per stage number. */
function deduplicateStages(stages: StageUpdate[]): StageUpdate[] {
  const map = new Map<number, StageUpdate>();
  for (const s of stages) {
    map.set(s.stage, s);
  }
  return Array.from(map.values()).sort((a, b) => a.stage - b.stage);
}

/** Simple CSS confetti burst. */
function ConfettiEffect() {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden rounded-2xl">
      {Array.from({ length: 20 }).map((_, i) => (
        <motion.div
          key={i}
          className="absolute w-2 h-2 rounded-full"
          style={{
            left: `${Math.random() * 100}%`,
            top: "-10px",
            backgroundColor: ["#7c3aed", "#a855f7", "#ec4899", "#f59e0b", "#10b981"][
              i % 5
            ],
          }}
          animate={{
            y: ["0%", "120%"],
            x: [`${(Math.random() - 0.5) * 200}px`],
            rotate: [0, Math.random() * 720],
            opacity: [1, 0],
          }}
          transition={{
            duration: 1.5 + Math.random(),
            delay: Math.random() * 0.5,
            ease: "easeIn",
          }}
        />
      ))}
    </div>
  );
}
