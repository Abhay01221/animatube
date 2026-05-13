# Animatube 🎬

**AI-Powered Cinematic Video Generation Platform**

Transform text prompts into professional, cinematic videos with AI-generated scripts, voiceovers, visuals, and subtitles. Automatically upload to YouTube or download for later use.

---

## 🚀 Features

- **🎭 Cinematic Storytelling**: AI-powered story planning with character development and scene composition
- **🎙️ Professional Voiceovers**: Natural-sounding narration with multiple voice options
- **🎨 Dynamic Visuals**: Automatic stock footage and image selection with cinematic motion effects
- **📝 Animated Subtitles**: Professional subtitle styling with smooth fade animations
- **📤 YouTube Integration**: Direct upload to YouTube with OAuth authentication
- **☁️ Cloud Storage**: Persistent video storage on AWS S3 with presigned URLs
- **📊 Real-time Progress**: Live progress tracking with Server-Sent Events (SSE)
- **🎯 Multiple Styles**: Educational, storytelling, motivational, documentary, and anime-style

---

## 🏗️ Architecture

```
Frontend (Next.js/Vercel)
    ↓
API Routes (Next.js)
    ↓
BullMQ Queue (Redis/Upstash)
    ↓
Worker Processes (Railway)
    ↓
FFmpeg Rendering Pipeline
    ↓
S3 Storage (AWS)
    ↓
Dashboard Playback/Download
```

**Key Components:**
- **Frontend**: Next.js 16, React 19, TailwindCSS, Framer Motion
- **Backend**: Next.js API Routes, NextAuth, Prisma ORM
- **Queue**: BullMQ with Redis (Upstash)
- **Workers**: Node.js workers with FFmpeg
- **Database**: PostgreSQL (Supabase)
- **Storage**: AWS S3 with presigned URLs
- **AI**: Groq (LLaMA), Pexels API, Edge TTS

---

## 📦 Tech Stack

### Frontend
- **Next.js 16**: React framework with App Router
- **React 19**: UI library
- **TailwindCSS 4**: Utility-first CSS
- **Framer Motion**: Animations
- **shadcn/ui**: Component library

### Backend
- **NextAuth v5**: Authentication with Google OAuth
- **Prisma 7**: Database ORM
- **BullMQ**: Job queue with Redis
- **FFmpeg**: Video processing
- **AWS SDK**: S3 storage

### AI & Media
- **Groq API**: LLaMA 3.3 for script generation
- **Pexels API**: Stock footage and images
- **Edge TTS**: Text-to-speech voiceovers

### Infrastructure
- **Vercel**: Frontend hosting
- **Railway**: Worker hosting with Docker
- **Supabase**: PostgreSQL database
- **Upstash**: Redis queue
- **AWS S3**: Video storage

---

## 🚀 Quick Start (Development)

### Prerequisites
- Node.js 20+
- FFmpeg installed
- PostgreSQL database
- Redis instance
- AWS S3 bucket
- Google OAuth credentials

### Installation

```bash
# Clone repository
git clone https://github.com/yourusername/animatube.git
cd animatube

# Install dependencies
npm install

# Configure environment variables
cp .env.example .env
# Edit .env with your credentials

# Setup database
npm run db:generate
npm run db:push

# Start development server
npm run dev

# Start worker (in separate terminal)
npm run worker
```

Visit `http://localhost:3000`

---

## 🌐 Production Deployment

### Quick Deploy

1. **Database**: Create Supabase project
2. **Redis**: Create Upstash Redis database
3. **S3**: Create AWS S3 bucket
4. **OAuth**: Configure Google OAuth credentials
5. **Frontend**: Deploy to Vercel
6. **Workers**: Deploy to Railway

### Detailed Guide

See **[DEPLOYMENT_GUIDE.md](./DEPLOYMENT_GUIDE.md)** for complete step-by-step instructions.

### Deployment Checklist

See **[PRODUCTION_CHECKLIST.md](./PRODUCTION_CHECKLIST.md)** for comprehensive checklist.

### Test Production Setup

```bash
npm run test:production
```

---

## 📖 Documentation

- **[DEPLOYMENT_GUIDE.md](./DEPLOYMENT_GUIDE.md)**: Complete production deployment guide
- **[PRODUCTION_CHECKLIST.md](./PRODUCTION_CHECKLIST.md)**: Pre-deployment checklist
- **[DEVELOPER_GUIDE.md](./DEVELOPER_GUIDE.md)**: Development guide
- **[CINEMATIC_ARCHITECTURE.md](./CINEMATIC_ARCHITECTURE.md)**: Cinematic system architecture
- **[SUBTITLE_SYSTEM_UPGRADE.md](./SUBTITLE_SYSTEM_UPGRADE.md)**: Subtitle system documentation

