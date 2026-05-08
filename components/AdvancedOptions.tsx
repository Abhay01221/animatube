"use client";

/**
 * Collapsible advanced options panel for the home page form.
 */
import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronDown } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export interface VideoOptions {
  style: string;
  duration: string;
  voice: string;
  language: string;
  visibility: string;
}

interface AdvancedOptionsProps {
  options: VideoOptions;
  onChange: (options: VideoOptions) => void;
}

export function AdvancedOptions({ options, onChange }: AdvancedOptionsProps) {
  const [open, setOpen] = useState(false);

  function update(key: keyof VideoOptions, value: string) {
    onChange({ ...options, [key]: value });
  }

  return (
    <div className="w-full">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2 text-sm text-zinc-400 hover:text-zinc-200 transition-colors duration-300 group"
      >
        <ChevronDown
          className={`w-4 h-4 transition-transform duration-300 ${open ? "rotate-180" : ""}`}
        />
        Advanced options
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.3, ease: "easeInOut" }}
            className="overflow-hidden"
          >
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-4">
              {/* Video Style */}
              <div className="space-y-1.5">
                <label className="text-xs text-zinc-500 uppercase tracking-wider">
                  Video Style
                </label>
                <Select
                  value={options.style}
                  onValueChange={(v) => update("style", v ?? "educational")}
                >
                  <SelectTrigger className="bg-[#111111] border-[#1f1f1f] text-zinc-200 focus:ring-violet-500">
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

              {/* Duration */}
              <div className="space-y-1.5">
                <label className="text-xs text-zinc-500 uppercase tracking-wider">
                  Duration
                </label>
                <div className="flex gap-2">
                  {[
                    { value: "short", label: "Short (~3 min)" },
                    { value: "long", label: "Long (~8 min)" },
                  ].map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => update("duration", opt.value)}
                      className={`flex-1 py-2 px-3 rounded-md text-sm border transition-all duration-300 ${
                        options.duration === opt.value
                          ? "bg-violet-600 border-violet-500 text-white"
                          : "bg-[#111111] border-[#1f1f1f] text-zinc-400 hover:border-zinc-600"
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Voice */}
              <div className="space-y-1.5">
                <label className="text-xs text-zinc-500 uppercase tracking-wider">
                  Voice
                </label>
                <Select
                  value={options.voice}
                  onValueChange={(v) => update("voice", v ?? "ai_narrator")}
                >
                  <SelectTrigger className="bg-[#111111] border-[#1f1f1f] text-zinc-200 focus:ring-violet-500">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-[#111111] border-[#1f1f1f]">
                    <SelectItem value="male">🎙️ Male</SelectItem>
                    <SelectItem value="female">🎤 Female</SelectItem>
                    <SelectItem value="ai_narrator">🤖 AI Narrator</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Language */}
              <div className="space-y-1.5">
                <label className="text-xs text-zinc-500 uppercase tracking-wider">
                  Language
                </label>
                <Select
                  value={options.language}
                  onValueChange={(v) => update("language", v ?? "english")}
                >
                  <SelectTrigger className="bg-[#111111] border-[#1f1f1f] text-zinc-200 focus:ring-violet-500">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-[#111111] border-[#1f1f1f]">
                    <SelectItem value="english">🇺🇸 English</SelectItem>
                    <SelectItem value="hindi">🇮🇳 Hindi</SelectItem>
                    <SelectItem value="spanish">🇪🇸 Spanish</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Visibility */}
              <div className="space-y-1.5 sm:col-span-2">
                <label className="text-xs text-zinc-500 uppercase tracking-wider">
                  YouTube Visibility
                </label>
                <div className="flex gap-2">
                  {[
                    { value: "private", label: "🔒 Private" },
                    { value: "unlisted", label: "🔗 Unlisted" },
                    { value: "public", label: "🌍 Public" },
                  ].map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => update("visibility", opt.value)}
                      className={`flex-1 py-2 px-3 rounded-md text-sm border transition-all duration-300 ${
                        options.visibility === opt.value
                          ? "bg-violet-600 border-violet-500 text-white"
                          : "bg-[#111111] border-[#1f1f1f] text-zinc-400 hover:border-zinc-600"
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
