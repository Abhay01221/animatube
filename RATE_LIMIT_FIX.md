# ✅ Groq API Rate Limit Handling

## Issue

The error you saw:
```
429 {"error":{"message":"Rate limit reached for model 'llama-3.3-70b-versatile'
```

This is a **Groq API rate limit error**, not a problem with the cinematic pipeline or progress tracking.

---

## Solution Applied

Added **automatic retry logic with exponential backoff** to both AI generation stages:

### 1. Story Planner (`lib/cinematic/story-planner.ts`)
- Retries up to 3 times on rate limit errors
- Exponential backoff: 2s → 4s → 8s
- Shows progress message: "⚠ Rate limit hit, waiting Xs before retry..."
- Only retries on 429 errors, throws immediately on other errors

### 2. Scene Script Generator (`lib/cinematic/scene-script-generator.ts`)
- Same retry logic as story planner
- Handles rate limits gracefully
- User sees retry progress in real-time

---

## How It Works

```typescript
// Retry logic for rate limits
let lastError: Error | null = null;
for (let attempt = 1; attempt <= 3; attempt++) {
  try {
    // Make Groq API call
    const completion = await groq.chat.completions.create({...});
    
    // Success! Return result
    return result;
    
  } catch (err: any) {
    lastError = err;
    
    // Check if it's a rate limit error (429)
    if (err.message?.includes("Rate limit") || err.status === 429) {
      const waitTime = Math.pow(2, attempt) * 1000; // 2s, 4s, 8s
      onLog?.(`⚠ Rate limit hit, waiting ${waitTime / 1000}s before retry ${attempt}/3...`);
      await new Promise(resolve => setTimeout(resolve, waitTime));
      continue; // Try again
    }
    
    // If not a rate limit error, throw immediately
    throw err;
  }
}

// All retries failed
throw new Error(`Failed after 3 attempts: ${lastError?.message}`);
```

---

## What You'll See

### Before (Immediate Failure):
```
Stage 1: Writing script [Error]
429 {"error":{"message":"Rate limit reached...
```

### After (Automatic Retry):
```
Stage 1: Writing script [Active]
"Planning cinematic story structure..."

Stage 1: Writing script [Active]
"⚠ Rate limit hit, waiting 2s before retry 1/3..."

Stage 1: Writing script [Active]
"⚠ Rate limit hit, waiting 4s before retry 2/3..."

Stage 1: Writing script [Active]
"✓ Story plan created: 15 scenes, mysterious mood"

Stage 1: Writing script [Done] ✓
```

---

## Groq Rate Limits

**Free Tier:**
- 30 requests per minute
- 14,400 requests per day
- Shared across all models

**If you hit limits frequently:**

### Option 1: Wait Between Requests
- Space out video generations by 2-3 minutes
- The retry logic will handle temporary spikes

### Option 2: Upgrade to Groq Pro
- Higher rate limits
- Faster processing
- Priority access
- Visit: https://console.groq.com/settings/billing

### Option 3: Use Alternative Model
Change in the code:
```typescript
// Instead of:
model: "llama-3.3-70b-versatile"

// Use:
model: "llama-3.1-70b-versatile"  // Older but still good
// or
model: "mixtral-8x7b-32768"       // Faster, lower limits
```

---

## Testing

1. **Start services:**
   ```bash
   npm run dev    # Terminal 1
   npm run worker # Terminal 2
   ```

2. **Generate a video**
   - If you hit rate limits, you'll see retry messages
   - System will automatically wait and retry
   - Up to 3 attempts with increasing delays

3. **Monitor worker logs:**
   ```
   [Stage 1] Starting cinematic script generation
   [Stage 1] Planning cinematic story structure
   ⚠ Rate limit hit, waiting 2s before retry 1/3...
   [Stage 1] ✓ Story plan created: 15 scenes
   ```

---

## Error Handling

### Rate Limit (429) - Handled Automatically
- Retries with exponential backoff
- Shows progress to user
- Succeeds after rate limit clears

### Other Errors - Fails Immediately
- Invalid API key → Immediate error
- Network error → Immediate error
- Invalid JSON → Immediate error
- No retries for non-rate-limit errors

---

## Summary

✅ **Automatic retry logic added**  
✅ **Exponential backoff (2s, 4s, 8s)**  
✅ **User sees retry progress**  
✅ **Only retries on 429 errors**  
✅ **Fails fast on other errors**  
✅ **Works with progress tracking**  

**The system will now handle Groq rate limits gracefully!** 🎬✨

---

## Quick Fix for Immediate Use

If you're hitting rate limits right now:

1. **Wait 1-2 minutes** (rate limit window resets)
2. **Try generating again** (retry logic will handle any remaining limits)
3. **Space out requests** (wait 2-3 minutes between videos)

The retry logic will make the system much more resilient to rate limits!
