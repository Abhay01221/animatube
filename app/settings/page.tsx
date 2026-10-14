"use client";

/**
 * Settings page — YouTube connection status, default preferences.
 */
import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import {
  Sparkles,
  CheckCircle,
  XCircle,
  Save,
  LogOut,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { auth } from "@/lib/firebase";
import { signOut } from "firebase/auth";
import { AuthGuard } from "@/components/auth/AuthGuard";
import { useAuth } from "@/components/auth/AuthProvider";
import { ChannelProfiles } from "@/components/ChannelProfiles";

interface UserSettings {
  defaultVoice?: string;
  defaultLanguage?: string;
  defaultVisibility?: string;
  defaultStyle?: string;
}

interface SettingsData {
  settings: UserSettings;
  youtubeConnected: boolean;
  email?: string;
  name?: string;
  image?: string;
  credits?: number;
}

export default function SettingsPage() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const [data, setData] = useState<SettingsData | null>(null);
  const [settings, setSettings] = useState<UserSettings>({});
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState(false);

  useEffect(() => {
    if (authLoading || !user) return;
    let active = true;
    async function loadSettings() {
      try {
        // Use cached token
        const token = await user!.getIdToken(false);
        const res = await fetch("/api/settings", {
          headers: {
            "Authorization": `Bearer ${token}`,
          },
        });

        if (!res.ok) throw new Error("Failed to load");
        
        const d: SettingsData = await res.json();
        if (active) { setData(d); setSettings(d.settings ?? {}); }
      } catch {
        if (active) toast.error("Failed to load settings");
      } finally {
        if (active) setLoading(false);
      }
    }

    void loadSettings();
    return () => { active = false; };
  }, [user, authLoading]);

  async function handleYouTube(disconnect = false) {
    if (!user || connecting) return;
    setConnecting(true);
    try {
      const token = await user.getIdToken();
      const response = await fetch(disconnect ? "/api/youtube/disconnect" : "/api/youtube/connect", {
        method: disconnect ? "DELETE" : "POST", headers: { Authorization: `Bearer ${token}` },
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "YouTube connection failed");
      if (disconnect) { setData((previous) => previous ? { ...previous, youtubeConnected: false } : previous); toast.success("YouTube disconnected"); }
      else if (typeof result.url === "string") { window.location.assign(result.url); }
      else throw new Error("Authorization URL was missing");
    } catch (error) { toast.error(error instanceof Error ? error.message : "YouTube connection failed"); }
    finally { setConnecting(false); }
  }

  async function handleSave() {
    setSaving(true);
    try {
      const user = auth.currentUser;
      if (!user) {
        toast.error("Not authenticated");
        return;
      }

      // Use cached token
      const token = await user.getIdToken(false);
      const res = await fetch("/api/settings", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`,
        },
        body: JSON.stringify(settings),
      });
      if (!res.ok) throw new Error("Save failed");
      toast.success("Settings saved");
    } catch {
      toast.error("Failed to save settings");
    } finally {
      setSaving(false);
    }
  }

  async function handleSignOut() {
    try {
      await signOut(auth);
      router.push("/sign-in");
    } catch {
      toast.error("Failed to sign out");
    }
  }

  function update(key: keyof UserSettings, value: string) {
    setSettings((prev) => ({ ...prev, [key]: value }));
  }

  if (loading && user || authLoading) {
    return (
      <main className="min-h-screen flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-violet-500 border-t-transparent rounded-full animate-spin" />
      </main>
    );
  }

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
            href="/dashboard"
            className="text-sm text-zinc-400 hover:text-zinc-200 transition-colors duration-300"
          >
            Dashboard
          </Link>
        </div>
      </nav>

      <div className="max-w-2xl mx-auto mt-16">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-white mb-1">Settings</h1>
          <p className="text-zinc-500">Configure your Animatube preferences</p>
        </div>

        <div className="space-y-6">
          {/* Account */}
          {data && (
            <motion.section
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              className="bg-[#111111] border border-[#1f1f1f] rounded-xl p-6"
            >
              <h2 className="text-sm font-semibold text-zinc-300 uppercase tracking-wider mb-4">
                Account
              </h2>
              <div className="flex items-center gap-4">
                <div>
                  <p className="text-zinc-200 font-medium">{data.name}</p>
                  <p className="text-zinc-500 text-sm">{data.email}</p>
                  <p className="text-violet-300 text-sm">{data.credits ?? "—"} credits available</p>
                </div>
                <button
                  onClick={handleSignOut}
                  className="ml-auto flex items-center gap-1.5 text-sm text-zinc-500 hover:text-zinc-300 transition-colors duration-300"
                >
                  <LogOut className="w-4 h-4" />
                  Sign out
                </button>
              </div>
            </motion.section>
          )}

          {/* YouTube Connection */}
          <motion.section
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.05 }}
            className="bg-[#111111] border border-[#1f1f1f] rounded-xl p-6"
          >
            <h2 className="text-sm font-semibold text-zinc-300 uppercase tracking-wider mb-4">
              YouTube Connection
            </h2>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-6 h-6 text-red-500 font-bold text-sm flex items-center justify-center">▶</div>
                <div>
                  <p className="text-zinc-200 text-sm font-medium">
                    YouTube Account
                  </p>
                  <p className="text-zinc-500 text-xs">
                    Required for automatic video uploads
                  </p>
                </div>
              </div>
              {data?.youtubeConnected ? (
                <div className="flex items-center gap-2">
                  <CheckCircle className="w-4 h-4 text-emerald-400" />
                  <span className="text-emerald-400 text-sm">Connected</span>
                  <button disabled={connecting} onClick={() => handleYouTube(true)} className="text-xs text-zinc-400 underline disabled:opacity-50">Disconnect</button>
                </div>
              ) : (
                <div className="flex items-center gap-3">
                  <XCircle className="w-4 h-4 text-red-400" />
                  <button
                    onClick={() => handleYouTube()}
                    disabled={connecting}
                    className="text-sm px-3 py-1.5 bg-red-600 hover:bg-red-500 text-white rounded-md transition-colors duration-300"
                  >
                    {connecting ? "Connecting…" : "Connect"}
                  </button>
                </div>
              )}
            </div>
            {!data?.youtubeConnected && (
              <p className="mt-3 text-xs text-zinc-600 bg-zinc-900 rounded-lg p-3">
                Connect a YouTube channel separately to authorize uploads. Video generation works without a connected channel.
              </p>
            )}
          </motion.section>

          {/* Default Preferences */}
          <motion.section
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="bg-[#111111] border border-[#1f1f1f] rounded-xl p-6"
          >
            <h2 className="text-sm font-semibold text-zinc-300 uppercase tracking-wider mb-4">
              Default Preferences
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-xs text-zinc-500 uppercase tracking-wider">
                  Default Style
                </label>
                <Select
                  value={settings.defaultStyle ?? "educational"}
                  onValueChange={(v) => update("defaultStyle", v ?? "educational")}
                >
                  <SelectTrigger className="bg-[#080808] border-[#1f1f1f] text-zinc-200">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-[#111111] border-[#1f1f1f]">
                    <SelectItem value="educational">📚 Educational</SelectItem>
                    <SelectItem value="storytelling">📖 Storytelling</SelectItem>
                    <SelectItem value="motivational">🔥 Motivational</SelectItem>
                    <SelectItem value="documentary">🎬 Documentary</SelectItem>
                    <SelectItem value="anime-style">✨ Anime-style</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs text-zinc-500 uppercase tracking-wider">
                  Default Voice
                </label>
                <Select
                  value={settings.defaultVoice ?? "ai_narrator"}
                  onValueChange={(v) => update("defaultVoice", v ?? "ai_narrator")}
                >
                  <SelectTrigger className="bg-[#080808] border-[#1f1f1f] text-zinc-200">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-[#111111] border-[#1f1f1f]">
                    <SelectItem value="male">🎙️ Male</SelectItem>
                    <SelectItem value="female">🎤 Female</SelectItem>
                    <SelectItem value="ai_narrator">🤖 AI Narrator</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs text-zinc-500 uppercase tracking-wider">
                  Default Language
                </label>
                <Select
                  value={settings.defaultLanguage ?? "english"}
                  onValueChange={(v) => update("defaultLanguage", v ?? "english")}
                >
                  <SelectTrigger className="bg-[#080808] border-[#1f1f1f] text-zinc-200">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-[#111111] border-[#1f1f1f]">
                    <SelectItem value="english">🇺🇸 English</SelectItem>
                    <SelectItem value="hindi">🇮🇳 Hindi</SelectItem>
                    <SelectItem value="spanish">🇪🇸 Spanish</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs text-zinc-500 uppercase tracking-wider">
                  Default Visibility
                </label>
                <Select
                  value={settings.defaultVisibility ?? "private"}
                  onValueChange={(v) => update("defaultVisibility", v ?? "private")}
                >
                  <SelectTrigger className="bg-[#080808] border-[#1f1f1f] text-zinc-200">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-[#111111] border-[#1f1f1f]">
                    <SelectItem value="private">🔒 Private</SelectItem>
                    <SelectItem value="unlisted">🔗 Unlisted</SelectItem>
                    <SelectItem value="public">🌍 Public</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <button
              onClick={handleSave}
              disabled={saving}
              className="mt-6 flex items-center gap-2 px-5 py-2.5 bg-violet-600 hover:bg-violet-500 disabled:opacity-50 text-white rounded-lg text-sm font-medium transition-colors duration-300"
            >
              <Save className="w-4 h-4" />
              {saving ? "Saving..." : "Save preferences"}
            </button>
          </motion.section>

          <ChannelProfiles/>
          {/* API Info */}
          <motion.section
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.15 }}
            className="bg-[#111111] border border-[#1f1f1f] rounded-xl p-6"
          >
            <h2 className="text-sm font-semibold text-zinc-300 uppercase tracking-wider mb-4">
              API Configuration
            </h2>
            <p className="text-zinc-500 text-sm">
              API keys are configured via environment variables on the server.
              They are never exposed to the browser.
            </p>
            <div className="mt-4 grid grid-cols-2 gap-2">
              {[
                "GROQ_API_KEY",
                "PEXELS_API_KEY",
                "AWS_S3_BUCKET",
                "REDIS_URL",
                "DATABASE_URL",
                "GOOGLE_CLIENT_ID",
              ].map((key) => (
                <div
                  key={key}
                  className="flex items-center gap-2 text-xs text-zinc-600 bg-zinc-900 rounded px-3 py-2 font-mono"
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-zinc-700" />
                  {key}
                </div>
              ))}
            </div>
          </motion.section>
        </div>
      </div>
    </main>
    </AuthGuard>
  );
}
