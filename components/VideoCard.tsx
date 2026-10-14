"use client";

/**
 * Video card for the dashboard grid.
 */
import { useState } from "react";
import { motion } from "framer-motion";
import { ExternalLink, Download, RefreshCw, Play,Trash2,Undo2 } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { auth } from "@/lib/firebase";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { uploadLabel } from "./generation-state";
import { VideoPlayer } from "./VideoPlayer";

interface VideoCardProps {
  video: {
    id: string;
    jobId: string;
    title?: string | null;
    prompt: string;
    status: string;
    renderStatus?: string | null;
    uploadStatus?: string | null;
    style: string;
    duration: string;
    youtubeUrl?: string | null;
    youtubeId?: string | null;
    s3VideoUrl?: string | null;
    videoUrl?: string | null;
    downloadUrl?: string | null;
    thumbnailUrl?: string | null;
    errorMessage?: string | null;
    renderError?: string | null;
    uploadError?: string | null;
    createdAt: string;
    resumeAvailable?: boolean;
    deletedAt?:string|null;
    playbackKey?:string;
  };
  onReupload?: (id: string) => void;
  onChanged?: (id:string)=>void;
}

const STATUS_CONFIG: Record<
  string,
  { label: string; className: string }
> = {
  completed: { label: "Completed", className: "bg-emerald-900/30 text-emerald-400 border-emerald-800" },
  processing: { label: "Processing", className: "bg-violet-900/30 text-violet-400 border-violet-800" },
  pending: { label: "Pending", className: "bg-zinc-800 text-zinc-400 border-zinc-700" },
  failed: { label: "Failed", className: "bg-red-900/30 text-red-400 border-red-800" },
  deleting: { label: "Deleting cloud files", className: "bg-amber-900/30 text-amber-300 border-amber-800" },
};

