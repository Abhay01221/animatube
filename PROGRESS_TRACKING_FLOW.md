# Live Progress Tracking - Complete Flow Diagram

## System Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                         USER BROWSER                                 │
├─────────────────────────────────────────────────────────────────────┤
│                                                                       │
│  ┌────────────────────────────────────────────────────────────┐    │
│  │  Progress Page (/generate/[jobId])                          │    │
│  │  ┌──────────────────────────────────────────────────────┐  │    │
│  │  │  ProgressSSE Component                                │  │    │
│  │  │  • Connects to SSE endpoint                          │  │    │
│  │  │  • Manages state updates                             │  │    │
│  │  │  • Handles completion/errors                         │  │    │
│  │  └──────────────────────────────────────────────────────┘  │    │
│  │  ┌──────────────────────────────────────────────────────┐  │    │
│  │  │  StageTracker Component                              │  │    │
│  │  │  ┌────────────────────────────────────────────────┐  │  │    │
│  │  │  │ Stage 1: 📝 Writing script         [Active]   │  │  │    │
│  │  │  │ "Phase 1: Planning story structure..."        │  │  │    │
│  │  │  ├────────────────────────────────────────────────┤  │  │    │
│  │  │  │ Stage 2: 🎤 Generating voiceover   [Pending]  │  │  │    │
│  │  │  ├────────────────────────────────────────────────┤  │  │    │
│  │  │  │ Stage 3: 🎬 Fetching visuals       [Pending]  │  │  │    │
│  │  │  ├────────────────────────────────────────────────┤  │  │    │
│  │  │  │ Stage 4: ✂️ Assembling video       [Pending]  │  │  │    │
│  │  │  ├────────────────────────────────────────────────┤  │  │    │
│  │  │  │ Stage 5: 📝 Adding subtitles       [Pending]  │  │  │    │
│  │  │  ├────────────────────────────────────────────────┤  │  │    │
│  │  │  │ Stage 6: ⬆️ Uploading to YouTube   [Pending]  │  │  │    │
│  │  │  └────────────────────────────────────────────────┘  │  │    │
│  │  └──────────────────────────────────────────────────────┘  │    │
│  └────────────────────────────────────────────────────────────┘    │
│                                                                       │
└───────────────────────────┬───────────────────────────────────────┘
                            │
                            │ SSE Connection
                            │ GET /api/jobs/[jobId]/sse
                            │
┌───────────────────────────▼───────────────────────────────────────┐
│                      NEXT.JS SERVER                                 │
├─────────────────────────────────────────────────────────────────────┤
│                                                                       │
│  ┌────────────────────────────────────────────────────────────┐    │
│  │  SSE Endpoint (/api/jobs/[jobId]/sse/route.ts)             │    │
│  │                                                              │    │
│  │  1. Verify user owns job                                    │    │
│  │  2. Replay existing progress from Redis                     │    │
│  │  3. Subscribe to Redis pub/sub channel                      │    │
│  │  4. Stream updates to client                                │    │
│  │  5. Send heartbeat every 15s                                │    │
│  │  6. Close on completion/error                               │    │
│  └────────────────────────────────────────────────────────────┘    │
│                                                                       │
└───────────────────────────┬───────────────────────────────────────┘
                            │
                            │ Redis Pub/Sub
                            │ Subscribe: progress-channel:[jobId]
                            │
┌───────────────────────────▼───────────────────────────────────────┐
│                         REDIS                                       │
├─────────────────────────────────────────────────────────────────────┤
│                                                                       │
│  ┌────────────────────────────────────────────────────────────┐    │
│  │  Progress List: progress:[jobId]                            │    │
│  │  [                                                           │    │
│  │    {"stage":1,"name":"Writing script","status":"active"},   │    │
│  │    {"stage":1,"name":"Writing script","status":"done"},     │    │
│  │    {"stage":2,"name":"Generating voiceover","status":"active"}│  │
│  │  ]                                                           │    │
│  │  TTL: 24 hours                                               │    │
│  └────────────────────────────────────────────────────────────┘    │
│                                                                       │
│  ┌────────────────────────────────────────────────────────────┐    │
│  │  Pub/Sub Channel: progress-channel:[jobId]                  │    │
│  │  • Real-time message broadcasting                           │    │
│  │  • Multiple subscribers supported                           │    │
│  └────────────────────────────────────────────────────────────┘    │
│                                                                       │
└───────────────────────────▲───────────────────────────────────────┘
                            │
                            │ Publish Updates
                            │ RPUSH + PUBLISH
                            │
