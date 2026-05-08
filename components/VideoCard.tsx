"use client";

/**
 * Video card for the dashboard grid.
 */
import { useState } from "react";
import { motion } from "framer-motion";
import { ExternalLink, Download, RefreshCw, Play } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";

interface VideoCardProps {
  video: {
    id: string;
    jobId: string;
    title?: string | null;
    prompt: string;
    status: string;
    style: string;
    duration: string;
    youtubeUrl?: string | null;
    youtubeId?: string | null;
    s3VideoUrl?: string | null;
    errorMessage?: string | null;
    createdAt: string;
  };
  onReupload?: (id: string) => void;
}

const STATUS_CONFIG: Record<
  string,
  { label: string; className: string }
> = {
  completed: { label: "Completed", className: "bg-emerald-900/30 text-emerald-400 border-emerald-800" },
  processing: { label: "Processing", className: "bg-violet-900/30 text-violet-400 border-violet-800" },
  pending: { label: "Pending", className: "bg-zinc-800 text-zinc-400 border-zinc-700" },
  failed: { label: "Failed", className: "bg-red-900/30 text-red-400 border-red-800" },
};

export function VideoCard({ video, onReupload }: VideoCardProps) {
  const [downloading, setDownloading] = useState(false);
  const [reuploading, setReuploading] = useState(false);

  const statusConfig = STATUS_CONFIG[video.status] ?? STATUS_CONFIG.pending;
  const title = video.title ?? video.prompt;
  const date = new Date(video.createdAt).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });

  async function handleDownload() {
    setDownloading(true);
    toast.loading("Preparing download...", { id: "download-" + video.id });

    try {
      const res = await fetch(`/api/download/${video.id}`);
      
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || "Failed to get download URL");
      }
      
      const data = await res.json();
      
      if (!data.url) {
        throw new Error("Missing download URL");
      }

      toast.success("Starting download...", { id: "download-" + video.id });
      
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
      toast.error(`Download failed: ${(err as Error).message}`, { id: "download-" + video.id });
    } finally {
      setDownloading(false);
    }
  }

  async function handleReupload() {
    setReuploading(true);
    try {
      const res = await fetch(`/api/reupload/${video.id}`, { method: "POST" });
      const data = await res.json();
      if (data.jobId) {
        onReupload?.(video.id);
        window.location.href = `/generate/${data.jobId}`;
      }
    } finally {
      setReuploading(false);
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      className="group relative bg-[#111111] border border-[#1f1f1f] rounded-xl overflow-hidden hover:border-zinc-700 transition-all duration-300"
    >
      {/* Thumbnail / Poster */}
      <div className="relative aspect-video bg-zinc-900 overflow-hidden">
        {video.youtubeId ? (
          <img
            src={`https://img.youtube.com/vi/${video.youtubeId}/mqdefault.jpg`}
            alt={title}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <Play className="w-10 h-10 text-zinc-700" />
          </div>
        )}

        {/* Status overlay for processing */}
        {video.status === "processing" && (
          <div className="absolute inset-0 bg-black/60 flex items-center justify-center">
            <div className="text-center">
              <div className="w-8 h-8 border-2 border-violet-500 border-t-transparent rounded-full animate-spin mx-auto mb-2" />
              <p className="text-xs text-violet-300">Generating...</p>
            </div>
          </div>
        )}
      </div>

      {/* Content */}
      <div className="p-4">
        <div className="flex items-start justify-between gap-2 mb-2">
          <h3 className="text-sm font-medium text-zinc-200 line-clamp-2 flex-1">
            {title}
          </h3>
          <Badge
            variant="outline"
            className={`flex-shrink-0 text-xs ${statusConfig.className}`}
          >
            {statusConfig.label}
          </Badge>
        </div>

        <div className="flex items-center gap-2 text-xs text-zinc-600 mb-3">
          <span className="capitalize">{video.style}</span>
          <span>·</span>
          <span className="capitalize">{video.duration}</span>
          <span>·</span>
          <span>{date}</span>
        </div>

        {video.errorMessage && (
          <p className="text-xs text-red-400 mb-3 line-clamp-2">
            {video.errorMessage}
          </p>
        )}

        {/* Actions */}
        <div className="flex gap-2">
          {video.youtubeUrl && (
            <a
              href={video.youtubeUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex-1 flex items-center justify-center gap-1.5 py-1.5 px-3 bg-red-600/10 hover:bg-red-600/20 text-red-400 rounded-md text-xs font-medium transition-colors duration-300 border border-red-900/30"
            >
              <ExternalLink className="w-3 h-3" />
              YouTube
            </a>
          )}

          {video.s3VideoUrl && (
            <button
              onClick={handleDownload}
              disabled={downloading}
              className="flex-1 flex items-center justify-center gap-1.5 py-1.5 px-3 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-md text-xs font-medium transition-colors duration-300 disabled:opacity-50"
            >
              <Download className="w-3 h-3" />
              {downloading ? "..." : "Download"}
            </button>
          )}

          {(video.status === "completed" || video.status === "failed") &&
            video.s3VideoUrl && (
              <button
                onClick={handleReupload}
                disabled={reuploading}
                className="flex items-center justify-center gap-1.5 py-1.5 px-3 bg-violet-900/20 hover:bg-violet-900/40 text-violet-400 rounded-md text-xs font-medium transition-colors duration-300 border border-violet-900/30 disabled:opacity-50"
              >
                <RefreshCw className={`w-3 h-3 ${reuploading ? "animate-spin" : ""}`} />
                Re-upload
              </button>
            )}

          {video.status === "processing" && (
            <a
              href={`/generate/${video.jobId}`}
              className="flex-1 flex items-center justify-center gap-1.5 py-1.5 px-3 bg-violet-900/20 text-violet-400 rounded-md text-xs font-medium border border-violet-900/30"
            >
              View progress
            </a>
          )}
        </div>
      </div>
    </motion.div>
  );
}
