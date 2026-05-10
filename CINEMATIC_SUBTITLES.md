# Cinematic Subtitle System

## Overview

The cinematic subtitle system transforms subtitle presentation from "PowerPoint overlays" into professional, anime-style captions that feel like Netflix, YouTube documentary edits, and cinematic trailers.

## Key Improvements

### Before (Old System)
- ❌ Full paragraphs displayed instantly
- ❌ Extremely large font size (22px)
- ❌ Text blocks dominate the screen
- ❌ Visuals hidden behind captions
- ❌ Static, presentation-like feel
- ❌ No synchronization with narration
- ❌ SRT format with limited styling

### After (Cinematic System)
- ✅ Phrase-by-phrase progressive display
- ✅ Smaller cinematic font (18px default)
- ✅ Max 1-2 lines visible at once
- ✅ Bottom-center positioning (safe zone)
- ✅ Smooth fade in/out animations
- ✅ Synchronized with voiceover timing
- ✅ ASS format with advanced styling

## Architecture

### 1. Phrase Segmentation

The system intelligently splits narration into cinematic phrases:

```typescript
// Instead of:
"In a world shrouded in darkness, where hope seems lost and despair reigns supreme, a hero emerges."

// Displays as:
"In a world shrouded in darkness,"
[fade out, fade in]
"where hope seems lost and despair reigns supreme,"
[fade out, fade in]
"a hero emerges."
```

**Splitting Strategy:**
1. **Sentence boundaries** (. ! ?) - highest priority
2. **Clause boundaries** (, ; :) - medium priority
3. **Word boundaries** - fallback for long text

**Constraints:**
- Max 42 characters per line (cinematic standard)
- Max 2 lines visible simultaneously
- Phrases distributed evenly across scene duration

### 2. Timing Synchronization

Each phrase is timed to match the voiceover narration:

```typescript
interface SubtitlePhrase {
  text: string;
  startTime: number;  // Seconds
  endTime: number;    // Seconds
  sceneIndex: number; // Which scene this belongs to
}
```

**Timing Distribution:**
- Scene duration divided evenly across phrases
- Each phrase gets equal time within its scene
- Smooth transitions between phrases

### 3. Cinematic Styling (ASS Format)

The system uses **Advanced SubStation Alpha (ASS)** format for professional styling:

```ass
[V4+ Styles]
Style: Cinematic,Arial,18,&HFFFFFF,&H000000FF,&H000000,&H80000000,1,0,0,0,100,100,0,0,1,2,1,2,20,20,50,1
```

**Style Breakdown:**
- **Font:** Arial (clean, readable)
- **Size:** 18px (smaller, cinematic)
- **Color:** White (`&HFFFFFF`)
- **Outline:** 2px black (`&H000000`)
- **Shadow:** 1px depth
- **Alignment:** Bottom-center (2)
- **Margin:** 50px from bottom (safe zone)

### 4. Fade Animations

Each phrase has smooth fade in/out transitions:

```ass
Dialogue: 0,0:00:05.00,0:00:08.50,Cinematic,,0,0,0,,{\fad(200,200)}In a world shrouded in darkness,
```

- **Fade In:** 200ms (0.2s)
- **Fade Out:** 200ms (0.2s)
- Prevents jarring text appearance/disappearance

### 5. Text Wrapping

Long phrases are automatically wrapped to maintain readability:

```typescript
// Input: "This is a very long phrase that exceeds the maximum character limit"
// Output (with \N line breaks):
"This is a very long phrase that\Nexceeds the maximum character limit"
```

## Configuration Options

The system is highly configurable:

```typescript
interface CinematicSubtitleOptions {
  fontSize?: number;           // Default: 18
  fontName?: string;           // Default: "Arial"
  primaryColor?: string;       // Default: "&HFFFFFF" (white)
  outlineColor?: string;       // Default: "&H000000" (black)
  outlineWidth?: number;       // Default: 2
  shadowDepth?: number;        // Default: 1
  marginBottom?: number;       // Default: 50 (safe zone)
  fadeInDuration?: number;     // Default: 0.2s
  fadeOutDuration?: number;    // Default: 0.2s
  maxCharsPerLine?: number;    // Default: 42
  maxLines?: number;           // Default: 2
}
```

### Usage Example

```typescript
await addCinematicSubtitles(
  jobId,
  scenes,
  timeline,
  rawVideoS3Key,
  tmpDir,
  {
    fontSize: 16,              // Even smaller
    maxCharsPerLine: 35,       // Shorter lines
    fadeInDuration: 0.3,       // Slower fade
    marginBottom: 60,          // More bottom margin
  },
  onLog
);
```

## Visual Safety

The system ensures subtitles don't interfere with visuals:

### Bottom-Center Positioning
- Subtitles anchored to bottom of screen
- 50px margin from bottom edge (safe zone)
- Centered horizontally