┌───────────────────────────┴───────────────────────────────────────┐
│                      BULLMQ WORKER                                  │
├─────────────────────────────────────────────────────────────────────┤
│                                                                       │
│  ┌────────────────────────────────────────────────────────────┐    │
│  │  Worker Process (lib/worker.ts)                             │    │
│  │                                                              │    │
│  │  ┌──────────────────────────────────────────────────────┐  │    │
│  │  │ Stage 1: Cinematic Script Generation                 │  │    │
│  │  │ • publishProgress("Planning story structure...")     │  │    │
│  │  │ • publishProgress("Writing scene-by-scene...")       │  │    │
│  │  │ • stageDone(1)                                       │  │    │
│  │  └──────────────────────────────────────────────────────┘  │    │
│  │                                                              │    │
│  │  ┌──────────────────────────────────────────────────────┐  │    │
│  │  │ Stage 2: Voiceover Generation                        │  │    │
│  │  │ • publishProgress("Generating voiceover...")         │  │    │
│  │  │ • stageDone(2)                                       │  │    │
│  │  └──────────────────────────────────────────────────────┘  │    │
│  │                                                              │    │
│  │  ┌──────────────────────────────────────────────────────┐  │    │
│  │  │ Stage 3: Cinematic Visual Fetching                   │  │    │
│  │  │ • publishProgress("Scene 1: Fetching visuals...")    │  │    │
│  │  │ • publishProgress("Scene 2: Fetching visuals...")    │  │    │
│  │  │ • stageDone(3)                                       │  │    │
│  │  └──────────────────────────────────────────────────────┘  │    │
│  │                                                              │    │
│  │  ┌──────────────────────────────────────────────────────┐  │    │
│  │  │ Stage 4: Cinematic Assembly                          │  │    │
│  │  │ • publishProgress("Processing scene 1/15...")        │  │    │
│  │  │ • publishProgress("Concatenating scenes...")         │  │    │
│  │  │ • publishProgress("Mixing voiceover...")             │  │    │
│  │  │ • stageDone(4)                                       │  │    │
│  │  └──────────────────────────────────────────────────────┘  │    │
│  │                                                              │    │
│  │  ┌──────────────────────────────────────────────────────┐  │    │
│  │  │ Stage 5: Subtitle Burn-in                            │  │    │
│  │  │ • publishProgress("Burning subtitles...")            │  │    │
│  │  │ • stageDone(5)                                       │  │    │
│  │  └──────────────────────────────────────────────────────┘  │    │
│  │                                                              │    │
│  │  ┌──────────────────────────────────────────────────────┐  │    │
│  │  │ Stage 6: YouTube Upload                              │  │    │
│  │  │ • publishProgress("Uploading to YouTube...")         │  │    │
│  │  │ • stageDone(6)                                       │  │    │
│  │  │ • publishProgress({name:"complete", log: youtubeUrl})│  │    │
│  │  └──────────────────────────────────────────────────────┘  │    │
│  │                                                              │    │
│  └────────────────────────────────────────────────────────────┘    │
│                                                                       │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Message Flow Timeline

