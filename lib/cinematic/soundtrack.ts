/**
 * Dynamic Soundtrack System
 * Emotion-aware soundtrack selection and audio mixing.
 * Maps emotions to soundtrack moods and provides audio layering.
 */
import type { SoundtrackMood, EmotionType, TransitionType } from "../types/cinematic";

// ─── Soundtrack Mood Mapping ──────────────────────────────────────────────────

export const EMOTION_TO_SOUNDTRACK: Record<EmotionType, SoundtrackMood> = {
  mystery: "mysterious whispers",
  suspense: "dark ambient drones",
  joy: "gentle emotional",
  sadness: "soft piano orchestral",
  fear: "dark ambient drones",
  anger: "percussion heavy orchestral",
  wonder: "japanese flute ambience",
  tension: "heartbeat tension",
  calm: "calm meditation",
  excitement: "action intense",
  melancholy: "soft piano orchestral",
  triumph: "epic cinematic",
};

// ─── Soundtrack Characteristics ───────────────────────────────────────────────

export interface SoundtrackProfile {
  mood: SoundtrackMood;
  tempo: "slow" | "medium" | "fast";
  intensity: number; // 0-1
  instruments: string[];
  volume: number; // 0-1
  fadeIn: number; // seconds
  fadeOut: number; // seconds
}

export const SOUNDTRACK_PROFILES: Record<SoundtrackMood, SoundtrackProfile> = {
  "dark ambient drones": {
    mood: "dark ambient drones",
    tempo: "slow",
    intensity: 0.7,
    instruments: ["synth pads", "deep bass", "atmospheric drones"],
    volume: 0.3,
    fadeIn: 2,
    fadeOut: 2,
  },
  "soft piano orchestral": {
    mood: "soft piano orchestral",
    tempo: "slow",
    intensity: 0.5,
    instruments: ["piano", "strings", "soft cellos"],
    volume: 0.25,
    fadeIn: 3,
    fadeOut: 3,
  },
  "percussion heavy orchestral": {
    mood: "percussion heavy orchestral",
    tempo: "fast",
    intensity: 0.9,
    instruments: ["drums", "brass", "timpani", "strings"],
    volume: 0.4,
    fadeIn: 1,
    fadeOut: 2,
  },
  "japanese flute ambience": {
    mood: "japanese flute ambience",
    tempo: "slow",
    intensity: 0.4,
    instruments: ["shakuhachi", "koto", "ambient pads"],
    volume: 0.2,
    fadeIn: 4,
    fadeOut: 4,
  },
  "epic cinematic": {
    mood: "epic cinematic",
    tempo: "medium",
    intensity: 1.0,
    instruments: ["full orchestra", "choir", "brass", "percussion"],
    volume: 0.45,
    fadeIn: 2,
    fadeOut: 3,
  },
  "mysterious whispers": {
    mood: "mysterious whispers",
    tempo: "slow",
    intensity: 0.6,
    instruments: ["whispers", "ambient textures", "subtle strings"],
    volume: 0.25,
    fadeIn: 3,
    fadeOut: 3,
  },
  "heartbeat tension": {
    mood: "heartbeat tension",
    tempo: "medium",
    intensity: 0.8,
    instruments: ["heartbeat", "low drones", "tense strings"],
    volume: 0.35,
    fadeIn: 1,
    fadeOut: 2,
  },
  "gentle emotional": {
    mood: "gentle emotional",
    tempo: "slow",
    intensity: 0.4,
    instruments: ["acoustic guitar", "soft piano", "light strings"],
    volume: 0.2,
    fadeIn: 3,
    fadeOut: 3,
  },
  "action intense": {
    mood: "action intense",
    tempo: "fast",
    intensity: 1.0,
    instruments: ["heavy percussion", "electric guitars", "synth bass"],
    volume: 0.4,
    fadeIn: 0.5,
    fadeOut: 1,
  },
  "calm meditation": {
    mood: "calm meditation",
    tempo: "slow",
    intensity: 0.3,
    instruments: ["ambient pads", "soft chimes", "nature sounds"],
    volume: 0.15,
    fadeIn: 4,
    fadeOut: 4,
  },
};

// ─── Sound Effects ────────────────────────────────────────────────────────────

export interface SoundEffect {
  type: string;
  timing: number; // seconds into scene
  volume: number;
  duration?: number;
}

export const TRANSITION_SOUND_EFFECTS: Record<TransitionType, SoundEffect | null> = {
  cut: null,
  fade: { type: "soft_whoosh", timing: 0, volume: 0.1, duration: 1 },
  "fade through fog": { type: "ethereal_whoosh", timing: 0, volume: 0.15, duration: 1.5 },
  dissolve: { type: "soft_whoosh", timing: 0, volume: 0.1, duration: 1 },
  wipe: { type: "swipe", timing: 0, volume: 0.2, duration: 0.5 },
  "blur transition": { type: "blur_whoosh", timing: 0, volume: 0.15, duration: 1 },
  "light flash": { type: "bright_flash", timing: 0, volume: 0.3, duration: 0.3 },
  "particle dissolve": { type: "sparkle", timing: 0, volume: 0.2, duration: 1.5 },
};

