"use client";

/**
 * Home page — prompt input + advanced options + generate button.
 */
import { useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { Sparkles, LogIn, LogOut } from "lucide-react";
import { signIn, signOut, useSession } from "next-auth/react";
import { Textarea } from "@/components/ui/textarea";
import { AdvancedOptions, type VideoOptions } from "@/components/AdvancedOptions";
import { toast } from "sonner";

const DEFAULT_OPTIONS: VideoOptions = {
  style: "educational",
  duration: "short",
  voice: "ai_narrator",
  language: "english",
  visibility: "private",
};

export default function HomePage() {
  const router = useRouter();
  const { data: session, status } = useSession();
  const [prompt, setPrompt] = useState("");
  const [options, setOptions] = useState<VideoOptions>(DEFAULT_OPTIONS);
  const [loading, setLoading] = useState(false);

  console.log("[HomePage] Session status:", status);
  console.log("[HomePage] Session data:", session);

  async function handleGenerate() {
    if (prompt.trim().length < 10) {
      toast.error("Please enter at least 10 characters describing your video.");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: prompt.trim(), ...options }),
      });

      if (res.status === 401) {
        toast.error("Please sign in with Google to generate videos.");
        return;
      }

      if (res.status === 429) {
        toast.error("Rate limit reached. Max 5 videos per hour.");
        return;
      }

      if (!res.ok) {
        const data = await res.json();
        toast.error(data.error ?? "Something went wrong. Please try again.");
        return;
      }

      const { jobId } = await res.json();
      router.push(`/generate/${jobId}`);
    } catch {
      toast.error("Network error. Please check your connection.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="relative min-h-screen flex flex-col items-center justify-center px-4 py-16 overflow-hidden">
      {/* Animated gradient orb */}
      <div
        className="gradient-orb"
        style={{ left: "50%", top: "40%" }}
        aria-hidden="true"
      />

      {/* Nav */}
      <nav className="fixed top-0 left-0 right-0 z-50 flex items-center justify-between px-6 py-4 border-b border-[#1f1f1f]/50 backdrop-blur-sm bg-[#080808]/80">
        <a href="/" className="flex items-center gap-2">
          <Sparkles className="w-5 h-5 text-violet-400" />
          <span className="font-semibold text-zinc-100">Animatube</span>
        </a>
        <div className="flex items-center gap-4">
          <a
            href="/dashboard"
            className="text-sm text-zinc-400 hover:text-zinc-200 transition-colors duration-300"
          >
            Dashboard
          </a>
          <a
            href="/settings"
            className="text-sm text-zinc-400 hover:text-zinc-200 transition-colors duration-300"
          >
            Settings
          </a>
          {status === "loading" ? (
            <div className="w-20 h-8 bg-zinc-800 animate-pulse rounded-md" />
          ) : session ? (
            <div className="flex items-center gap-3">
              {session.user?.image && (
                <img 
                  src={session.user.image} 
                  alt={session.user.name || "User"} 
                  className="w-7 h-7 rounded-full border border-zinc-700"
                />
              )}
              <button
                onClick={() => signOut({ callbackUrl: "/" })}
                className="flex items-center gap-1.5 text-sm px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-white rounded-md transition-colors duration-300"
              >
                <LogOut className="w-3.5 h-3.5" />
                Sign out
              </button>
            </div>
          ) : (
            <button
              onClick={() => signIn("google", { callbackUrl: "/" })}
              className="flex items-center gap-1.5 text-sm px-3 py-1.5 bg-violet-600 hover:bg-violet-500 text-white rounded-md transition-colors duration-300"
            >
              <LogIn className="w-3.5 h-3.5" />
              Sign in
            </button>
          )}
        </div>
      </nav>

      {/* Hero */}
      <motion.div
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: "easeOut" }}
        className="relative z-10 w-full max-w-2xl"
      >
        {/* Badge */}
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.1 }}
          className="flex justify-center mb-6"
        >
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium bg-violet-950/50 text-violet-300 border border-violet-800/50">
            <Sparkles className="w-3 h-3" />
            AI-Powered Video Factory
          </span>
        </motion.div>

        {/* Headline */}
        <h1 className="text-4xl sm:text-5xl font-bold text-center text-white mb-3 leading-tight">
          Turn any idea into a{" "}
          <span className="text-transparent bg-clip-text bg-gradient-to-r from-violet-400 to-purple-300">
            YouTube video
          </span>
        </h1>
        <p className="text-center text-zinc-500 mb-10 text-lg">
          Script → Voiceover → Visuals → Subtitles → Published
        </p>

        {/* Form card */}
        <div className="bg-[#111111] border border-[#1f1f1f] rounded-2xl p-6 shadow-2xl space-y-5">
          {/* Prompt textarea */}
          <div>
            <label
              htmlFor="prompt"
              className="block text-sm font-medium text-zinc-300 mb-2"
            >
              What should your next video be about?
            </label>
            <Textarea
              id="prompt"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="e.g. Explain how neural networks work in simple terms, with real-world examples..."
              className="min-h-[120px] bg-[#080808] border-[#1f1f1f] text-zinc-100 placeholder:text-zinc-600 focus:border-violet-500 focus:ring-violet-500/20 resize-none text-base"
              maxLength={500}
            />
            <div className="flex justify-end mt-1">
              <span className="text-xs text-zinc-600">
                {prompt.length}/500
              </span>
            </div>
          </div>

          {/* Advanced options */}
          <AdvancedOptions options={options} onChange={setOptions} />

          {/* Generate button */}
          <div className="space-y-2">
            <button
              onClick={handleGenerate}
              disabled={loading || prompt.trim().length < 10}
              className={`w-full py-3.5 px-6 rounded-xl font-semibold text-white text-base transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed ${
                loading ? "bg-violet-700" : "shimmer hover:opacity-90 active:scale-[0.99]"
              }`}
            >
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Creating your video...
                </span>
              ) : (
                <span className="flex items-center justify-center gap-2">
                  <Sparkles className="w-4 h-4" />
                  Generate Video
                </span>
              )}
            </button>
            <p className="text-center text-xs text-zinc-600">
              ⏱ ~4 minutes to generate · Uploads directly to your YouTube channel
            </p>
          </div>
        </div>

        {/* Feature pills */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.4 }}
          className="flex flex-wrap justify-center gap-2 mt-8"
        >
          {[
            "Groq AI Script",
            "Edge TTS Voice",
            "Pexels Footage",
            "Auto Subtitles",
            "YouTube Upload",
          ].map((feat) => (
            <span
              key={feat}
              className="text-xs px-3 py-1 rounded-full bg-[#111111] border border-[#1f1f1f] text-zinc-500"
            >
              {feat}
            </span>
          ))}
        </motion.div>
      </motion.div>
    </main>
  );
}