```
Time    Worker                          Redis                    SSE Endpoint              Browser
────────────────────────────────────────────────────────────────────────────────────────────────────
0:00    Job starts                      
        
0:01    stageActive(1, "Planning...")   RPUSH progress:job_123   
                                        PUBLISH channel          → Streams to client    → UI updates
                                                                                           Stage 1: Active
                                                                                           "Planning..."

0:15    publishProgress("Writing...")    RPUSH progress:job_123
                                        PUBLISH channel          → Streams to client    → UI updates
                                                                                           "Writing..."

0:30    stageDone(1)                    RPUSH progress:job_123
                                        PUBLISH channel          → Streams to client    → UI updates
                                                                                           Stage 1: Done ✓

0:31    stageActive(2, "Generating...")  RPUSH progress:job_123
                                        PUBLISH channel          → Streams to client    → UI updates
                                                                                           Stage 2: Active
                                                                                           "Generating..."

1:00    stageDone(2)                    RPUSH progress:job_123
                                        PUBLISH channel          → Streams to client    → UI updates
                                                                                           Stage 2: Done ✓

1:01    stageActive(3, "Fetching...")   RPUSH progress:job_123
                                        PUBLISH channel          → Streams to client    → UI updates
                                                                                           Stage 3: Active

1:05    publishProgress("Scene 1...")    RPUSH progress:job_123
                                        PUBLISH channel          → Streams to client    → UI updates
                                                                                           "Scene 1..."

1:10    publishProgress("Scene 2...")    RPUSH progress:job_123
                                        PUBLISH channel          → Streams to client    → UI updates
                                                                                           "Scene 2..."

2:00    stageDone(3)                    RPUSH progress:job_123
                                        PUBLISH channel          → Streams to client    → UI updates
                                                                                           Stage 3: Done ✓

2:01    stageActive(4, "Assembling...")  RPUSH progress:job_123
                                        PUBLISH channel          → Streams to client    → UI updates
                                                                                           Stage 4: Active

2:10    publishProgress("Scene 1/15...")RPUSH progress:job_123
                                        PUBLISH channel          → Streams to client    → UI updates
                                                                                           "Scene 1/15..."

3:00    publishProgress("Concatenating")RPUSH progress:job_123
                                        PUBLISH channel          → Streams to client    → UI updates
                                                                                           "Concatenating"

3:30    stageDone(4)                    RPUSH progress:job_123
                                        PUBLISH channel          → Streams to client    → UI updates
                                                                                           Stage 4: Done ✓

3:31    stageActive(5, "Subtitles...")  RPUSH progress:job_123
                                        PUBLISH channel          → Streams to client    → UI updates
                                                                                           Stage 5: Active

4:00    stageDone(5)                    RPUSH progress:job_123
                                        PUBLISH channel          → Streams to client    → UI updates
                                                                                           Stage 5: Done ✓

4:01    stageActive(6, "Uploading...")  RPUSH progress:job_123
                                        PUBLISH channel          → Streams to client    → UI updates
                                                                                           Stage 6: Active

4:30    stageDone(6)                    RPUSH progress:job_123
                                        PUBLISH channel          → Streams to client    → UI updates
                                                                                           Stage 6: Done ✓

4:31    publishProgress({               RPUSH progress:job_123
          name: "complete",             PUBLISH channel          → Streams to client    → UI updates
          log: youtubeUrl                                                                  🎉 Confetti!
        })                                                       → Closes connection       YouTube link
                                                                                           Download button
```

---

## Refresh/Reconnect Flow

```
User refreshes page mid-generation (e.g., at Stage 3)
│
├─ Browser: New page load
│  └─ ProgressSSE component mounts
│     └─ Calls fetchInitialState()
│        └─ GET /api/jobs/[jobId]
│           └─ Returns: { stages: [...], status: "processing" }
│              └─ UI shows: Stage 1 ✓, Stage 2 ✓, Stage 3 Active
│
├─ Browser: Connects to SSE
│  └─ GET /api/jobs/[jobId]/sse
│     └─ SSE Endpoint:
│        ├─ Replays all progress from Redis
│        │  └─ LRANGE progress:job_123 0 -1
│        │     └─ Sends all historical updates
│        │        └─ Browser: Updates UI (no duplicates due to deduplication)
│        │
│        └─ Subscribes to Redis pub/sub
│           └─ SUBSCRIBE progress-channel:job_123
│              └─ Streams new updates as they arrive
│                 └─ Browser: Continues showing live progress
│
└─ Result: Seamless continuation from current stage
```

---

## Error Handling Flow

```
Worker encounters error (e.g., FFmpeg fails at Stage 4)
│
├─ Worker: Catches error
│  └─ stageError(4, "FFmpeg error: ...")
│     └─ publishProgress({
│          stage: 4,
│          name: "Assembling video",
│          status: "error",
│          log: "FFmpeg error: ..."
│        })
│        └─ Redis: RPUSH + PUBLISH
│           └─ SSE: Streams to client
│              └─ Browser: UI updates
│                 ├─ Stage 4 turns red
│                 ├─ Error message shown
│                 ├─ "Video generation failed" card appears
│                 └─ "Try again" button shown
│
└─ Worker: Updates database
   └─ prisma.video.update({ status: "failed", errorMessage: "..." })
```

---

## Summary

✅ **Complete real-time tracking from worker to browser**  
✅ **Redis pub/sub for instant updates**  
✅ **SSE streaming with fallback polling**  
✅ **Progress persistence across refreshes**  
✅ **Error visibility at every stage**  
✅ **Smooth animations and transitions**  
✅ **Fully integrated with cinematic pipeline**  

**The live progress tracking system is production-ready!** 🎬✨
