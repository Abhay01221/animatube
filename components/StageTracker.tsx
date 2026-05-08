"use client";

/**
 * Animated stage tracker for the progress page.
 * Shows 6 stages with icons, labels, status, and live log lines.
 */
import { motion, AnimatePresence } from "framer-motion";
import {
  FileText,
  Mic,
  Film,
  Scissors,
  Subtitles,
  Upload,
  Check,
  X,
  Loader2,
} from "lucide-react";
import type { StageUpdate } from "@/lib/worker";

const STAGE_ICONS = [FileText, Mic, Film, Scissors, Subtitles, Upload];

const STAGE_LABELS = [
  "Writing script",
  "Generating voiceover",
  "Fetching visuals",
  "Assembling video",
  "Adding subtitles",
  "Uploading to YouTube",
];

interface StageTrackerProps {
  stages: StageUpdate[];
}

export function StageTracker({ stages }: StageTrackerProps) {
  // Build a map of stage number → latest update
  const stageMap = new Map<number, StageUpdate>();
  for (const update of stages) {
    if (update.stage >= 1 && update.stage <= 6) {
      stageMap.set(update.stage, update);
    }
  }

  return (
    <div className="w-full max-w-lg mx-auto space-y-3">
      {STAGE_LABELS.map((label, i) => {
        const stageNum = i + 1;
        const update = stageMap.get(stageNum);
        const status = update?.status ?? "pending";
        const log = update?.log;
        const Icon = STAGE_ICONS[i];

        return (
          <motion.div
            key={stageNum}
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: i * 0.05 }}
            className={`relative flex items-start gap-4 p-4 rounded-xl border transition-all duration-300 ${
              status === "active"
                ? "border-violet-500/50 bg-violet-950/20 shadow-[0_0_20px_rgba(124,58,237,0.15)]"
                : status === "done"
                ? "border-[#1f1f1f] bg-[#111111]/50"
                : status === "error"
                ? "border-red-500/50 bg-red-950/20"
                : "border-[#1f1f1f] bg-[#111111]/30 opacity-50"
            }`}
          >
            {/* Icon */}
            <div
              className={`flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center transition-all duration-300 ${
                status === "active"
                  ? "bg-violet-600 text-white"
                  : status === "done"
                  ? "bg-emerald-600/20 text-emerald-400"
                  : status === "error"
                  ? "bg-red-600/20 text-red-400"
                  : "bg-zinc-800 text-zinc-600"
              }`}
            >
              {status === "active" ? (
                <motion.div
                  animate={{ rotate: 360 }}
                  transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                >
                  <Loader2 className="w-5 h-5" />
                </motion.div>
              ) : status === "done" ? (
                <Check className="w-5 h-5" />
              ) : status === "error" ? (
                <X className="w-5 h-5" />
              ) : (
                <Icon className="w-5 h-5" />
              )}
            </div>

            {/* Content */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between gap-2">
                <span
                  className={`text-sm font-medium ${
                    status === "active"
                      ? "text-violet-300"
                      : status === "done"
                      ? "text-zinc-300"
                      : status === "error"
                      ? "text-red-300"
                      : "text-zinc-600"
                  }`}
                >
                  {label}
                </span>
                <StatusBadge status={status} />
              </div>

              {/* Live log line */}
              <AnimatePresence mode="wait">
                {log && (
                  <motion.p
                    key={log}
                    initial={{ opacity: 0, y: 4 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                    className={`mt-1 text-xs truncate ${
                      status === "error" ? "text-red-400" : "text-zinc-500"
                    }`}
                  >
                    {log}
                  </motion.p>
                )}
              </AnimatePresence>
            </div>

            {/* Active pulse ring */}
            {status === "active" && (
              <motion.div
                className="absolute inset-0 rounded-xl border border-violet-500/30"
                animate={{ opacity: [0.3, 0.8, 0.3] }}
                transition={{ duration: 2, repeat: Infinity }}
              />
            )}
          </motion.div>
        );
      })}
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const config = {
    pending: { label: "Pending", className: "text-zinc-600 bg-zinc-800" },
    active: {
      label: "Processing",
      className: "text-violet-300 bg-violet-900/50",
    },
    done: { label: "Done", className: "text-emerald-400 bg-emerald-900/30" },
    error: { label: "Error", className: "text-red-400 bg-red-900/30" },
  }[status] ?? { label: status, className: "text-zinc-500 bg-zinc-800" };

  return (
    <span
      className={`text-xs px-2 py-0.5 rounded-full font-medium ${config.className}`}
    >
      {config.label}
    </span>
  );
}
