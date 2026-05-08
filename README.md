# Animatube — AI-Powered Video Factory

Turn any idea into a published YouTube video automatically.

**Pipeline:** Prompt → Groq Script → Edge TTS Voiceover → Pexels/Canvas Visuals → FFmpeg Assembly → Subtitles → YouTube Upload

---

## Prerequisites

- Node.js 18+
- PostgreSQL database (Supabase or Railway recommended)
- Redis (local or Upstash)
- FFmpeg (bundled via `@ffmpeg-installer/ffmpeg`)

## Setup

### 1. Clone and install

```bash
cd animatube
npm install
```

### 2. Configure environment variables

Copy `.env` and fill in all values:

```bash
cp .env .env.local
```

Required variables:

| Variable | Description |
|---|---|
| `NEXTAUTH_SECRET` | Random secret (run `openssl rand -hex 32`) |
| `GOOGLE_CLIENT_ID` | Google OAuth client ID |
| `GOOGLE_CLIENT_SECRET` | Google OAuth client secret |
| `GROQ_API_KEY` | Groq API key (free tier) |
| `PEXELS_API_KEY` | Pexels API key (free tier) |
| `AWS_ACCESS_KEY_ID` | AWS access key |
| `AWS_SECRET_ACCESS_KEY` | AWS secret key |
| `AWS_S3_BUCKET` | S3 bucket name |
| `AWS_REGION` | S3 region (e.g. `us-east-1`) |
| `REDIS_URL` | Redis connection URL |
| `DATABASE_URL` | PostgreSQL connection string |
| `ENCRYPTION_KEY` | 64-char hex string for AES-256 encryption |

Generate an encryption key:
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

### 3. Google OAuth Setup

1. Go to [Google Cloud Console](https://console.cloud.google.com)
2. Create a new project → Enable **YouTube Data API v3** and **Google+ API**
3. Create OAuth 2.0 credentials (Web application)
4. Add authorized redirect URI: `http://localhost:3000/api/auth/callback/google`
5. Request scopes: `openid`, `email`, `profile`, `youtube.upload`, `youtube`

### 4. Database setup

```bash
npm run db:push    # Push schema to database
npm run db:studio  # Optional: open Prisma Studio
```

### 5. Run the app

You need **two terminal windows**:

**Terminal 1 — Next.js dev server:**
```bash
npm run dev
```

**Terminal 2 — BullMQ worker:**
```bash
npm run worker
```

Open [http://localhost:3000](http://localhost:3000)

---

## Architecture

```
Browser → Next.js API → BullMQ Queue → Worker Process
                                           ↓
                                    Stage 1: Groq Script
                                    Stage 2: Edge TTS
                                    Stage 3: Pexels/Canvas
                                    Stage 4: FFmpeg Assembly
                                    Stage 5: Subtitle Burn-in
                                    Stage 6: YouTube Upload
                                           ↓
                                    SSE → Browser Progress
```

## Pages

| Route | Description |
|---|---|
| `/` | Home — prompt input + advanced options |
| `/generate/[jobId]` | Real-time progress tracker |
| `/dashboard` | Video history grid |
| `/settings` | YouTube connection + preferences |

## API Routes

| Method | Route | Description |
|---|---|---|
| POST | `/api/generate` | Create video job |
| GET | `/api/jobs/[jobId]/sse` | SSE progress stream |
| GET | `/api/jobs/[jobId]` | Poll job status |
| GET | `/api/dashboard` | Video history |
| POST | `/api/reupload/[id]` | Re-upload to YouTube |
| GET | `/api/download/[id]` | S3 presigned download URL |
| POST | `/api/settings` | Save preferences |

## Security

- OAuth tokens stored AES-256-GCM encrypted in PostgreSQL
- API keys only in environment variables, never sent to browser
- Rate limited: 5 videos/hour per user
- FFmpeg runs in isolated temp directories, cleaned up after each job
- S3 intermediate assets expire in 7 days; final MP4s are permanent

## Testing Each Stage

```bash
# Test script generation
curl -X POST http://localhost:3000/api/generate \
  -H "Content-Type: application/json" \
  -d '{"prompt":"How neural networks work","style":"educational","duration":"short","voice":"ai_narrator","language":"english","visibility":"private"}'

# Returns: {"jobId":"job_..."}

# Watch progress
curl -N http://localhost:3000/api/jobs/job_.../sse
```
