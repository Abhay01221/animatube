# FFmpeg Assembly Debugging Guide

## Issue: Filter Reinitialization Error

**Error Message:**
```
ffmpeg exited with code 1: Error reinitializing filters!
Failed to inject frame into filter network
```

## Root Cause

This error occurs when FFmpeg receives video frames with **inconsistent properties** during filter processing:
- Mismatched resolutions
- Different aspect ratios
- Varying frame rates
- Inconsistent pixel formats
- Mixed SAR/DAR values

## Fixes Applied

### 1. ✅ Normalized All Visual Inputs

**Before:** Visuals had varying dimensions and properties  
**After:** All visuals forced to exact specifications:

```
Resolution: 1920x1080
FPS: 30
Pixel Format: yuv420p
Aspect Ratio: 16:9
SAR: 1:1
DAR: 16:9
```

### 2. ✅ Added Explicit Dimension Forcing

**Motion Effects (Images):**
```typescript
filters.push("scale=1920:1080:force_original_aspect_ratio=decrease");
filters.push("pad=1920:1080:(ow-iw)/2:(oh-ih)/2:black");
filters.push("setsar=1");
filters.push("setdar=16/9");

outputOptions([
  "-r", "30",              // Force 30 fps
  "-pix_fmt", "yuv420p",   // Force pixel format
  "-s", "1920x1080",       // Force output size
  "-aspect", "16:9",       // Force aspect ratio
])
```

**Motion Effects (Clips):**
```typescript
filters.push("scale=1920:1080:force_original_aspect_ratio=decrease");
filters.push("pad=1920:1080:(ow-iw)/2:(oh-ih)/2:black");
filters.push("setsar=1");
filters.push("setdar=16/9");

outputOptions([
  "-r", "30",
  "-pix_fmt", "yuv420p",
  "-s", "1920x1080",
  "-aspect", "16:9",
])
```

**Concatenation:**
```typescript
outputOptions([
  "-r", "30",
  "-pix_fmt", "yuv420p",
  "-s", "1920x1080",
  "-aspect", "16:9",
])
```

### 3. ✅ Simplified Filter Chains

**Before:** Complex filters with potential conflicts:
- Multiple blur filters
- Chromatic aberration splits
- Complex overlay operations
- Glow effects with multiple passes

**After:** Simplified, stable filters:
- Basic zoom/pan only
- Single vignette filter
- No complex splits or overlays
- Reduced intensity values

### 4. ✅ Added Comprehensive Logging

**FFmpeg Command Logging:**
```typescript
.on("start", (cmd) => {
  console.log(`[Motion Effects] FFmpeg command: ${cmd}`);
})
```

**Error Logging:**
```typescript
.on("error", (err, stdout, stderr) => {
  console.error(`[Motion Effects] FFmpeg error: ${err.message}`);
  console.error(`[Motion Effects] FFmpeg stderr: ${stderr}`);
  reject(err);
})
```

**Progress Logging:**
```typescript
.on("progress", (progress) => {
  if (progress.percent) {
    console.log(`[Assembly] Progress: ${progress.percent.toFixed(1)}%`);
  }
})
```

### 5. ✅ Added File Verification

**After Each Processing Step:**
```typescript
// Verify output file exists
if (!fs.existsSync(outPath)) {
  throw new Error(`Processed file not created: ${outPath}`);
}

// Verify file has content
const stats = fs.statSync(outPath);
if (stats.size === 0) {
  throw new Error(`Processed file is empty: ${outPath}`);
}

console.log(`Scene processed: ${(stats.size / 1024 / 1024).toFixed(2)} MB`);
```

---

## Debugging Steps

### 1. Check Worker Logs

