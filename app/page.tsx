"use client";

/**
 * Home page — prompt input + advanced options + generate button.
 */
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { motion } from "framer-motion";
import { Sparkles, LogIn, LogOut } from "lucide-react";
import { signOut } from "firebase/auth";
import { auth } from "@/lib/firebase";
import { useAuth } from "@/components/auth/AuthProvider";
import { Textarea } from "@/components/ui/textarea";
import { AdvancedOptions, type VideoOptions } from "@/components/AdvancedOptions";
import { toast } from "sonner";
import { CreationContext } from "@/components/CreationContext";

const DEFAULT_OPTIONS: VideoOptions = {
  style: "educational",
  duration: "short",
  voice: "ai_narrator",
  language: "english",
  visibility: "private",
  visualStyle: "stock",
  aspectRatio: "16:9",
  resolution: "1080p",
  targetDuration: 180,
  approvalRequired: true,
};
const DRAFT_KEY = "animatube.video-draft.v1";

export default function HomePage() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const [prompt, setPrompt] = useState("");
  const [options, setOptions] = useState<VideoOptions>(DEFAULT_OPTIONS);
  const [loading, setLoading] = useState(false);
  const [credits, setCredits] = useState<number | null>(null);
  const [draftReady, setDraftReady] = useState(false);
  const editedRef = useRef(false);
  const idempotencyRef = useRef<string | null>(null);

  useEffect(() => {
    Promise.resolve().then(() => {
      try {
        const stored = localStorage.getItem(DRAFT_KEY);
        if (stored) {
          const draft = JSON.parse(stored);
          if (typeof draft.prompt === "string") setPrompt(draft.prompt);
          if (draft.options) setOptions({ ...DEFAULT_OPTIONS, ...draft.options });
          editedRef.current = true;
          if (typeof draft.requestKey === "string") idempotencyRef.current = draft.requestKey;
        }
      } catch { /* Storage can be unavailable in private browsing. */ }
      setDraftReady(true);
    });
  }, []);

  useEffect(() => {
    if (authLoading || !user) return;
    const controller = new AbortController();
    async function loadDefaults() {
      try {
        const token = await user!.getIdToken();
        const res = await fetch("/api/settings", { headers: { Authorization: `Bearer ${token}` }, signal: controller.signal });
        if (!res.ok) return;
        const data = await res.json();
        if (typeof data.credits === "number") setCredits(data.credits);
        if (!editedRef.current) setOptions((current) => ({
          ...current,
          style: data.settings?.defaultStyle ?? current.style,
          voice: data.settings?.defaultVoice ?? current.voice,
          language: data.settings?.defaultLanguage ?? current.language,
          visibility: data.settings?.defaultVisibility ?? current.visibility,
          aspectRatio:data.settings?.defaultAspectRatio??current.aspectRatio,
          resolution:data.settings?.defaultResolution??current.resolution,
          frameRate:data.settings?.defaultFrameRate??current.frameRate,
          duration:data.settings?.defaultDuration??current.duration,
        }));
      } catch { /* Defaults must not prevent creating a draft. */ }
    }
    void loadDefaults();
    return () => controller.abort();
  }, [user, authLoading]);

  useEffect(() => {
    if (!draftReady) return;
    try { localStorage.setItem(DRAFT_KEY, JSON.stringify({ prompt, options, requestKey: idempotencyRef.current })); } catch { /* Optional browser persistence. */ }
  }, [prompt, options, draftReady]);

  async function handleGenerate() {
    if (loading || authLoading || !draftReady) return;
    if (prompt.trim().length < 10) {
      toast.error("Please enter at least 10 characters describing your video.");
      return;
    }

    if (!user) {
      toast.error("Please sign in to generate videos.");
      router.push("/sign-in?callbackUrl=%2F");
      return;
    }

    setLoading(true);
    try {
      // Use cached token
      const token = await user.getIdToken(false);
      const requestKey = idempotencyRef.current ?? crypto.randomUUID();
      idempotencyRef.current = requestKey;
      try { localStorage.setItem(DRAFT_KEY, JSON.stringify({ prompt, options, requestKey })); } catch { /* Optional browser persistence. */ }
      
      const res = await fetch("/api/generate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`,
          "Idempotency-Key": requestKey,
        },
        body: JSON.stringify({ prompt: prompt.trim(), ...options }),
      });

      if (res.status === 401) {
        toast.error("Please sign in to generate videos.");
        router.push("/sign-in?callbackUrl=%2F");
        return;
      }

      if (res.status === 429) {
        toast.error("Rate limit reached. Please try again later; your draft is saved.");
        return;
      }

      if (res.status === 402) {
        toast.error("You do not have enough credits. Your draft is saved.");
        return;
      }

      if (!res.ok) {
        const data = await res.json();
        toast.error(data.error ?? "Something went wrong. Please try again.");
        return;
      }

      const { jobId } = await res.json();
      idempotencyRef.current = null;
      try { localStorage.removeItem(DRAFT_KEY); } catch { /* Optional browser persistence. */ }
      router.push(`/generate/${jobId}`);
    } catch {
      toast.error("Network error. Please check your connection.");
    } finally {
      setLoading(false);
    }
  }

  async function handleSignOut() {
    try {
      await signOut(auth);
      toast.success("Signed out successfully");
    } catch {
      toast.error("Failed to sign out");
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
        <Link href="/" className="flex items-center gap-2">
          <Sparkles className="w-5 h-5 text-violet-400" />
          <span className="font-semibold text-zinc-100">Animatube</span>
        </Link>
        <div className="flex items-center gap-4">
          <Link
            href="/dashboard"
            className="text-sm text-zinc-400 hover:text-zinc-200 transition-colors duration-300"
          >
            Dashboard
          </Link>
          <Link
            href="/settings"
            className="text-sm text-zinc-400 hover:text-zinc-200 transition-colors duration-300"
          >
            Settings
          </Link>
          {authLoading ? (
            <div className="w-20 h-8 bg-zinc-800 animate-pulse rounded-md" />
          ) : user ? (
            <div className="flex items-center gap-3">
              <button
                onClick={handleSignOut}
                className="flex items-center gap-1.5 text-sm px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-white rounded-md transition-colors duration-300"
              >
                <LogOut className="w-3.5 h-3.5" />
                Sign out
              </button>
            </div>
          ) : (
            <Link
              href="/sign-in?callbackUrl=%2F"
              className="flex items-center gap-1.5 text-sm px-3 py-1.5 bg-violet-600 hover:bg-violet-500 text-white rounded-md transition-colors duration-300"
            >
              <LogIn className="w-3.5 h-3.5" />
              Sign in
            </Link>
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
          Script → Review → Voiceover → Visuals → Video
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
              onChange={(e) => { editedRef.current = true; idempotencyRef.current = null; setPrompt(e.target.value); }}
              placeholder="e.g. Explain how neural networks work in simple terms, with real-world examples..."
              className="min-h-[160px] bg-[#080808] border-[#1f1f1f] text-zinc-100 placeholder:text-zinc-600 focus:border-violet-500 focus:ring-violet-500/20 resize-y text-base"
              maxLength={20000}
            />
            <div className="flex justify-end mt-1">
              <span className="text-xs text-zinc-600">
                {prompt.length}/20000
              </span>
            </div>
          </div>

          {/* Advanced options */}
          <AdvancedOptions options={options} onChange={(next) => { editedRef.current = true; idempotencyRef.current = null; setOptions(next); }} />
          <CreationContext options={options} onChange={(next)=>{editedRef.current=true;idempotencyRef.current=null;setOptions(next);}}/>
          <p className="text-sm text-zinc-400" aria-live="polite">
            Estimated charge: 1 credit · {credits === null ? "Sign in to view your credits" : `${credits} credits available`}
          </p>

          {/* Generate button */}
          <div className="space-y-2">
            <button
              onClick={handleGenerate}
              disabled={loading || authLoading || !draftReady || credits === 0 || prompt.trim().length < 10}
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
              Your draft is saved in this browser. Generation time depends on duration and queue load. YouTube publishing requires a connected account.
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
