# Cinematic AI Storytelling Engine - Architecture Documentation

## Overview

Animatube has been upgraded from a simple narration slideshow generator into a **cinematic AI storytelling engine** with professional-grade video quality, emotional pacing, and anime-style aesthetics.

## Architecture Principles

✅ **Modular Design** - Each component is independent and reusable  
✅ **Backward Compatible** - Old pipeline still available as fallback  
✅ **Performance Optimized** - Efficient token usage and rendering  
✅ **Cinematic Quality** - MAPPA-inspired anime aesthetic with motion effects  

---

## New Pipeline Flow

```
Topic Input
    ↓
Story Planner (AI) ← Emotional beats, pacing, scene structure
    ↓
Scene Script Generator (AI) ← Detailed narration per scene
    ↓
Cinematic Prompt Enhancer ← Visual style, lighting, camera work
    ↓
Visual Generation ← Pexels API or cinematic placeholders
    ↓
Motion Effects Engine ← Zoom, pan, parallax, atmospheric effects
    ↓
Video Assembly ← FFmpeg with transitions and audio mixing
    ↓
Subtitle Engine ← Cinematic typography
    ↓
YouTube Upload
```

---

## Core Components

### 1. Story Planner (`lib/cinematic/story-planner.ts`)

**Purpose:** AI-powered planning layer that creates structured story arcs before script generation.

**Features:**
- Identifies emotional beats (mystery, suspense, joy, etc.)
- Creates suspense pacing (intro → buildup → climax → resolution)
- Assigns camera directions and lighting per scene
- Generates scene objectives and narrative beats

**Output:** `StoryPlan` with scene-by-scene emotional structure

**Example:**
```typescript
{
  "total_duration": 180,
  "story_arc": {
    "intro": { "start": 0, "end": 30 },
    "buildup": { "start": 30, "end": 120 },
    "climax": { "start": 120, "end": 150 },
    "resolution": { "start": 150, "end": 180 }
  },
  "scenes": [
    {
      "scene": 1,
      "purpose": "introduce tension",
      "emotion": "mystery",
      "camera": "slow dolly forward",
      "lighting": "dark foggy twilight",
      "duration_seconds": 10,
      "narrative_beat": "hook"
    }
  ]
}
```

---

### 2. Scene Script Generator (`lib/cinematic/scene-script-generator.ts`)

**Purpose:** Generates detailed scripts based on story plans with scene-by-scene breakdown.

**Features:**
- Duration-aware narration (2.2-2.8 words per second based on emotion)
- Emotional pacing (slower for dramatic scenes, faster for action)
- Character consistency tracking
- Visual prompt generation per scene

**Output:** `SceneScriptOutput` with full narration and visual cues

**Example:**
```typescript
{
  "title": "The Mystery of Neural Networks",
  "scenes": [
    {
      "scene_id": 1,
      "duration_seconds": 10,
      "narration": "Deep in the digital realm, a mystery unfolds. Neural networks, the enigmatic architects of artificial intelligence, hold secrets waiting to be discovered.",
      "emotion": "mystery",
      "environment": "dark digital landscape with glowing neural pathways",
      "camera_direction": "slow dolly forward",
      "visual_prompt": "abstract neural network visualization",
      "transition_type": "fade through fog",
      "soundtrack_mood": "mysterious whispers"
    }
  ]
}
```

---

### 3. Cinematic Prompt Enhancer (`lib/cinematic/prompt-enhancer.ts`)

**Purpose:** Transforms basic visual prompts into cinematic, anime-style prompts.

**Features:**
- MAPPA-inspired anime style enforcement
- Cinematic lighting presets (dramatic, mysterious, ethereal, etc.)
- Camera movement descriptions
- Atmosphere and color grading by emotion
- Character consistency injection

**Example Enhancement:**
```
Input: "person walking in forest"

Output: "MAPPA-inspired anime style, dark fantasy aesthetic, person walking in mystical forest, dramatic shadows, low-key lighting, rim lighting, slow dolly forward camera movement, volumetric fog, god rays, atmospheric haze, desaturated with teal and orange color grading, detailed anime eyes, atmospheric depth, cinematic composition, 4K anime wallpaper quality"
```

---

### 4. Motion Effects Engine (`lib/cinematic/motion-effects.ts`)

**Purpose:** Applies cinematic motion effects to static images and video clips using FFmpeg.

**Features:**
- **Slow Zoom** (Ken Burns effect)
- **Cinematic Pan** (left, right, up, down)
- **Parallax Movement** (depth illusion)
- **Camera Shake** (handheld feel)
- **Vignette** (cinematic framing)
- **Glow Effects** (anime aesthetic)
- **Depth Blur** (bokeh)
- **Fog Overlay** (atmospheric)

**Camera Direction Mapping:**
- `slow dolly forward` → Zoom in + vignette
- `pan left/right` → Horizontal pan
- `crane up/down` → Vertical pan
- `orbit` → Parallax effect
- `handheld shake` → Shake + subtle zoom

---

### 5. Soundtrack System (`lib/cinematic/soundtrack.ts`)

**Purpose:** Emotion-aware soundtrack selection and audio mixing.

**Features:**
- Emotion-to-soundtrack mapping
- Soundtrack profiles (tempo, intensity, instruments, volume)
- Sound effect generation (transitions, ambient sounds)
- Audio mixing with ducking (lower music when voice is present)

**Soundtrack Moods:**
- `dark ambient drones` - Suspense, fear
- `soft piano orchestral` - Sadness, melancholy
- `percussion heavy orchestral` - Anger, action
- `japanese flute ambience` - Wonder, calm
- `epic cinematic` - Triumph
- `heartbeat tension` - Tension
- `mysterious whispers` - Mystery