export const AMBIENT_SOUND_EFFECTS: Record<string, SoundEffect> = {
  wind: { type: "wind_ambience", timing: 0, volume: 0.1 },
  rain: { type: "rain_ambience", timing: 0, volume: 0.15 },
  heartbeat: { type: "heartbeat", timing: 0, volume: 0.2 },
  footsteps: { type: "footsteps", timing: 0, volume: 0.15 },
  sword_draw: { type: "sword_unsheath", timing: 0, volume: 0.25, duration: 1 },
  cloth_movement: { type: "cloth_rustle", timing: 0, volume: 0.1 },
  breathing: { type: "heavy_breathing", timing: 0, volume: 0.15 },
};

// ─── Soundtrack Selection ─────────────────────────────────────────────────────

/**
 * Select appropriate soundtrack mood based on emotion
 */
export function selectSoundtrackMood(emotion: EmotionType): SoundtrackMood {
  return EMOTION_TO_SOUNDTRACK[emotion] || "calm meditation";
}

/**
 * Get soundtrack profile for a mood
 */
export function getSoundtrackProfile(mood: SoundtrackMood): SoundtrackProfile {
  return SOUNDTRACK_PROFILES[mood];
}

/**
 * Generate FFmpeg audio filter for soundtrack mixing
 */
export function generateSoundtrackFilter(
  profile: SoundtrackProfile,
  duration: number
): string {
  const { volume, fadeIn, fadeOut } = profile;
  
  // Create fade in/out filter
  const fadeInFilter = fadeIn > 0 ? `afade=t=in:st=0:d=${fadeIn}` : "";
  const fadeOutFilter = fadeOut > 0 ? `afade=t=out:st=${duration - fadeOut}:d=${fadeOut}` : "";
  
  const filters = [
    `volume=${volume}`,
    fadeInFilter,
    fadeOutFilter,
  ].filter(Boolean);

  return filters.join(",");
}

/**
 * Mix voiceover with background soundtrack
 */
export function generateAudioMixFilter(
  voiceVolume: number = 1.0,
  musicVolume: number = 0.3
): string {
  // Ducking: lower music when voice is present
  return `[0:a]volume=${voiceVolume}[voice];[1:a]volume=${musicVolume}[music];[voice][music]amix=inputs=2:duration=first:dropout_transition=2`;
}

/**
 * Generate sound effect timing for a scene
 */
export function generateSceneSoundEffects(
  emotion: EmotionType,
  transitionType: TransitionType,
  duration: number
): SoundEffect[] {
  const effects: SoundEffect[] = [];

  // Add transition sound effect
  const transitionEffect = TRANSITION_SOUND_EFFECTS[transitionType];
  if (transitionEffect) {
    effects.push(transitionEffect);
  }

  // Add emotion-specific ambient sounds
  switch (emotion) {
    case "suspense":
    case "tension":
      effects.push({ ...AMBIENT_SOUND_EFFECTS.heartbeat, timing: 0 });
      break;
    case "fear":
      effects.push({ ...AMBIENT_SOUND_EFFECTS.breathing, timing: duration * 0.3 });
      break;
    case "sadness":
    case "melancholy":
      effects.push({ ...AMBIENT_SOUND_EFFECTS.wind, timing: 0 });
      break;
  }

  return effects;
}

/**
 * Create a soundtrack timeline for the entire video
 */
export interface SoundtrackTimeline {
  segments: SoundtrackSegment[];
  totalDuration: number;
}

export interface SoundtrackSegment {
  startTime: number;
  endTime: number;
  mood: SoundtrackMood;
  profile: SoundtrackProfile;
  soundEffects: SoundEffect[];
}

export function createSoundtrackTimeline(
  scenes: Array<{
    duration_seconds: number;
    emotion: EmotionType;
    transition_type: TransitionType;
    soundtrack_mood: SoundtrackMood;
  }>
): SoundtrackTimeline {
  const segments: SoundtrackSegment[] = [];
  let currentTime = 0;

  for (const scene of scenes) {
    const mood = scene.soundtrack_mood;
    const profile = getSoundtrackProfile(mood);
    const soundEffects = generateSceneSoundEffects(
      scene.emotion,
      scene.transition_type,
      scene.duration_seconds
    );

    segments.push({
      startTime: currentTime,
      endTime: currentTime + scene.duration_seconds,
      mood,
      profile,
      soundEffects,
    });

    currentTime += scene.duration_seconds;
  }

  return {
    segments,
    totalDuration: currentTime,
  };
}

/**
 * Get recommended ambient sounds for an environment
 */
export function getEnvironmentAmbience(environment: string): SoundEffect[] {
  const effects: SoundEffect[] = [];
  const envLower = environment.toLowerCase();

  if (envLower.includes("rain") || envLower.includes("storm")) {
    effects.push(AMBIENT_SOUND_EFFECTS.rain);
  }
  if (envLower.includes("wind") || envLower.includes("outdoor")) {
    effects.push(AMBIENT_SOUND_EFFECTS.wind);
  }

  return effects;
}
