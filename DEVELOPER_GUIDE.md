# Developer Guide - Cinematic Pipeline

Quick reference for developers working with the cinematic storytelling engine.

---

## Quick Start

```bash
# 1. Install dependencies
npm install

# 2. Update database
npx prisma generate
npx prisma db push

# 3. Start services
npm run dev      # Terminal 1
npm run worker   # Terminal 2
```

---

## Architecture Overview

```
User Input → Story Planner → Scene Script → Prompt Enhancer → Visuals → Motion Effects → Assembly → Subtitles → Upload
```

---

## Key Files

### Core Types
```typescript
// lib/types/cinematic.ts
CinematicScene      // Scene structure
StoryPlan           // Story planning output
CharacterDescription // Character consistency
MotionEffect        // Motion effect types
```

### Cinematic Modules
```typescript
// lib/cinematic/story-planner.ts
generateStoryPlan(input) → StoryPlan

// lib/cinematic/scene-script-generator.ts
generateSceneScript(storyPlan, ...) → SceneScriptOutput

// lib/cinematic/prompt-enhancer.ts
enhanceCinematicPrompt(...) → CinematicPromptEnhancement
generateScenePrompt(...) → string

// lib/cinematic/motion-effects.ts
applyMotionEffectsToImage(...)
applyMotionEffectsToClip(...)
getCameraMotionEffect(...) → string[]

// lib/cinematic/soundtrack.ts
selectSoundtrackMood(emotion) → SoundtrackMood
createSoundtrackTimeline(scenes) → SoundtrackTimeline
```

### Pipeline Stages
```typescript
// lib/stages/cinematic-script.ts
generateCinematicScript(...) → { storyPlan, script }

// lib/stages/cinematic-visuals.ts
fetchCinematicVisuals(...) → CinematicTimelineEntry[]

// lib/stages/cinematic-assembly.ts
assembleCinematicVideo(...) → s3Key
```

---

## Common Tasks

### Add New Emotion Type

1. Update type definition:
```typescript
// lib/types/cinematic.ts
export type EmotionType =
  | "mystery"
  | "your_new_emotion"; // Add here
```

2. Add atmosphere mapping:
```typescript
// lib/cinematic/prompt-enhancer.ts
const ATMOSPHERE_BY_EMOTION: Record<EmotionType, string> = {
  your_new_emotion: "description of atmosphere",
};
```

3. Add color grading:
```typescript
const COLOR_GRADING_BY_EMOTION: Record<EmotionType, string> = {
  your_new_emotion: "color grading description",
};
```

4. Add soundtrack mapping:
```typescript
// lib/cinematic/soundtrack.ts
export const EMOTION_TO_SOUNDTRACK: Record<EmotionType, SoundtrackMood> = {
  your_new_emotion: "appropriate_soundtrack_mood",
};
```

### Add New Camera Movement

1. Update type:
```typescript
// lib/types/cinematic.ts
export type CameraDirection =
  | "slow dolly forward"
  | "your_new_movement"; // Add here
```

2. Add movement description:
```typescript
// lib/cinematic/prompt-enhancer.ts
const CAMERA_MOVEMENTS: Record<string, string> = {
  "your_new_movement": "description for AI prompt",
};
```

3. Add motion effect:
```typescript
// lib/cinematic/motion-effects.ts
export function getCameraMotionEffect(
  cameraDirection: CameraDirection,
  duration: number
): string[] {
  switch (cameraDirection) {
    case "your_new_movement":
      return [generateYourCustomFilter(duration)];
  }
}
```

### Add New Motion Effect

1. Create filter generator:
```typescript
// lib/cinematic/motion-effects.ts
export function generateYourEffect(
  duration: number,
  intensity: number = 1.0
): string {
  // Return FFmpeg filter string
  return `your_ffmpeg_filter_here`;
}
```

2. Add to effect type:
```typescript
// lib/types/cinematic.ts
export type MotionEffectType =
  | "slow_zoom"
  | "your_new_effect"; // Add here
```