### Size Constraints
- Max 2 lines visible
- Max 42 characters per line
- Small font size (18px)

### Result
- Faces and action remain visible
- Subtitles complement, don't dominate
- Professional cinematic framing

## Comparison: SRT vs ASS

### Old System (SRT)
```srt
1
00:00:05,000 --> 00:00:12,000
In a world shrouded in darkness, where hope seems lost and despair reigns supreme, a hero emerges to challenge the forces of evil.
```

**Problems:**
- Full paragraph displayed at once
- Limited styling control
- No fade animations
- Hard to read long text

### New System (ASS)
```ass
Dialogue: 0,0:00:05.00,0:00:07.50,Cinematic,,0,0,0,,{\fad(200,200)}In a world shrouded in darkness,
Dialogue: 0,0:00:07.50,0:00:10.00,Cinematic,,0,0,0,,{\fad(200,200)}where hope seems lost\Nand despair reigns supreme,
Dialogue: 0,0:00:10.00,0:00:12.00,Cinematic,,0,0,0,,{\fad(200,200)}a hero emerges to challenge\Nthe forces of evil.
```

**Benefits:**
- Phrase-by-phrase display
- Advanced styling (shadows, outlines)
- Smooth fade animations
- Readable, cinematic pacing

## FFmpeg Integration

The system uses FFmpeg's `ass` filter for subtitle burn-in:

```typescript
ffmpeg(videoPath)
  .videoFilters(`ass='${escapedAssPath}'`)
  .outputOptions([
    "-c:v", "libx264",
    "-preset", "fast",
    "-crf", "22",
    "-c:a", "copy",
    "-pix_fmt", "yuv420p",
  ])
  .output(outputPath)
  .run();
```

**Why ASS filter?**
- Full support for advanced styling
- Hardware-accelerated rendering
- Precise timing control
- Fade animation support

## Target Aesthetic

The system targets the subtitle style of:

### ✅ Anime Recap Videos
- Small, bottom-center text
- Phrase-by-phrase narration
- Smooth transitions
- Non-intrusive

### ✅ Netflix Captions
- Clean typography
- Proper safe zones
- Readable but subtle
- Professional styling

### ✅ Cinematic Trailers
- Dramatic pacing
- Synchronized with voiceover
- Emphasis on key phrases
- Smooth animations

### ✅ YouTube Documentary Edits
- Informative but not distracting
- Proper timing with narration
- Clean, modern design
- Accessible typography

## Future Enhancements

### Word-Level Timing (Advanced)
Currently, phrases are timed evenly across scenes. Future enhancement:
- Extract word-level timing from TTS
- Karaoke-style word highlighting
- Precise synchronization with speech

### Adaptive Positioning
- Detect faces/action in video
- Dynamically position subtitles to avoid covering important visuals
- Scene-aware subtitle placement

### Subtitle Themes
Predefined themes for different styles:
- **Anime:** Colorful, bold, dramatic
- **Documentary:** Clean, minimal, professional
- **Trailer:** Large, impactful, cinematic
- **Tutorial:** Clear, instructional, persistent

### Animation Presets
- **Typewriter:** Character-by-character reveal
- **Slide:** Slide in from bottom
- **Zoom:** Subtle zoom effect
- **Glow:** Pulsing glow on emphasis words

## Testing

To test the cinematic subtitle system:

1. **Generate a video** with the new system
2. **Check subtitle appearance:**
   - Are phrases short (1-2 lines)?
   - Is font size appropriate (not too large)?
   - Are subtitles bottom-center?
   - Do fade animations work smoothly?
3. **Verify timing:**
   - Do subtitles sync with voiceover?
   - Are transitions smooth?
   - Is pacing natural?
4. **Visual safety:**
   - Are faces visible?
   - Is action unobstructed?
   - Do subtitles complement visuals?

## Migration Notes

### Old System (subtitles.ts)
- Used SRT format
- Full paragraph display
- Large font (22px)
- Basic styling
- No animations

### New System (cinematic-subtitles.ts)
- Uses ASS format
- Phrase-by-phrase display
- Smaller font (18px)
- Advanced styling
- Fade animations

### Worker Integration
The worker now uses `addCinematicSubtitles()` instead of `addSubtitles()`:

```typescript
// Old
await addSubtitles(jobId, segments, timeline, rawVideoS3Key, tmpDir, onLog);

// New
await addCinematicSubtitles(
  jobId,
  scenes,
  timeline,
  rawVideoS3Key,
  tmpDir,
  { fontSize: 18, maxCharsPerLine: 42 },
  onLog
);
```

## Conclusion

The cinematic subtitle system transforms subtitle presentation from static text overlays into professional, immersive captions that enhance the viewing experience without dominating the screen.

**Key Achievement:** Subtitles now feel like anime recaps, Netflix captions, and cinematic trailers—not PowerPoint slides.
