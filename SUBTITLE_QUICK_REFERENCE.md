# Cinematic Subtitle System - Quick Reference

## 🎬 What Changed

**Old:** Full paragraphs, large text, static display, SRT format  
**New:** Phrase-by-phrase, small text, fade animations, ASS format

## 📁 Files

| File | Purpose |
|------|---------|
| `lib/stages/cinematic-subtitles.ts` | New subtitle system implementation |
| `lib/worker.ts` | Updated to use cinematic subtitles (Stage 5) |
| `CINEMATIC_SUBTITLES.md` | Complete technical documentation |
| `SUBTITLE_CUSTOMIZATION_GUIDE.md` | User customization guide |
| `SUBTITLE_SYSTEM_UPGRADE.md` | Implementation summary |

## 🚀 Quick Start

### Default Usage (Already Integrated)
```typescript
// In lib/worker.ts, Stage 5
const finalVideoS3Key = await addCinematicSubtitles(
  jobId,
  cinematicScript.scenes,
  timeline,
  rawVideoS3Key,
  tmpDir,
  { fontSize: 18, maxCharsPerLine: 42 },
  onLog
);
```

### Custom Styling
```typescript
await addCinematicSubtitles(
  jobId,
  scenes,
  timeline,
  rawVideoS3Key,
  tmpDir,
  {
    fontSize: 20,           // Larger text
    maxCharsPerLine: 35,    // Shorter lines
    fadeInDuration: 0.3,    // Slower fade
    marginBottom: 60,       // More bottom space
  },
  onLog
);
```

## ⚙️ Configuration Options

| Option | Default | Description |
|--------|---------|-------------|
| `fontSize` | 18 | Font size in pixels |
| `fontName` | "Arial" | Font family |
| `primaryColor` | "&HFFFFFF" | Text color (white) |
| `outlineColor` | "&H000000" | Outline color (black) |
| `outlineWidth` | 2 | Outline thickness |
| `shadowDepth` | 1 | Shadow depth |
| `marginBottom` | 50 | Distance from bottom (px) |
| `fadeInDuration` | 0.2 | Fade in time (seconds) |
| `fadeOutDuration` | 0.2 | Fade out time (seconds) |
| `maxCharsPerLine` | 42 | Max characters per line |
| `maxLines` | 2 | Max lines visible at once |

## 🎨 Common Presets

### Minimalist Documentary
```typescript
{ fontSize: 16, maxCharsPerLine: 35, marginBottom: 60 }
```

### Bold Trailer
```typescript
{ fontSize: 22, outlineWidth: 3, shadowDepth: 2, maxCharsPerLine: 30 }
```

### Anime Recap
```typescript
{ fontSize: 20, fontName: "Impact", outlineWidth: 3, shadowDepth: 2 }
```

### Accessibility
```typescript
{ fontSize: 20, outlineWidth: 3, shadowDepth: 2, maxCharsPerLine: 40 }
```

## 🎯 Key Features

✅ **Phrase Segmentation** - Splits at natural breaks (sentences, clauses, words)  
✅ **Even Timing** - Distributes phrases evenly across scene duration  
✅ **ASS Format** - Advanced styling with shadows, outlines, fades  
✅ **Fade Animations** - Smooth 200ms fade in/out transitions  
✅ **Visual Safety** - Bottom-center, 50px margin, max 2 lines  
✅ **Configurable** - All options customizable  

## 📊 Comparison

| Aspect | Old System | New System |
|--------|-----------|------------|
| Format | SRT | ASS |
| Display | Full paragraphs | Phrase-by-phrase |
| Font Size | 22px | 18px |
| Lines | Unlimited | Max 2 |
| Animation | None | Fade in/out |
| Styling | Basic | Advanced |
| Feel | PowerPoint | Cinematic |

## 🔧 Troubleshooting

| Problem | Solution |
|---------|----------|
| Text too large | `{ fontSize: 16 }` |
| Text too small | `{ fontSize: 20 }` |
| Hard to read | `{ outlineWidth: 3, shadowDepth: 2 }` |
| Too fast | `{ fadeInDuration: 0.3, fadeOutDuration: 0.3 }` |
| Too close to bottom | `{ marginBottom: 70 }` |
| Phrases too long | `{ maxCharsPerLine: 35 }` |
| Phrases too short | `{ maxCharsPerLine: 50 }` |

## 🎬 Example Output

### Input
```
Scene narration: "In a world shrouded in darkness, where hope seems lost and despair reigns supreme, a hero emerges to challenge the forces of evil."
Duration: 10 seconds
```

### Output (3 phrases)
```
0.0s - 3.3s: "In a world shrouded in darkness,"
3.3s - 6.7s: "where hope seems lost\nand despair reigns supreme,"
6.7s - 10.0s: "a hero emerges to challenge\nthe forces of evil."
```

Each phrase fades in (200ms), displays, then fades out (200ms).

## 📚 Documentation

- **Technical Details:** `CINEMATIC_SUBTITLES.md`
- **Customization Guide:** `SUBTITLE_CUSTOMIZATION_GUIDE.md`
- **Implementation Summary:** `SUBTITLE_SYSTEM_UPGRADE.md`
- **Source Code:** `lib/stages/cinematic-subtitles.ts`

## ✅ Testing Checklist

- [ ] Phrases are 1-2 lines max
- [ ] Font size appropriate
- [ ] Bottom-center positioned
- [ ] Smooth fade animations
- [ ] Synced with voiceover
- [ ] Faces/action visible
- [ ] Good contrast/readability
- [ ] Professional feel

## 🚀 Next Steps

1. **Test** - Generate a video with new system
2. **Review** - Check subtitle appearance and timing
3. **Customize** - Adjust settings if needed
4. **Iterate** - Fine-tune based on feedback

## 💡 Pro Tips

- Keep `maxCharsPerLine` between 35-45 for best readability
- Use `fadeInDuration` of 0.2-0.3s for smooth transitions
- Maintain `marginBottom` of 50-70px for safe zone
- Test with different video styles to find optimal settings
- Use `outlineWidth: 3` for better contrast on bright backgrounds

## 🎯 Target Aesthetic

The system targets the subtitle style of:
- ✅ Anime recap videos
- ✅ Netflix captions
- ✅ Cinematic trailers
- ✅ YouTube documentary edits

**NOT:**
- ❌ PowerPoint text overlays
- ❌ Giant paragraph blocks
- ❌ Static screen text

---

**Status:** ✅ Complete and integrated  
**Version:** 1.0  
**Last Updated:** May 2026