3. Use in assembly:
```typescript
// lib/stages/cinematic-assembly.ts
await applyMotionEffectsToImage(
  imagePath,
  outputPath,
  duration,
  cameraDirection,
  ["vignette", "your_new_effect"] // Add here
);
```

### Add New Soundtrack Mood

1. Update type:
```typescript
// lib/types/cinematic.ts
export type SoundtrackMood =
  | "dark ambient drones"
  | "your_new_mood"; // Add here
```

2. Add profile:
```typescript
// lib/cinematic/soundtrack.ts
export const SOUNDTRACK_PROFILES: Record<SoundtrackMood, SoundtrackProfile> = {
  "your_new_mood": {
    mood: "your_new_mood",
    tempo: "medium",
    intensity: 0.7,
    instruments: ["list", "of", "instruments"],
    volume: 0.3,
    fadeIn: 2,
    fadeOut: 2,
  },
};
```

### Customize Story Planning

Edit the system prompt:
```typescript
// lib/cinematic/story-planner.ts
const systemPrompt = `You are a master cinematic storyteller...
// Modify instructions here
`;
```

Adjust scene count:
```typescript
const sceneCount = input.duration === "short" ? 15 : 30; // Change these
```

### Customize Narration Pacing

Edit pacing function:
```typescript
// lib/cinematic/story-planner.ts
export function getEmotionalPacing(
  emotion: string,
  narrativeBeat: string
): number {
  let wps = 2.5; // Base words per second
  
  // Adjust for your needs
  if (emotion === "your_emotion") {
    wps = 2.0; // Slower
  }
  
  return wps;
}
```

---

## Testing

### Unit Test Example
```typescript
// test/cinematic/story-planner.test.ts
import { generateStoryPlan } from "@/lib/cinematic/story-planner";

describe("Story Planner", () => {
  it("should generate story plan with correct duration", async () => {
    const plan = await generateStoryPlan({
      topic: "test topic",
      style: "educational",
      duration: "short",
      language: "english",
    });
    
    expect(plan.total_duration).toBe(180);
    expect(plan.scenes.length).toBeGreaterThan(0);
  });
});
```

### Integration Test
```typescript
// test/integration/cinematic-pipeline.test.ts
import { generateCinematicScript } from "@/lib/stages/cinematic-script";

describe("Cinematic Pipeline", () => {
  it("should generate complete cinematic script", async () => {
    const result = await generateCinematicScript(
      "test_job_123",
      "neural networks",
      "educational",
      "short",
      "english"
    );
    
    expect(result.storyPlan).toBeDefined();
    expect(result.script.scenes.length).toBeGreaterThan(0);
    expect(result.script.title).toBeTruthy();
  });
});
```

---

## Debugging

### Enable Verbose Logging
```typescript
// lib/worker.ts
console.log("[Stage X] Detailed info:", data);
```

### Check Story Plan
```typescript
// After stage 1
const video = await prisma.video.findUnique({ where: { jobId } });
console.log("Story Plan:", JSON.stringify(video.storyPlan, null, 2));
```

### Inspect Timeline
```typescript
// After stage 3
console.log("Timeline:", timeline.map(t => ({
  scene: t.scene.scene_id,
  duration: t.end_sec - t.start_sec,
  emotion: t.scene.emotion,
})));
```

### Test Motion Effects
```typescript
// Standalone test
import { applyMotionEffectsToImage } from "@/lib/cinematic/motion-effects";

await applyMotionEffectsToImage(
  "test-input.png",
  "test-output.mp4",
  10,
  "slow dolly forward",
  ["vignette"]
);
```

### Validate Narration Duration
```typescript
import { validateNarrationDuration } from "@/lib/cinematic/scene-script-generator";

const result = validateNarrationDuration(
  "Your narration text here",
  10, // target duration
  "mystery",
  "hook"
);

console.log("Valid:", result.valid);
console.log("Estimated:", result.estimated);
console.log("Difference:", result.difference);
```

