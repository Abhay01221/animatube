"use client";

/**
 * Client component that polls job status with Firebase authentication.
 * Replaces SSE with authenticated polling for reliable progress tracking.
 */
import { useEffect, useState, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ExternalLink, Download, PartyPopper } from "lucide-react";
import { toast } from "sonner";
import { auth } from "@/lib/firebase";
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
  const [authError, setAuthError] = useState(false);
  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const retryCountRef = useRef(0);

  const fetchJobState = useCallback(async () => {
    try {
      const user = auth.currentUser;
      if (!user) {
        console.error("[ProgressSSE] No authenticated user");
        setAuthError(true);
        return;
      }

      // Use cached token (only refreshes when expired)
      const token = await user.getIdToken(false);
      const res = await fetch(`/api/jobs/${jobId}`, {
        headers: {
          "Authorization": `Bearer ${token}`,
        },
      });

      if (res.status === 401) {
        console.error("[ProgressSSE] 401 Unauthorized - attempting token refresh");
        // Only refresh token on 401, then retry once
        const freshToken = await user.getIdToken(true);
        const retryRes = await fetch(`/api/jobs/${jobId}`, {
          headers: {
            "Authorization": `Bearer ${freshToken}`,
          },
        });
        
        if (!retryRes.ok) {
          setAuthError(true);
          return;
        }
        
        const data = await retryRes.json();
        updateJobState(data);
        return;
      }

      if (!res.ok) {
        console.error("[ProgressSSE] Fetch failed:", res.status, res.statusText);
        retryCountRef.current++;
        if (retryCountRef.current > 5) {
          toast.error("Failed to fetch job status. Please refresh the page.");
        }
        return;
      }

      const data = await res.json();
      updateJobState(data);
    } catch (error) {
      console.error("[ProgressSSE] Error fetching job state:", error);
      retryCountRef.current++;
    }
  }, [jobId]);

  const updateJobState = useCallback((data: any) => {
    console.log("[ProgressSSE] Job state:", data.status, "stages:", data.stages?.length);

    setState((prev) => ({
      ...prev,
      stages: data.stages ?? [],
      status: data.status,
      youtubeUrl: data.youtubeUrl,
      youtubeId: data.youtubeId,
      title: data.title,
      videoId: data.id,
    }));

    // Reset retry count on success
    retryCountRef.current = 0;

    // Stop polling if completed or failed
    if (data.status === "completed" || data.status === "failed") {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
        pollIntervalRef.current = null;
        console.log("[ProgressSSE] Polling stopped - job", data.status);
      }
      if (data.status === "completed") {
        setConfetti(true);
      }
    }
  }, []);

  const handleDownload = async () => {
    if (!state.videoId) {
      toast.error("Video ID not found");
      return;
    }

    setDownloading(true);
    toast.loading("Preparing download...", { id: "download" });

    try {
      const user = auth.currentUser;
      if (!user) {
        toast.error("Please sign in to download", { id: "download" });
        return;
      }

      // Use cached token
      const token = await user.getIdToken(false);
      const res = await fetch(`/api/download/${state.videoId}`, {
        headers: {
          "Authorization": `Bearer ${token}`,
        },
      });
      
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
    console.log("[ProgressSSE] Starting polling for job:", jobId);

    // Initial fetch
    fetchJobState();

    // Start polling every 2 seconds
    pollIntervalRef.current = setInterval(() => {
      fetchJobState();
    }, 2000);

    // Cleanup on unmount
    return () => {
      console.log("[ProgressSSE] Cleaning up polling");
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
        pollIntervalRef.current = null;
      }
    };
  }, [jobId, fetchJobState]);

  // Deduplicate stages for display (keep latest status per stage number)
  const displayStages = deduplicateStages(state.stages);

  if (authError) {
    return (
      <div className="mt-8 p-6 rounded-2xl border border-red-500/30 bg-red-950/20 text-center">
        <p className="text-red-400 font-medium">Authentication Error</p>
        <p className="text-zinc-500 text-sm mt-1">
          Please sign in again to view your video progress.
        </p>
        <a
          href="/sign-in"
          className="inline-block mt-4 px-6 py-2 bg-violet-600 hover:bg-violet-500 text-white rounded-lg text-sm transition-colors duration-300"
        >
          Sign In
        </a>
      </div>
    );
  }

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
