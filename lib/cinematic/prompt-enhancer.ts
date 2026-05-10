/**
 * Cinematic Prompt Enhancer
 * Transforms basic visual prompts into cinematic, anime-style prompts with
 * consistent style enforcement, lighting, camera work, and atmosphere.
 */
import type {
  CinematicPromptEnhancement,
  EmotionType,
  ShotType,
  CharacterDescription,
} from "../types/cinematic";

// ─── Style Templates ──────────────────────────────────────────────────────────

const ANIME_STYLE_BASE = `MAPPA-inspired anime style, dark fantasy aesthetic, highly detailed anime art, cinematic composition, movie-quality animation frame`;

const LIGHTING_PRESETS: Record<string, string> = {
  dark: "dramatic shadows, low-key lighting, rim lighting, deep blacks, high contrast",
  bright: "soft natural lighting, warm tones, gentle highlights, balanced exposure",
  mysterious: "volumetric fog, god rays, atmospheric haze, moody lighting, silhouettes",
  dramatic: "chiaroscuro lighting, strong directional light, deep shadows, cinematic contrast",
  twilight: "golden hour lighting, warm orange and purple tones, soft shadows, magical atmosphere",
  night: "moonlight, cool blue tones, star-lit sky, bioluminescent accents, deep shadows",
  ethereal: "soft diffused light, glowing particles, dreamy atmosphere, lens flares, magical glow",
};

const CAMERA_MOVEMENTS: Record<string, string> = {
  "slow dolly forward": "slow push-in camera movement, gradually approaching subject, cinematic depth",
  "slow dolly backward": "slow pull-back reveal, expanding frame, dramatic reveal",
  "pan left": "smooth horizontal pan left, following action, fluid camera work",
  "pan right": "smooth horizontal pan right, revealing environment, cinematic sweep",
  "static": "locked-off camera, stable composition, focused framing",
  "slow zoom in": "gradual zoom into subject, building tension, intimate framing",
  "slow zoom out": "slow zoom out reveal, expanding context, epic scale",
  "crane up": "rising crane shot, ascending perspective, grand reveal",
  "crane down": "descending crane shot, intimate approach, dramatic descent",
  "orbit": "orbital camera movement, 360-degree perspective, dynamic composition",
  "handheld shake": "subtle handheld movement, organic feel, documentary style",
};

const ATMOSPHERE_BY_EMOTION: Record<EmotionType, string> = {
  mystery: "mysterious fog, hidden details, enigmatic atmosphere, subtle shadows",
  suspense: "tense atmosphere, ominous clouds, building tension, dramatic sky",
  joy: "bright atmosphere, cheerful environment, warm colors, uplifting mood",
  sadness: "melancholic atmosphere, rain or mist, muted colors, somber mood",
  fear: "dark oppressive atmosphere, threatening shadows, cold tones, unsettling environment",
  anger: "intense atmosphere, storm clouds, aggressive colors, turbulent environment",
  wonder: "magical atmosphere, sparkling particles, vibrant colors, awe-inspiring environment",
  tension: "claustrophobic atmosphere, heavy air, muted tones, pressure building",
  calm: "peaceful atmosphere, gentle breeze, soft colors, tranquil environment",
  excitement: "dynamic atmosphere, energy particles, vibrant colors, kinetic environment",
  melancholy: "bittersweet atmosphere, autumn colors, fading light, nostalgic mood",
  triumph: "victorious atmosphere, golden light, epic sky, celebratory environment",
};

const COLOR_GRADING_BY_EMOTION: Record<EmotionType, string> = {
  mystery: "desaturated with teal and orange, crushed blacks, lifted shadows",
  suspense: "cool blue tones, high contrast, deep shadows, tension-building palette",
  joy: "warm saturated colors, lifted blacks, bright highlights, cheerful palette",
  sadness: "desaturated blues and grays, low contrast, muted tones, melancholic palette",
  fear: "cold desaturated tones, green-blue cast, deep blacks, horror palette",
  anger: "aggressive reds and oranges, high contrast, intense saturation, fiery palette",
  wonder: "vibrant saturated colors, magical purples and blues, glowing highlights",
  tension: "desaturated with selective color, teal shadows, orange highlights",
  calm: "soft pastels, low contrast, gentle tones, peaceful palette",
  excitement: "vibrant saturated colors, high energy palette, dynamic contrast",
  melancholy: "warm desaturated tones, autumn colors, soft contrast, nostalgic palette",
  triumph: "golden hour tones, warm highlights, epic color grade, victorious palette",
};

