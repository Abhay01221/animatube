/**
 * Progress page — full-screen cinematic view of video generation stages.
 * Server component that renders the SSE-driven client component.
 */
import { Sparkles, ArrowLeft } from "lucide-react";
import { ProgressSSE } from "@/components/ProgressSSE";
import Link from "next/link";

interface PageProps {
  params: Promise<{ jobId: string }>;
}

export default async function GeneratePage({ params }: PageProps) {
  const { jobId } = await params;

  return (
    <main className="relative min-h-screen flex flex-col items-center px-4 py-16 overflow-hidden">
      {/* Background orb */}
      <div
        className="gradient-orb opacity-10"
        style={{ left: "50%", top: "30%" }}
        aria-hidden="true"
      />

      {/* Nav */}
      <nav className="fixed top-0 left-0 right-0 z-50 flex items-center justify-between px-6 py-4 border-b border-[#1f1f1f]/50 backdrop-blur-sm bg-[#080808]/80">
        <Link href="/" className="flex items-center gap-2">
          <Sparkles className="w-5 h-5 text-violet-400" />
          <span className="font-semibold text-zinc-100">Animatube</span>
        </Link>
        <Link
          href="/dashboard"
          className="text-sm text-zinc-400 hover:text-zinc-200 transition-colors duration-300"
        >
          Dashboard
        </Link>
      </nav>

      {/* Content */}
      <div className="relative z-10 w-full max-w-2xl mt-16">
        {/* Back link */}
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 text-sm text-zinc-500 hover:text-zinc-300 transition-colors duration-300 mb-8"
        >
          <ArrowLeft className="w-4 h-4" />
          New video
        </Link>

        {/* Header */}
        <div className="text-center mb-10">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-medium bg-violet-950/50 text-violet-300 border border-violet-800/50 mb-4">
            <span className="w-1.5 h-1.5 rounded-full bg-violet-400 animate-pulse" />
            Your video workspace
          </div>
          <h1 className="text-2xl font-bold text-white">
            Review, render, and resume
          </h1>
          <p className="text-zinc-500 text-sm mt-2">
            Your instructions and completed stages are saved. Return here to review or continue generation.
          </p>
          <p className="text-zinc-700 text-xs mt-1 font-mono">
            Job: {jobId}
          </p>
        </div>

        {/* SSE-driven stage tracker */}
        <ProgressSSE jobId={jobId} />
      </div>
    </main>
  );
}