---

## 🎯 Usage

### 1. Login
- Sign in with Google OAuth
- Authorize YouTube access (optional)

### 2. Generate Video
- Enter a text prompt (e.g., "The history of ancient Rome")
- Select style (educational, storytelling, etc.)
- Choose duration (short: 30-60s, long: 60-120s)
- Select voice (male, female, AI narrator)
- Click "Generate Video"

### 3. Monitor Progress
- Real-time progress tracking
- 6 stages: Script → Voice → Visuals → Assembly → Subtitles → Upload
- Live logs and status updates

### 4. Download or Share
- Download MP4 file
- View on YouTube (if uploaded)
- Share with others

---

## 🔧 Configuration

### Environment Variables

See `.env.production.example` for all required variables:

```bash
# Core
DATABASE_URL=postgresql://...
REDIS_URL=rediss://...
NEXTAUTH_SECRET=...
NEXTAUTH_URL=https://your-domain.com

# OAuth
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...

# AI APIs
GROQ_API_KEY=...
PEXELS_API_KEY=...

# Storage
AWS_ACCESS_KEY_ID=...
AWS_SECRET_ACCESS_KEY=...
AWS_S3_BUCKET=...
AWS_REGION=...

# Security
ENCRYPTION_KEY=...
```

---

## 🎬 Video Generation Pipeline

### Stage 1: Script Generation
- AI-powered story planning
- Character development
- Scene composition
- Cinematic direction

### Stage 2: Voiceover
- Text-to-speech synthesis
- Natural-sounding narration
- Multiple voice options
- Uploaded to S3

### Stage 3: Visuals
- Stock footage search (Pexels)
- Image selection
- Visual matching to script
- Downloaded locally

### Stage 4: Assembly
- FFmpeg video processing
- Cinematic motion effects (zoom, pan, tilt)
- Transitions between scenes
- Audio mixing

### Stage 5: Subtitles
- Phrase-by-phrase timing
- Cinematic styling
- Smooth fade animations
- Burned into video

### Stage 6: Upload (Optional)
- YouTube OAuth
- Automatic upload
- Metadata (title, description, tags)
- Thumbnail generation

---

## 📊 Performance

- **Generation Time**: 3-5 minutes per video
- **Concurrent Jobs**: 2 per worker
- **Worker Scaling**: 2-5 replicas recommended
- **Storage**: ~50-100MB per video
- **Rate Limit**: 5 videos/hour per user

---

## 🔒 Security

- ✅ OAuth tokens encrypted in database
- ✅ S3 presigned URLs (not public)
- ✅ Rate limiting enabled
- ✅ HTTPS enforced
- ✅ Environment variables secured
- ✅ API routes protected with auth

---

## 💰 Cost Estimate

**Monthly costs for moderate usage:**

- **Vercel**: Free tier (sufficient for most)
- **Railway**: $5-20 (worker usage)
- **Supabase**: Free tier (small projects)
- **Upstash**: Free tier (10K commands/day)
- **AWS S3**: ~$0.023/GB/month storage
- **Total**: ~$10-30/month

---

## 🐛 Troubleshooting

### Workers Not Processing
- Check Railway logs
- Verify Redis connection
- Restart worker

### Videos Not Appearing
- Check database (Prisma Studio)
- Verify S3 upload
- Check presigned URLs

### FFmpeg Errors
- Verify FFmpeg installed
- Check Railway logs
- Test locally

See **[DEPLOYMENT_GUIDE.md](./DEPLOYMENT_GUIDE.md)** for detailed troubleshooting.

---

## 🤝 Contributing

Contributions welcome! Please:

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Submit a pull request

---

## 📄 License

MIT License - see LICENSE file for details

---

## 🙏 Acknowledgments

- **Groq**: Fast LLaMA inference
- **Pexels**: Free stock footage
- **FFmpeg**: Video processing
- **Vercel**: Frontend hosting
- **Railway**: Worker hosting

---

## 📞 Support

- **Documentation**: See `/docs` folder
- **Issues**: GitHub Issues
- **Email**: support@animatube.com

---

## 🗺️ Roadmap

- [ ] Custom voice cloning
- [ ] Advanced video editing
- [ ] Multi-language support
- [ ] Custom branding
- [ ] Team collaboration
- [ ] Analytics dashboard

---

**Built with ❤️ by the Animatube team**

🚀 **Ready to deploy?** See [DEPLOYMENT_GUIDE.md](./DEPLOYMENT_GUIDE.md) — AI-Powered Video Factory

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