// ─── Main Enhancement Function ────────────────────────────────────────────────

export function enhanceCinematicPrompt(
  basePrompt: string,
  emotion: EmotionType,
  cameraDirection: string,
  lighting: string,
  shotType?: ShotType,
  characters?: CharacterDescription[]
): CinematicPromptEnhancement {
  // Build character consistency injection
  let characterPrompt = "";
  if (characters && characters.length > 0) {
    characterPrompt = characters
      .map(
        (char) =>
          `${char.name}: ${char.hairstyle}, ${char.clothing}, ${char.facial_features}, ${char.anime_style_notes}`
      )
      .join("; ");
  }

  // Select lighting preset or use custom
  const lightingDetails =
    LIGHTING_PRESETS[lighting.toLowerCase()] ||
    lighting ||
    LIGHTING_PRESETS.dramatic;

  // Get camera movement details
  const cameraMovement =
    CAMERA_MOVEMENTS[cameraDirection] || cameraDirection || "static composition";

  // Get atmosphere and color grading
  const atmosphere = ATMOSPHERE_BY_EMOTION[emotion];
  const colorGrading = COLOR_GRADING_BY_EMOTION[emotion];

  // Build shot type description
  const shotDescription = shotType
    ? `${shotType} framing, professional cinematography,`
    : "cinematic framing,";

  // Construct enhanced prompt
  const enhancedPrompt = `${ANIME_STYLE_BASE}, ${shotDescription} ${basePrompt}${
    characterPrompt ? `, featuring ${characterPrompt}` : ""
  }, ${lightingDetails}, ${cameraMovement}, ${atmosphere}, ${colorGrading}, detailed anime eyes, atmospheric fog, movie-quality composition, 4K anime wallpaper quality, trending on ArtStation, professional anime production`;

  return {
    base_prompt: basePrompt,
    lighting: lightingDetails,
    camera_movement: cameraMovement,
    atmosphere,
    color_grading: colorGrading,
    style_enforcement: ANIME_STYLE_BASE,
    motion_details: cameraMovement,
  };
}

/**
 * Generate a complete visual prompt for a scene
 */
export function generateScenePrompt(
  visualCue: string,
  emotion: EmotionType,
  environment: string,
  cameraDirection: string,
  lighting: string,
  shotType?: ShotType,
  characters?: CharacterDescription[]
): string {
  const basePrompt = `${visualCue} in ${environment}`;
  const enhancement = enhanceCinematicPrompt(
    basePrompt,
    emotion,
    cameraDirection,
    lighting,
    shotType,
    characters
  );

  return enhancement.style_enforcement + ", " + basePrompt + ", " +
    enhancement.lighting + ", " + enhancement.camera_movement + ", " +
    enhancement.atmosphere + ", " + enhancement.color_grading +
    ", detailed anime eyes, atmospheric depth, cinematic composition";
}

/**
 * Ensure consistent character descriptions across all scenes
 */
export function injectCharacterConsistency(
  prompt: string,
  characters: CharacterDescription[]
): string {
  if (!characters || characters.length === 0) return prompt;

  const characterDetails = characters
    .map(
      (char) =>
        `${char.name} (${char.hairstyle}, ${char.clothing}, ${char.facial_features}, color palette: ${char.color_palette.join(", ")})`
    )
    .join("; ");

  return `${prompt}, consistent character design: ${characterDetails}`;
}

/**
 * Add motion and depth cues to static prompts
 */
export function addMotionCues(
  prompt: string,
  cameraDirection: string,
  emotion: EmotionType
): string {
  const motionCues: string[] = [];

  // Add camera-specific motion cues
  if (cameraDirection.includes("dolly") || cameraDirection.includes("zoom")) {
    motionCues.push("depth of field", "bokeh background", "parallax layers");
  }

  if (cameraDirection.includes("pan") || cameraDirection.includes("orbit")) {
    motionCues.push("motion blur hints", "dynamic composition", "flowing movement");
  }

  // Add emotion-specific motion cues
  if (["suspense", "tension", "fear"].includes(emotion)) {
    motionCues.push("subtle camera shake", "unstable framing");
  }

  if (["excitement", "action", "anger"].includes(emotion)) {
    motionCues.push("dynamic angles", "kinetic energy", "motion lines");
  }

  if (motionCues.length > 0) {
    return `${prompt}, ${motionCues.join(", ")}`;
  }

  return prompt;
}