---

## Performance Optimization

### Reduce Token Usage
```typescript
// Use shorter prompts
const systemPrompt = `Brief instructions...`;

// Reduce max_tokens
max_tokens: 2000, // Instead of 4000
```

### Speed Up Rendering
```typescript
// Use faster FFmpeg preset
"-preset", "fast", // Instead of "medium"

// Lower CRF (less quality, faster)
"-crf", "23", // Instead of "20"
```

### Parallel Processing
```typescript
// Process scenes in parallel (future enhancement)
const promises = scenes.map(scene => processScene(scene));
await Promise.all(promises);
```

---

## Common Patterns

### Logging Pattern
```typescript
onLog?.(`🎬 Starting process...`);
console.log(`[Module] Detailed info for debugging`);
onLog?.(`✓ Process complete`);
```

### Error Handling Pattern
```typescript
try {
  const result = await riskyOperation();
  onLog?.(`✓ Success`);
  return result;
} catch (err) {
  const error = err as Error;
  onLog?.(`❌ Failed: ${error.message}`);
  throw new Error(`Operation failed: ${error.message}`);
}
```

### S3 Upload Pattern
```typescript
// Upload JSON
await uploadToS3(
  `jobs/${jobId}/data.json`,
  JSON.stringify(data, null, 2),
  "application/json"
);

// Upload file
await uploadFileToS3(
  `jobs/${jobId}/file.mp4`,
  localPath,
  "video/mp4"
);
```

### FFmpeg Promise Pattern
```typescript
function processVideo(input: string, output: string): Promise<void> {
  return new Promise((resolve, reject) => {
    ffmpeg(input)
      .outputOptions([...])
      .output(output)
      .on("end", () => resolve())
      .on("error", reject)
      .run();
  });
}
```

---

## Environment Variables

```bash
# Required
GROQ_API_KEY=your_groq_key
REDIS_URL=redis://localhost:6379
DATABASE_URL=postgresql://...

# Optional
PEXELS_API_KEY=your_pexels_key  # Falls back to placeholders
UPSTASH_REDIS_REST_URL=...      # For rate limiting
UPSTASH_REDIS_REST_TOKEN=...    # For rate limiting

# YouTube (for upload stage)
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
NEXTAUTH_SECRET=...
NEXTAUTH_URL=http://localhost:3000

# AWS S3
AWS_ACCESS_KEY_ID=...
AWS_SECRET_ACCESS_KEY=...
AWS_REGION=us-east-1
AWS_S3_BUCKET=your-bucket
```

---

## Useful Commands

```bash
# Development
npm run dev          # Start Next.js dev server
npm run worker       # Start BullMQ worker
npm run build        # Build TypeScript

# Database
npx prisma generate  # Generate Prisma client
npx prisma db push   # Push schema changes
npx prisma studio    # Open database GUI

# Testing
npm run test         # Run all tests
npm run test:watch   # Watch mode
npm run test:coverage # Coverage report

# Linting
npm run lint         # ESLint
npm run type-check   # TypeScript check

# Production
npm run start        # Start production server
npm run worker:prod  # Start production worker
```

---

## Resources

- **Full Documentation:** `CINEMATIC_ARCHITECTURE.md`
- **Upgrade Guide:** `UPGRADE_SUMMARY.md`
- **FFmpeg Filters:** https://ffmpeg.org/ffmpeg-filters.html
- **Groq API:** https://console.groq.com/docs
- **Pexels API:** https://www.pexels.com/api/documentation/

---

## Contributing

When adding new features:

1. ✅ Keep modules independent
2. ✅ Add TypeScript types
3. ✅ Include error handling
4. ✅ Add logging for debugging
5. ✅ Update documentation
6. ✅ Write tests
7. ✅ Optimize performance

---

Happy coding! 🎬✨
