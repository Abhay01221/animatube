# Cinematic Subtitle Customization Guide

## Quick Start

The cinematic subtitle system is now integrated into the video generation pipeline. By default, it uses professional anime/Netflix-style settings.

## Default Settings

```typescript
{
  fontSize: 18,              // Smaller, cinematic size
  fontName: "Arial",         // Clean, readable font
  primaryColor: "&HFFFFFF",  // White text
  outlineColor: "&H000000",  // Black outline
  outlineWidth: 2,           // 2px outline
  shadowDepth: 1,            // 1px shadow
  marginBottom: 50,          // 50px from bottom (safe zone)
  fadeInDuration: 0.2,       // 200ms fade in
  fadeOutDuration: 0.2,      // 200ms fade out
  maxCharsPerLine: 42,       // Cinematic standard
  maxLines: 2                // Max 2 lines visible
}
```

## Customization Examples

### 1. Smaller, More Subtle Subtitles

For a minimalist, documentary-style look:

```typescript
await addCinematicSubtitles(
  jobId,
  scenes,
  timeline,
  rawVideoS3Key,
  tmpDir,
  {
    fontSize: 16,           // Even smaller
    maxCharsPerLine: 35,    // Shorter lines
    marginBottom: 60,       // More space from bottom
    fadeInDuration: 0.3,    // Slower, smoother fade
    fadeOutDuration: 0.3,
  },
  onLog
);
```

### 2. Bold, Dramatic Subtitles

For trailer-style, impactful captions:

```typescript
await addCinematicSubtitles(
  jobId,
  scenes,
  timeline,
  rawVideoS3Key,
  tmpDir,
  {
    fontSize: 22,           // Larger for impact
    outlineWidth: 3,        // Thicker outline
    shadowDepth: 2,         // Deeper shadow
    maxCharsPerLine: 30,    // Shorter, punchier phrases
    fadeInDuration: 0.15,   // Quick, snappy fade
    fadeOutDuration: 0.15,
  },
  onLog
);
```

### 3. Anime Recap Style

For colorful, energetic anime-style subtitles:

```typescript
await addCinematicSubtitles(
  jobId,
  scenes,
  timeline,
  rawVideoS3Key,
  tmpDir,
  {
    fontSize: 20,
    fontName: "Impact",     // Bold, impactful font
    outlineWidth: 3,
    shadowDepth: 2,
    maxCharsPerLine: 38,
    marginBottom: 45,
  },
  onLog
);
```

### 4. Accessibility-Focused

For maximum readability:

```typescript
await addCinematicSubtitles(
  jobId,
  scenes,
  timeline,
  rawVideoS3Key,
  tmpDir,
  {
    fontSize: 20,           // Larger for readability
    outlineWidth: 3,        // Thicker outline for contrast
    shadowDepth: 2,         // Deeper shadow
    maxCharsPerLine: 40,
    maxLines: 2,
    fadeInDuration: 0.1,    // Quick appearance
    fadeOutDuration: 0.1,
  },
  onLog
);
```

## Color Customization

ASS format uses BGR color codes (not RGB!):

### Common Colors

```typescript
// White (default)
primaryColor: "&HFFFFFF"

// Yellow (anime-style)
primaryColor: "&H00FFFF"

// Cyan
primaryColor: "&HFFFF00"

// Light Blue
primaryColor: "&HFFAA00"

// Pink
primaryColor: "&HFF00FF"
```

### Outline Colors

```typescript
// Black (default, best contrast)
outlineColor: "&H000000"

// Dark Blue
outlineColor: "&H800000"

// Dark Red
outlineColor: "&H000080"
```

### Color Format

ASS colors use **BGR** (Blue-Green-Red) format with alpha:
- Format: `&HAABBGGRR`
- `AA` = Alpha (transparency)
- `BB` = Blue
- `GG` = Green
- `RR` = Red

Example:
- White: `&HFFFFFF` (full RGB)
- Black: `&H000000` (no RGB)
- Red: `&H0000FF` (full R, no GB)
- Blue: `&HFF0000` (full B, no GR)

## Font Options

### Safe Fonts (Available on Most Systems)

```typescript
fontName: "Arial"          // Clean, modern (default)
fontName: "Helvetica"      // Similar to Arial
fontName: "Impact"         // Bold, dramatic
fontName: "Verdana"        // Highly readable
fontName: "Tahoma"         // Compact, clean
fontName: "Trebuchet MS"   // Elegant, modern
```

