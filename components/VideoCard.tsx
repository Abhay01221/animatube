"use client";

/**
 * Video card for the dashboard grid.
 */
import { useState } from "react";
import { motion } from "framer-motion";
import { ExternalLink, Download, RefreshCw, Play } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { auth } from "@/lib/firebase";

interface VideoCardProps {
  video: {
    id: string;
    jobId: string;
    title?: string | null;
    prompt: string;
    status: string;
    renderStatus?: string;
    uploadStatus?: string;
    style: string;
    duration: string;
    youtubeUrl?: string | null;
    youtubeId?: string | null;
    s3VideoUrl?: string | null;
    videoUrl?: string | null; // Presigned playback URL
    downloadUrl?: string | null; // Download API endpoint
    thumbnailUrl?: string | null;
    errorMessage?: string | null;
    renderError?: string | null;
    uploadError?: string | null;
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

  // Use thumbnail if available, otherwise fallback to YouTube thumbnail
  const thumbnailUrl = video.thumbnailUrl || 
    (video.youtubeId ? `https://img.youtube.com/vi/${video.youtubeId}/mqdefault.jpg` : null);

  // Determine if video is playable
  const isPlayable = video.renderStatus === "completed" && (video.videoUrl || video.s3VideoUrl);
  const isDownloadable = video.renderStatus === "completed" && video.downloadUrl;

  async function handleDownload() {
    if (!video.downloadUrl) {
      toast.error("Download not available");
      return;
    }

    setDownloading(true);
    toast.loading("Preparing download...", { id: "download-" + video.id });

    try {
      const user = auth.currentUser;
      if (!user) {
        toast.error("You must be signed in to download", { id: "download-" + video.id });
        setDownloading(false);
        return;
      }

      const token = await user.getIdToken(true);
      const res = await fetch(video.downloadUrl, {
        headers: {
          Authorization: `Bearer ${token}`,
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

      toast.success("Starting download...", { id: "download-" + video.id });
      
      // Trigger browser download.
      // Content-Disposition: attachment is set server-side by Supabase/S3 signed URL,
      // so the file saves to disk even though the URL is cross-origin.
      const link = document.createElement("a");
      link.href = data.url;
      // Keep download attribute as a fallback filename hint for same-origin cases.
      link.download = (video.title || video.jobId).replace(/[^a-zA-Z0-9_\- ]/g, "").trim() || "video";
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      
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
      const user = auth.currentUser;
      if (!user) {
        toast.error("You must be signed in");
        return;
      }
      const token = await user.getIdToken(false);
      const res = await fetch(`/api/reupload/${video.id}`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
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
        {thumbnailUrl ? (
          <img
            src={thumbnailUrl}
            alt={title}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <Play className="w-10 h-10 text-zinc-700" />
          </div>
        )}

        {/* Play button overlay for playable videos */}
        {isPlayable && (
          <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 flex items-center justify-center transition-all duration-300">
            <div className="w-12 h-12 rounded-full bg-white/90 flex items-center justify-center opacity-0 group-hover:opacity-100 transform scale-75 group-hover:scale-100 transition-all duration-300">
              <Play className="w-6 h-6 text-black ml-1" />
            </div>
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

        {video.renderError && (
          <p className="text-xs text-red-400 mb-3 line-clamp-2">
            Render error: {video.renderError}
          </p>
        )}

        {video.uploadError && (
          <p className="text-xs text-amber-400 mb-3 line-clamp-2">
            Upload error: {video.uploadError}
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

          {isDownloadable && (
            <button
              onClick={handleDownload}
              disabled={downloading}
              className="flex-1 flex items-center justify-center gap-1.5 py-1.5 px-3 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-md text-xs font-medium transition-colors duration-300 disabled:opacity-50"
            >
              <Download className="w-3 h-3" />
              {downloading ? "..." : "Download"}
            </button>
          )}

          {(video.renderStatus === "completed" || video.status === "failed") &&
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
