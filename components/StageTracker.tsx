"use client";

import { Check, Circle, Loader2, X } from "lucide-react";
import type { ProgressStage } from "./generation-state";

const LABELS = ["Script and storyboard", "Voiceover", "Visuals", "Assembly", "Captions", "Final storage"];

export function StageTracker({ stages }: { stages: ProgressStage[] }) {
  const map = new Map(stages.map((stage) => [stage.stage, stage]));
  return <ol aria-label="Generation stages" className="space-y-3">
    {LABELS.map((label, index) => {
      const update = map.get(index + 1);
      const status = update?.status ?? "pending";
      const done = ["done", "completed"].includes(status);
      const active = ["active", "running", "processing", "retrying"].includes(status);
      const failed = ["error", "failed"].includes(status);
      return <li key={label} className={`flex items-start gap-3 rounded-xl border p-4 ${failed ? "border-red-900 bg-red-950/20" : active ? "border-violet-700 bg-violet-950/20" : "border-zinc-800 bg-zinc-900/50"}`}>
        {done ? <Check className="mt-0.5 size-5 shrink-0 text-emerald-400" /> : active ? <Loader2 className="mt-0.5 size-5 shrink-0 animate-spin text-violet-300" /> : failed ? <X className="mt-0.5 size-5 shrink-0 text-red-300" /> : <Circle className="mt-0.5 size-5 shrink-0 text-zinc-600" />}
        <div className="min-w-0 flex-1"><div className="flex flex-wrap justify-between gap-2 text-sm"><span className="text-zinc-200">{label}</span><span className="text-xs text-zinc-400">{done ? "Saved" : status === "active" ? "Processing" : status}</span></div>{update?.log && <p className="mt-1 break-words text-xs text-zinc-400">{update.log}</p>}</div>
      </li>;
    })}
  </ol>;
}