### Anime-Style Fonts

If installed on the system:

```typescript
fontName: "Anime Ace"      // Classic anime style
fontName: "Komika"         // Comic/manga style
fontName: "Badaboom"       // Action-packed
```

## Positioning

The system uses ASS alignment codes:

```
7 8 9    (top-left, top-center, top-right)
4 5 6    (middle-left, middle-center, middle-right)
1 2 3    (bottom-left, bottom-center, bottom-right)
```

Current default: **2** (bottom-center)

To change positioning, modify the style definition in `cinematic-subtitles.ts`:

```typescript
// In generateASSSubtitles function, change Alignment value:
`Style: Cinematic,...,Alignment=2,...`  // Bottom-center (default)
`Style: Cinematic,...,Alignment=8,...`  // Top-center
`Style: Cinematic,...,Alignment=5,...`  // Middle-center
```

## Advanced: Per-Scene Customization

For different subtitle styles per scene (future enhancement):

```typescript
// Example: Dramatic scenes get larger subtitles
const options = scene.emotion === "intense" 
  ? { fontSize: 22, outlineWidth: 3 }
  : { fontSize: 18, outlineWidth: 2 };

await addCinematicSubtitles(jobId, scenes, timeline, rawVideoS3Key, tmpDir, options, onLog);
```

## Testing Your Customizations

1. **Generate a test video** with your custom settings
2. **Check readability:**
   - Can you read the text easily?
   - Is contrast sufficient?
   - Are lines too long/short?
3. **Check timing:**
   - Do phrases appear at natural breaks?
   - Is pacing comfortable?
   - Are fades smooth?
4. **Check visual safety:**
   - Are faces visible?
   - Is action unobstructed?
   - Do subtitles complement the video?

## Troubleshooting

### Subtitles Too Large
```typescript
{ fontSize: 16, maxCharsPerLine: 35 }
```

### Subtitles Too Small
```typescript
{ fontSize: 20, maxCharsPerLine: 45 }
```

### Text Hard to Read
```typescript
{ outlineWidth: 3, shadowDepth: 2 }
```

### Subtitles Appear Too Quickly
```typescript
{ fadeInDuration: 0.3, fadeOutDuration: 0.3 }
```

### Subtitles Too Close to Bottom
```typescript
{ marginBottom: 70 }
```

### Phrases Too Long
```typescript
{ maxCharsPerLine: 35, maxLines: 2 }
```

### Phrases Too Short
```typescript
{ maxCharsPerLine: 50, maxLines: 2 }
```

## Best Practices

### ✅ Do
- Keep font size between 16-22px
- Use high-contrast colors (white text, black outline)
- Keep phrases under 42 characters per line
- Use smooth fade transitions (0.2-0.3s)
- Maintain bottom safe zone (50-70px margin)

### ❌ Don't
- Use font sizes over 24px (too large)
- Use low-contrast colors (hard to read)
- Display more than 2 lines at once
- Use instant appearance (no fade)
- Position subtitles over faces/action

## Integration in Worker

The subtitle system is integrated in Stage 5 of the worker:

```typescript
// In lib/worker.ts, Stage 5
const finalVideoS3Key = await addCinematicSubtitles(
  jobId,
  cinematicScript.scenes,
  timeline,
  rawVideoS3Key,
  tmpDir,
  {
    fontSize: 18,
    maxCharsPerLine: 42,
    maxLines: 2,
    fadeInDuration: 0.2,
    fadeOutDuration: 0.2,
  },
  (log) => publishProgress(jobId, { stage: 5, name: STAGE_NAMES[4], status: "active", log })
);
```

To customize globally, modify these default values in the worker.

## Future Enhancements

### Planned Features
- **Word-level timing** from TTS for karaoke-style highlighting
- **Adaptive positioning** to avoid covering faces/action
- **Subtitle themes** (anime, documentary, trailer, tutorial)
- **Animation presets** (typewriter, slide, zoom, glow)
- **Per-scene styling** based on emotion/intensity
- **Multi-language support** with font fallbacks

### Experimental Features
- **Dynamic font sizing** based on phrase length
- **Emotion-based colors** (red for intense, blue for calm)
- **3D subtitle effects** for dramatic moments
- **Subtitle sound effects** for emphasis

## Conclusion

The cinematic subtitle system provides professional, customizable captions that enhance your videos without dominating the screen. Experiment with different settings to find the perfect style for your content!
