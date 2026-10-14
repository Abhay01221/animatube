/**
 * Type definitions for the cinematic storytelling engine.
 * These types define the structure for scene-based video generation.
 */

// ─── Scene Structure ──────────────────────────────────────────────────────────

export interface CinematicScene {
  scene_id: number;
  duration_seconds: number;
  narration: string;
  emotion: EmotionType;
  environment: string;
  camera_direction: CameraDirection;
  visual_prompt: string;
  transition_type: TransitionType;
  soundtrack_mood: SoundtrackMood;
  shot_type?: ShotType;
  lighting?: string;
  color_palette?: string[];
  caption?: string;
  visual_asset?: { s3Key: string; type: "clip" | "image"; provider?: "s3" | "supabase" };
  diagram?: { title: string; items: string[] };
  source_references?: Array<{ sourceId: string; passage: string }>;
}

// ─── Story Planning ───────────────────────────────────────────────────────────

export interface StoryPlan {
  total_duration: number;
  story_arc: StoryArc;
  scenes: ScenePlan[];
  characters?: CharacterDescription[];
  overall_mood: string;
  visual_style: string;
}

export interface ScenePlan {
  scene: number;
  purpose: string;
  emotion: EmotionType;
  camera: string;
  lighting: string;
  duration_seconds: number;
  narrative_beat: NarrativeBeat;
}

export interface StoryArc {
  intro: { start: number; end: number };
  buildup: { start: number; end: number };
  climax: { start: number; end: number };
  resolution: { start: number; end: number };
}

// ─── Character Consistency ────────────────────────────────────────────────────

export interface CharacterDescription {
  id: string;
  name: string;
  hairstyle: string;
  clothing: string;
  facial_features: string;
  color_palette: string[];
  personality_expression: string;
  anime_style_notes: string;
}

// ─── Cinematic Enhancements ───────────────────────────────────────────────────

export interface CinematicPromptEnhancement {
  base_prompt: string;
  lighting: string;
  camera_movement: string;
  atmosphere: string;
  color_grading: string;
  style_enforcement: string;
  motion_details: string;
}

export interface MotionEffect {
  type: MotionEffectType;
  intensity: number;
  duration: number;
  parameters: Record<string, unknown>;
}

// ─── Enums and Types ──────────────────────────────────────────────────────────

export type EmotionType =
  | "mystery"
  | "suspense"
  | "joy"
  | "sadness"
  | "fear"
  | "anger"
  | "wonder"
  | "tension"
  | "calm"
  | "excitement"
  | "melancholy"
  | "triumph";

export type CameraDirection =
  | "slow dolly forward"
  | "slow dolly backward"
  | "pan left"
  | "pan right"
  | "static"
  | "slow zoom in"
  | "slow zoom out"
  | "crane up"
  | "crane down"
  | "orbit"
  | "handheld shake";

export type TransitionType =
  | "cut"
  | "fade"
  | "fade through fog"
  | "dissolve"
  | "wipe"
  | "blur transition"
  | "light flash"
  | "particle dissolve";

export type SoundtrackMood =
  | "dark ambient drones"
  | "soft piano orchestral"
  | "percussion heavy orchestral"
  | "japanese flute ambience"
  | "epic cinematic"
  | "mysterious whispers"
  | "heartbeat tension"
  | "gentle emotional"
  | "action intense"
  | "calm meditation";

export type ShotType =
  | "extreme close-up"
  | "close-up"
  | "medium shot"
  | "wide shot"
  | "extreme wide shot"
  | "over-the-shoulder"
  | "dutch angle"
  | "birds eye view"
  | "low angle"
  | "high angle";

export type MotionEffectType =
  | "slow_zoom"
  | "parallax"
  | "cinematic_pan"
  | "depth_blur"
  | "camera_shake"
  | "fog_overlay"
  | "particle_system"
  | "glow_effect"
  | "vignette"
  | "chromatic_aberration";

export type NarrativeBeat =
  | "hook"
  | "introduction"
  | "rising_action"
  | "conflict"
  | "climax"
  | "falling_action"
  | "resolution"
  | "call_to_action";

// ─── Narration Pacing ─────────────────────────────────────────────────────────

export interface NarrationPacing {
  words_per_second: number;
  pause_duration: number;
  emphasis_words: string[];
  tone: "calm" | "urgent" | "dramatic" | "neutral";
}

export interface NarrationSegment {
  text: string;
  duration_seconds: number;
  estimated_word_count: number;
  pacing: NarrationPacing;
}

// ─── Storyboard Preview ───────────────────────────────────────────────────────

export interface StoryboardScene {
  scene_id: number;
  thumbnail_url?: string;
  narration_preview: string;
  estimated_duration: number;
  visual_prompt: string;
  soundtrack_mood: SoundtrackMood;
  camera_notes: string;
  editable: boolean;
}

export interface Storyboard {
  job_id: string;
  total_duration: number;
  scenes: StoryboardScene[];
  overall_style: string;
  created_at: string;
}

export interface RenderOptions {
  aspectRatio?: "16:9" | "9:16";
  resolution?: "720p" | "1080p";
  frameRate?: 24 | 25 | 30;
  targetDuration?: number;
  visualStyle?: string;
  signal?: AbortSignal;
  fadeInDuration?: number;
  fadeOutDuration?: number;
}

/** Word positions are seconds from the beginning of the complete audio track. */
export interface TimedWord {
  text: string;
  startTime: number;
  endTime: number;
  sceneIndex: number;
}

export interface VoiceSceneCheckpoint {
  sceneIndex: number;
  inputHash: string;
  s3Key: string;
  durationSeconds: number;
  contentHash?:string;
  /** Checkpoint word times are relative to this scene. */
  words: TimedWord[];
}