---

## Database Schema Updates

New fields added to `Video` model:

```prisma
model Video {
  // ... existing fields ...
  
  // Cinematic enhancements
  storyPlan   Json? // StoryPlan structure
  scenes      Json? // CinematicScene[] array
  characters  Json? // CharacterDescription[] array
  storyboard  Json? // Storyboard preview data
}
```

---

## API Endpoints

### GET `/api/storyboard/[jobId]`
Returns storyboard preview for a job before final rendering.

**Response:**
```json
{
  "job_id": "job_123",
  "total_duration": 180,
  "scenes": [
    {
      "scene_id": 1,
      "narration_preview": "Deep in the digital realm...",
      "estimated_duration": 10,
      "visual_prompt": "abstract neural network visualization",
      "soundtrack_mood": "mysterious whispers",
      "camera_notes": "slow dolly forward"
    }
  ]
}
```

---

## Worker Pipeline Updates

The worker now uses the cinematic pipeline:

**Stage 1:** Story Planning + Scene Script Generation  
**Stage 2:** Voiceover Generation (unchanged)  
**Stage 3:** Cinematic Visual Fetching (enhanced prompts)  
**Stage 4:** Cinematic Assembly (motion effects + transitions)  
**Stage 5:** Subtitle Burn-in (unchanged)  
**Stage 6:** YouTube Upload (unchanged)

---

## Performance Optimizations

1. **Token Efficiency**
   - Reusable style templates
   - Avoid duplicate context in prompts
   - Increased token limits only where needed (4000 for scripts, 3000 for planning)

2. **Rendering Speed**
   - Motion effects applied during processing (no extra pass)
   - FFmpeg preset: `medium` (balance quality/speed)
   - CRF: 20 (high quality for cinematic look)

3. **Memory Management**
   - Temp files cleaned up after each stage
   - S3 upload immediately after generation
   - Processed clips deleted after concatenation

---

## Character Consistency

Characters are defined once and injected into every scene prompt:

```typescript
{
  "id": "protagonist",
  "name": "Kai",
  "hairstyle": "spiky silver hair with blue highlights",
  "clothing": "black tactical jacket with glowing blue accents",
  "facial_features": "sharp amber eyes, determined expression",
  "color_palette": ["#1a1a2e", "#0f3460", "#16213e", "#e94560"],
  "personality_expression": "confident and mysterious",
  "anime_style_notes": "MAPPA-style detailed eyes, dynamic hair movement"
}
```

---

## Narration Pacing

Emotional pacing adjusts words-per-second:

| Emotion | WPS | Use Case |
|---------|-----|----------|
| Sadness, Melancholy, Mystery | 2.2 | Slow, dramatic |
| Neutral, Calm | 2.5 | Standard pace |
| Excitement, Fear, Anger | 2.8 | Fast, urgent |

**Validation:**
```typescript
const wordCount = narration.split(/\s+/).length;
const estimatedDuration = wordCount / wps;
// Adjust if mismatch > 30%
```

---

## Future Enhancements

### Priority 1 (Implemented)
- ✅ Scene-based generation
- ✅ Story planner
- ✅ Cinematic prompt enhancer
- ✅ Motion effects engine
- ✅ Soundtrack system

### Priority 2 (Planned)
- ⏳ Storyboard preview UI
- ⏳ Scene editing before render
- ⏳ Character consistency UI
- ⏳ AI shot direction system
- ⏳ Advanced transitions (xfade filter)

### Priority 3 (Future)
- 🔮 Real soundtrack integration (royalty-free music API)
- 🔮 Advanced subtitle animations
- 🔮 Multi-character dialogue
- 🔮 Custom visual style training
- 🔮 Real-time preview generation

---

## Migration Guide

### For Existing Jobs
Old jobs will continue to work with the original pipeline. The system automatically detects which pipeline to use based on the presence of `storyPlan` data.

### For New Jobs
All new jobs automatically use the cinematic pipeline. No changes needed in the frontend.

### Rollback Strategy
If issues occur, the original pipeline is still available:
- `lib/stages/script.ts` - Original script generator
- `lib/stages/visuals.ts` - Original visual fetcher
- `lib/stages/assemble.ts` - Original assembler

---

## Testing

### Unit Tests
```bash
# Test story planner
npm run test:story-planner

# Test prompt enhancer
npm run test:prompt-enhancer

# Test motion effects
npm run test:motion-effects
```

### Integration Tests
```bash
# Test full cinematic pipeline
npm run test:cinematic-pipeline
```

### Manual Testing
1. Generate a short video (3 min)
2. Check story plan in database
3. Verify scene count and durations
4. Review motion effects in output
5. Validate narration pacing

---

## Troubleshooting

### Issue: Narration too short
**Cause:** AI generated too few words per scene  
**Fix:** Adjust `max_tokens` in scene script generator or regenerate

### Issue: Motion effects not applied
**Cause:** FFmpeg filter error  
**Fix:** Check FFmpeg logs, verify filter syntax

### Issue: Character inconsistency
**Cause:** Character descriptions not injected  
**Fix:** Verify `characters` array in script output

### Issue: Slow rendering
**Cause:** High CRF or complex filters  
**Fix:** Adjust CRF to 23 or use `fast` preset

---

## Credits

**Architecture Design:** Cinematic AI Storytelling Engine  
**Visual Style:** MAPPA-inspired anime aesthetic  
**Motion Effects:** FFmpeg-based cinematic processing  
**AI Models:** Groq (llama-3.3-70b-versatile)  
**TTS:** Microsoft Edge Neural Voices  
**Stock Footage:** Pexels API  

---

## License

This architecture is part of the Animatube project. See main LICENSE file for details.