Look for these log messages:
```
[Assembly] Scene 1: image, duration: 10s
[Assembly] Input: /tmp/animatube-xxx/image_0.png
[Assembly] Output: /tmp/animatube-xxx/cinematic_0.mp4
[Motion Effects] Image filter: scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2:black,setsar=1,setdar=16/9,zoompan=...
[Motion Effects] FFmpeg command: ffmpeg -loop 1 -framerate 30 -i /tmp/...
[Motion Effects] Image processed: /tmp/animatube-xxx/cinematic_0.mp4
[Assembly] Scene 1 processed successfully: 2.45 MB
```

### 2. Verify Processed Files

Check that all processed files have consistent properties:
```bash
ffprobe -v error -select_streams v:0 -show_entries stream=width,height,r_frame_rate,pix_fmt,sample_aspect_ratio,display_aspect_ratio cinematic_0.mp4
```

Expected output:
```
width=1920
height=1080
r_frame_rate=30/1
pix_fmt=yuv420p
sample_aspect_ratio=1:1
display_aspect_ratio=16:9
```

### 3. Check Concat List

Verify concat.txt contains all processed files:
```
file '/tmp/animatube-xxx/cinematic_0.mp4'
file '/tmp/animatube-xxx/cinematic_1.mp4'
file '/tmp/animatube-xxx/cinematic_2.mp4'
...
```

### 4. Test Concatenation Manually

If concatenation fails, test manually:
```bash
ffmpeg -f concat -safe 0 -i concat.txt -c:v libx264 -preset medium -crf 20 -pix_fmt yuv420p -r 30 -s 1920x1080 -aspect 16:9 test_output.mp4
```

### 5. Check FFmpeg Stderr

Full stderr output is now logged. Look for:
- `Error reinitializing filters` - Dimension mismatch
- `Invalid data found` - Corrupted input
- `Conversion failed` - Incompatible formats
- `No such filter` - Invalid filter name

---

## Common Issues & Solutions

### Issue: "Error reinitializing filters"
**Cause:** Inconsistent video dimensions between clips  
**Solution:** All clips now forced to 1920x1080 with padding

### Issue: "Failed to inject frame"
**Cause:** Mismatched frame rates or pixel formats  
**Solution:** All clips forced to 30fps yuv420p

### Issue: "Invalid aspect ratio"
**Cause:** Mixed portrait/landscape videos  
**Solution:** All clips padded to 16:9 with black bars

### Issue: "Filter graph too complex"
**Cause:** Too many filters in chain  
**Solution:** Simplified to basic zoom/pan + vignette only

### Issue: Empty output file
**Cause:** FFmpeg failed silently  
**Solution:** Added file size verification after each step

---

## Testing Checklist

After fixes, verify:

- [ ] All processed clips are exactly 1920x1080
- [ ] All clips have 30 fps
- [ ] All clips use yuv420p pixel format
- [ ] All clips have 16:9 aspect ratio
- [ ] Concat list contains all files
- [ ] Concatenation completes without errors
- [ ] Audio mixing completes without errors
- [ ] Final video plays correctly
- [ ] Video duration matches expected length

---

## Performance Notes

**Processing Time per Scene:**
- Image → Video: ~10-15 seconds
- Video clip processing: ~5-10 seconds
- Concatenation: ~5-10 seconds
- Audio mixing: ~3-5 seconds

**Total for 15-scene video:** ~4-6 minutes

---

## Rollback Plan

If issues persist, the original assembly stage is still available:
- `lib/stages/assemble.ts` - Original assembler
- `lib/stages/visuals.ts` - Original visual fetcher

To use original pipeline, modify worker.ts to import from original stages.

---

## Additional Resources

- FFmpeg Filter Documentation: https://ffmpeg.org/ffmpeg-filters.html
- Concat Demuxer: https://trac.ffmpeg.org/wiki/Concatenate
- Scaling Guide: https://trac.ffmpeg.org/wiki/Scaling
- Aspect Ratio: https://trac.ffmpeg.org/wiki/Scaling#KeepingtheAspectRatio

---

**Last Updated:** After fixing filter reinitialization errors  
**Status:** ✅ All normalization fixes applied
