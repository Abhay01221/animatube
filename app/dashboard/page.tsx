"use client";

/**
 * Dashboard — video history grid with filter bar and stats.
 */
import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Sparkles, Video, TrendingUp, CheckCircle, XCircle } from "lucide-react";
import Link from "next/link";
import { VideoCard } from "@/components/VideoCard";
import { AuthGuard } from "@/components/auth/AuthGuard";
import { auth } from "@/lib/firebase";

type VideoStatus = "all" | "completed" | "failed" | "processing" | "pending";

interface VideoItem {
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
  storageProvider?: string | null;
  s3VideoUrl?: string | null;
  videoUrl?: string | null;       // resolved playback URL
  downloadUrl?: string | null;    // /api/download/[id]
  thumbnailUrl?: string | null;
  renderError?: string | null;
  uploadError?: string | null;
  errorMessage?: string | null;
  createdAt: string;
}

interface DashboardData {
  videos: VideoItem[];
  stats: {
    total: number;
    thisWeek: number;
    completed: number;
    failed: number;
    uploaded?: number;
    renderCompleted?: number;
    renderFailed?: number;
    uploadFailed?: number;
  };
}

const FILTERS: { value: VideoStatus; label: string }[] = [
  { value: "all", label: "All" },
  { value: "completed", label: "Completed" },
  { value: "processing", label: "Uploading" },
  { value: "failed", label: "Failed" },
];

export default function DashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [filter, setFilter] = useState<VideoStatus>("all");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchDashboard() {
      try {
        const user = auth.currentUser;
        if (!user) return;

        // Use cached token
        const token = await user.getIdToken(false);
        const res = await fetch("/api/dashboard", {
          headers: {
            "Authorization": `Bearer ${token}`,
          },
        });

        if (res.ok) {
          const data = await res.json();
          setData(data);
        }
      } catch (error) {
        console.error("[dashboard] Error:", error);
      } finally {
        setLoading(false);
      }
    }

    fetchDashboard();
  }, []);

  const filtered =
    filter === "all"
      ? data?.videos ?? []
      : (data?.videos ?? []).filter((v) => {
          if (filter === "completed") {
            return v.renderStatus === "completed" || v.status === "completed";
          }
          if (filter === "failed") {
            return v.renderStatus === "failed" || v.status === "failed";
          }
          return v.status === filter;
        });

  return (
    <AuthGuard>
      <main className="min-h-screen px-4 py-16">
      {/* Nav */}
      <nav className="fixed top-0 left-0 right-0 z-50 flex items-center justify-between px-6 py-4 border-b border-[#1f1f1f]/50 backdrop-blur-sm bg-[#080808]/80">
        <Link href="/" className="flex items-center gap-2">
          <Sparkles className="w-5 h-5 text-violet-400" />
          <span className="font-semibold text-zinc-100">Animatube</span>
        </Link>
        <div className="flex items-center gap-4">
          <Link
            href="/"
            className="text-sm text-zinc-400 hover:text-zinc-200 transition-colors duration-300"
          >
            New Video
          </Link>
          <Link
            href="/settings"
            className="text-sm text-zinc-400 hover:text-zinc-200 transition-colors duration-300"
          >
            Settings
          </Link>
        </div>
      </nav>

      <div className="max-w-6xl mx-auto mt-16">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-white mb-1">Dashboard</h1>
          <p className="text-zinc-500">Your AI-generated video library</p>
        </div>

        {/* Stats bar */}
        {data && (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-8"
          >
            <StatCard
              icon={<Video className="w-4 h-4" />}
              label="Total Videos"
              value={data.stats.total}
              color="text-zinc-300"
            />
            <StatCard
              icon={<TrendingUp className="w-4 h-4" />}
              label="This Week"
              value={data.stats.thisWeek}
              color="text-violet-400"
            />
            <StatCard
              icon={<CheckCircle className="w-4 h-4" />}
              label="Completed"
              value={data.stats.completed}
              color="text-emerald-400"
            />
            <StatCard
              icon={<XCircle className="w-4 h-4" />}
              label="Failed"
              value={data.stats.failed}
              color="text-red-400"
            />
          </motion.div>
        )}

        {/* Filter bar */}
        <div className="flex gap-2 mb-6 flex-wrap">
          {FILTERS.map((f) => (
            <button
              key={f.value}
              onClick={() => setFilter(f.value)}
              className={`px-4 py-1.5 rounded-full text-sm font-medium transition-all duration-300 ${
                filter === f.value
                  ? "bg-violet-600 text-white"
                  : "bg-[#111111] border border-[#1f1f1f] text-zinc-400 hover:border-zinc-600"
              }`}
            >
              {f.label}
              {data && f.value !== "all" && (
                <span className="ml-1.5 text-xs opacity-60">
                  {data.videos.filter((v) => {
                    if (f.value === "completed") return v.renderStatus === "completed" || v.status === "completed";
                    if (f.value === "failed") return v.renderStatus === "failed" || v.status === "failed";
                    return v.status === f.value;
                  }).length}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Grid */}
        {loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <div
                key={i}
                className="bg-[#111111] border border-[#1f1f1f] rounded-xl overflow-hidden animate-pulse"
              >
                <div className="aspect-video bg-zinc-900" />
                <div className="p-4 space-y-2">
                  <div className="h-4 bg-zinc-800 rounded w-3/4" />
                  <div className="h-3 bg-zinc-800 rounded w-1/2" />
                </div>
              </div>
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-20">
            <Video className="w-12 h-12 text-zinc-700 mx-auto mb-4" />
            <p className="text-zinc-500 text-lg">No videos yet</p>
            <p className="text-zinc-600 text-sm mt-1">
              {filter === "all"
                ? "Generate your first video to get started"
                : `No ${filter} videos`}
            </p>
            {filter === "all" && (
              <Link
                href="/"
                className="inline-block mt-4 px-6 py-2.5 bg-violet-600 hover:bg-violet-500 text-white rounded-lg text-sm font-medium transition-colors duration-300"
              >
                Create your first video
              </Link>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {filtered.map((video, i) => (
              <motion.div
                key={video.id}
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.05 }}
              >
                <VideoCard video={video} />
              </motion.div>
            ))}
          </div>
        )}
      </div>
    </main>
    </AuthGuard>
  );
}

function StatCard({
  icon,
  label,
  value,
  color,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  color: string;
}) {
  return (
    <div className="bg-[#111111] border border-[#1f1f1f] rounded-xl p-4">
      <div className={`flex items-center gap-2 mb-2 ${color}`}>
        {icon}
        <span className="text-xs text-zinc-500">{label}</span>
      </div>
      <p className="text-2xl font-bold text-white">{value}</p>
    </div>
  );
}