export function VideoCard({ video, onReupload,onChanged }: VideoCardProps) {
  const router = useRouter();
  const [downloading, setDownloading] = useState(false);
  const [reuploading, setReuploading] = useState(false);
  const [playingSource,setPlayingSource] = useState<string|null>(null);
  const playing=playingSource!==null;
  const [removing,setRemoving]=useState(false);
  const [purging,setPurging]=useState(false);
  const [deletionStarted,setDeletionStarted]=useState(false);
  const [downloadLink,setDownloadLink]=useState<string|null>(null);

  const renderStatus = video.renderStatus ?? video.status;
  const statusConfig = STATUS_CONFIG[renderStatus] ?? { label: renderStatus.replaceAll("_", " "), className: "text-zinc-300" };
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
  const isPlayable = !video.deletedAt&&renderStatus === "completed" && Boolean(video.videoUrl);
  const isDownloadable = !video.deletedAt&&renderStatus === "completed" && video.downloadUrl;
  const active=["queued","processing","retrying"].includes(renderStatus)||["queued","uploading","processing","retrying"].includes(video.uploadStatus??"");
  const deleting=renderStatus==="deleting"||deletionStarted;

  async function deletePermanently(){
    if(purging||removing)return;
    if(!window.confirm(`Permanently delete “${title}” and its cloud video files? This cannot be undone. Shared source clips stay while other projects use them. Downloaded copies and YouTube uploads stay unchanged.`))return;
    setPurging(true);
    try{
      const user=auth.currentUser;if(!user)throw new Error("Sign in to manage your videos");
      const token=await user.getIdToken();
      const response=await fetch(`/api/projects/${encodeURIComponent(video.id)}/delete-permanently`,{method:"DELETE",headers:{Authorization:`Bearer ${token}`,"Content-Type":"application/json"},body:JSON.stringify({confirm:true})});
      const result=await response.json();if(!response.ok)throw new Error(result.error??"Unable to delete this video");
      if(result.deleted){toast.success(result.sharedAssets?"Video permanently deleted. Shared source clips will be removed when other projects no longer need them.":"Video and cloud files permanently deleted");onChanged?.(video.id);}
      else{setDeletionStarted(true);toast.info("Cloud deletion is pending and will retry automatically.");}
    }catch(error){toast.error(error instanceof Error?error.message:"Unable to delete this video");}finally{setPurging(false);}
  }

  async function changeLibrary(restore=false){
    if(removing)return;
    if(!restore&&!window.confirm(`Move “${title}” to Trash? You can restore it from Trash. Credits, downloaded files, and YouTube uploads stay unchanged.`))return;
    setRemoving(true);
    try{
      const user=auth.currentUser;if(!user)throw new Error("Sign in to manage your videos");
      const token=await user.getIdToken();
      const response=await fetch(`/api/projects/${encodeURIComponent(video.id)}`,{method:restore?"PATCH":"DELETE",headers:{Authorization:`Bearer ${token}`,"Content-Type":"application/json"},body:restore?JSON.stringify({action:"restore"}):undefined});
      const result=await response.json();if(!response.ok)throw new Error(result.error??"Unable to update your library");
      toast.success(restore?"Video restored":"Video moved to Trash");onChanged?.(video.id);
    }catch(error){toast.error(error instanceof Error?error.message:"Unable to update your library");}finally{setRemoving(false);}
  }

  async function handleDownload() {
    if (!video.downloadUrl) {
      toast.error("Download not available");
      return;
    }

    setDownloading(true);
    setDownloadLink(null);
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

      setDownloadLink(data.url);
      toast.success("Download prepared. Use Save MP4 if it does not start.", { id: "download-" + video.id });
      
      // Trigger browser download.
      // The app streams an attachment from the same origin using a short-lived ticket.
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
      if (!res.ok) throw new Error(data.error ?? "Unable to queue YouTube upload");
      if (data.jobId) {
        onReupload?.(video.id);
        router.push(`/generate/${encodeURIComponent(data.jobId)}`);
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to queue YouTube upload");
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
        {playingSource&&!video.deletedAt ? <VideoPlayer key={video.playbackKey??video.id} controls autoPlay src={video.videoUrl??playingSource} className="h-full w-full" aria-label={title} /> : thumbnailUrl ? (
          <Image
            src={thumbnailUrl}
            alt={title}
            width={640}
            height={360}
            unoptimized
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <Play className="w-10 h-10 text-zinc-700" />
          </div>
        )}

        {/* Play button overlay for playable videos */}
        {isPlayable && !playing && (
          <button type="button" aria-label={`Play ${title}`} onClick={() => setPlayingSource(video.videoUrl??null)} className="absolute inset-0 bg-black/20 hover:bg-black/40 focus-visible:outline-2 focus-visible:outline-violet-400 flex items-center justify-center transition-all duration-300">
            <div className="w-12 h-12 rounded-full bg-white/90 flex items-center justify-center opacity-0 group-hover:opacity-100 transform scale-75 group-hover:scale-100 transition-all duration-300">
              <Play className="w-6 h-6 text-black ml-1" />
            </div>
          </button>
        )}

        {/* Status overlay for processing */}
        {["pending", "queued", "processing", "retrying"].includes(renderStatus) && (
          <div className="absolute inset-0 bg-black/60 flex items-center justify-center">
            <div className="text-center">
              <div className="w-8 h-8 border-2 border-violet-500 border-t-transparent rounded-full animate-spin mx-auto mb-2" />
              <p className="text-xs text-violet-300">{renderStatus === "retrying" ? "Retrying saved stages…" : renderStatus === "pending" || renderStatus === "queued" ? "Queued…" : "Generating…"}</p>
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
            {deleting?"Cloud deletion":"Render error"}: {video.renderError}
          </p>
        )}

        {video.uploadError && (
          <p className="text-xs text-amber-400 mb-3 line-clamp-2">
            Upload error: {video.uploadError}
          </p>
        )}
        {renderStatus === "completed" && <p className="mb-3 text-xs text-zinc-400">{uploadLabel(video.uploadStatus)}</p>}

        {/* Actions */}
        {downloadLink&&<a href={downloadLink} download className="mb-3 flex w-full items-center justify-center rounded-md bg-violet-600 px-3 py-2 text-sm font-medium text-white">Save MP4 · click if download did not start</a>}
        {!video.deletedAt&&<div className="flex gap-2">
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

          {renderStatus === "completed" && video.uploadStatus === "failed" && (
              <button
                onClick={handleReupload}
                disabled={reuploading}
                className="flex items-center justify-center gap-1.5 py-1.5 px-3 bg-violet-900/20 hover:bg-violet-900/40 text-violet-400 rounded-md text-xs font-medium transition-colors duration-300 border border-violet-900/30 disabled:opacity-50"
              >
                <RefreshCw className={`w-3 h-3 ${reuploading ? "animate-spin" : ""}`} />
                Re-upload
              </button>
            )}

          {(video.resumeAvailable || ["failed", "interrupted", "cancelled", "processing", "pending", "queued", "awaiting_approval", "retrying"].includes(renderStatus)) && (
            <Link
              href={`/generate/${video.jobId}`}
              className="flex-1 flex items-center justify-center gap-1.5 py-1.5 px-3 bg-violet-900/20 text-violet-400 rounded-md text-xs font-medium border border-violet-900/30"
            >
              {video.resumeAvailable || ["failed", "interrupted", "cancelled"].includes(renderStatus) ? "Resume generation" : renderStatus === "awaiting_approval" ? "Review storyboard" : "View progress"}
            </Link>
          )}
        </div>}
        <button type="button" onClick={()=>void changeLibrary(!!video.deletedAt)} disabled={removing||purging||deleting||(!video.deletedAt&&active)} title={active&&!video.deletedAt?"Wait for generation or uploading to finish":undefined} className="mt-3 flex w-full items-center justify-center gap-2 rounded-md border border-zinc-700 px-3 py-2 text-xs text-zinc-300 hover:border-red-700 hover:text-red-300 disabled:cursor-not-allowed disabled:opacity-40">{video.deletedAt?<Undo2 className="h-3.5 w-3.5"/>:<Trash2 className="h-3.5 w-3.5"/>}{removing?"Updating…":video.deletedAt?"Restore video":"Delete video"}</button>
        {video.deletedAt&&<button type="button" onClick={()=>void deletePermanently()} disabled={purging||removing} className="mt-2 flex w-full items-center justify-center gap-2 rounded-md border border-red-900/60 bg-red-950/30 px-3 py-2 text-xs text-red-300 hover:bg-red-950/60 disabled:opacity-40"><Trash2 className="h-3.5 w-3.5"/>{purging?"Deleting cloud files…":deleting?"Retry permanent deletion":"Delete permanently"}</button>}
        {video.deletedAt&&deleting&&<p role="status" className="mt-2 text-xs text-amber-300">Permanent deletion has started. Cloud cleanup retries automatically. Restore is no longer available.</p>}
        {active&&!video.deletedAt&&<p className="mt-1 text-xs text-zinc-500">Deletion is available when generation or uploading finishes.</p>}
      </div>
    </motion.div>
  );
}
