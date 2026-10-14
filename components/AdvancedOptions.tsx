"use client";

/**
 * Collapsible advanced options panel for the home page form.
 */
import { useEffect,useState } from "react";
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
  visualStyle?: "stock" | "illustration" | "anime";
  aspectRatio?: "16:9" | "9:16";
  resolution?: "720p" | "1080p";
  targetDuration?: number;
  approvalRequired?: boolean;
  pronunciation?: Record<string, string>;
  sources?:Array<{id:string;title:string;text:string;url?:string}>;
  channelProfileId?:string;
  captionPreset?:"clean"|"bold"|"minimal";
  musicAsset?:{provider:"s3";key:string;licensed:true};
  musicVolume?:number;
  frameRate?:24|30;
}

interface AdvancedOptionsProps {
  options: VideoOptions;
  onChange: (options: VideoOptions) => void;
}

export function AdvancedOptions({ options, onChange }: AdvancedOptionsProps) {
  const [open, setOpen] = useState(false);
  const [generated,setGenerated]=useState<{enabled:boolean;estimatedUsdPerSecond:number|null}>({enabled:false,estimatedUsdPerSecond:null});
  useEffect(()=>{const controller=new AbortController();void fetch("/api/capabilities",{signal:controller.signal}).then(response=>response.json()).then(data=>setGenerated(data.generatedVisuals)).catch(()=>undefined);return()=>controller.abort();},[]);

  function update<K extends keyof VideoOptions>(key: K, value: VideoOptions[K]) {
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
        Video settings
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
                  Content format
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
                    { value: "short", label: "Short" },
                    { value: "long", label: "Long" },
                  ].map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => onChange({...options,duration:opt.value,targetDuration:opt.value==="long"?480:180})}
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

              <label className="space-y-1.5 text-sm text-zinc-400">
                Visual style
                <select className="block w-full rounded-md bg-zinc-900 p-2 text-zinc-200" value={options.visualStyle ?? "stock"} onChange={(e) => update("visualStyle", e.target.value as VideoOptions["visualStyle"])}>
                  <option value="stock">Stock footage</option>
                  <option value="illustration" disabled={!generated.enabled}>Illustrations{generated.enabled?"":" · unavailable"}</option>
                  <option value="anime" disabled={!generated.enabled}>Anime illustrations{generated.enabled?"":" · unavailable"}</option>
                </select>
                {options.visualStyle!=="stock"&&generated.enabled&&<p className="text-xs text-zinc-500">{generated.estimatedUsdPerSecond===null?"Model usage cost is not configured; generation uses 1 app credit.":`Estimated model usage: $${((options.targetDuration??180)*generated.estimatedUsdPerSecond).toFixed(2)}. Generation uses 1 app credit.`}</p>}
              </label>
              <label className="space-y-1.5 text-sm text-zinc-400">
                Target duration (seconds)
                <input type="number" min={15} max={600} value={options.targetDuration ?? 180} onChange={(e) => update("targetDuration", Number(e.target.value))} className="block w-full rounded-md bg-zinc-900 p-2 text-zinc-200" />
              </label>
              <label className="space-y-1.5 text-sm text-zinc-400">
                Aspect ratio
                <select className="block w-full rounded-md bg-zinc-900 p-2 text-zinc-200" value={options.aspectRatio ?? "16:9"} onChange={(e) => update("aspectRatio", e.target.value as VideoOptions["aspectRatio"])}>
                  <option value="16:9">16:9 · YouTube</option><option value="9:16">9:16 · Shorts / Reels</option>
                </select>
              </label>
              <label className="space-y-1.5 text-sm text-zinc-400">
                Resolution
                <select className="block w-full rounded-md bg-zinc-900 p-2 text-zinc-200" value={options.resolution ?? "1080p"} onChange={(e) => update("resolution", e.target.value as VideoOptions["resolution"])}>
                  <option value="720p">720p</option><option value="1080p">1080p</option>
                </select>
              </label>
              <label className="sm:col-span-2 flex items-center gap-2 text-sm text-zinc-300">
                <input type="checkbox" checked={options.approvalRequired ?? true} onChange={(e) => update("approvalRequired", e.target.checked)} />
                Review and approve the storyboard before rendering
              </label>
              <label className="text-sm text-zinc-400">Frame rate<select value={options.frameRate??24} onChange={event=>update("frameRate",Number(event.target.value) as 24|30)} className="mt-1 block w-full rounded bg-zinc-900 p-2"><option value={24}>24 fps</option><option value={30}>30 fps</option></select></label>

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
