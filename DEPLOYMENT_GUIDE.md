# Animatube Production Deployment Guide

This guide walks you through deploying Animatube as a production-ready SaaS platform.

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                         PRODUCTION SETUP                         │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌──────────────┐      ┌──────────────┐      ┌──────────────┐ │
│  │   Vercel     │      │   Railway    │      │  Supabase    │ │
│  │  (Frontend)  │─────▶│  (Workers)   │─────▶│ (Postgres)   │ │
│  │              │      │              │      │              │ │
│  │ • Next.js    │      │ • BullMQ     │      │ • Database   │ │
│  │ • API Routes │      │ • FFmpeg     │      │ • Prisma     │ │
│  │ • NextAuth   │      │ • Rendering  │      └──────────────┘ │
│  └──────────────┘      └──────────────┘                        │
│         │                     │                                 │
│         │                     │                                 │
│         ▼                     ▼                                 │
│  ┌──────────────┐      ┌──────────────┐                        │
│  │   Upstash    │      │   AWS S3     │                        │
│  │   (Redis)    │      │  (Storage)   │                        │
│  │              │      │              │                        │
│  │ • BullMQ     │      │ • Videos     │                        │
│  │ • Progress   │      │ • Thumbnails │                        │
│  │ • Rate Limit │      │ • Subtitles  │                        │
│  └──────────────┘      └──────────────┘                        │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

## Prerequisites

- **Vercel Account**: For frontend deployment
- **Railway Account**: For worker deployment
- **Supabase Account**: For PostgreSQL database
- **Upstash Account**: For Redis (BullMQ queue)
- **AWS Account**: For S3 video storage
- **Google Cloud Console**: For OAuth and YouTube API

---

## Step 1: Database Setup (Supabase)

### 1.1 Create Supabase Project

1. Go to [supabase.com](https://supabase.com)
2. Create a new project
3. Wait for database provisioning (~2 minutes)
4. Copy the **Connection String** from Settings → Database

### 1.2 Deploy Database Schema

```bash
# Set DATABASE_URL in .env
DATABASE_URL="postgresql://postgres:[PASSWORD]@[HOST]:5432/postgres"

# Generate Prisma client
npm run db:generate

# Push schema to database
npm run db:push
```

### 1.3 Verify Schema

```bash
# Open Prisma Studio to verify tables
npm run db:studio
```

Expected tables:
- `User`
- `Account`
- `Session`
- `VerificationToken`
- `Video`

---

## Step 2: Redis Setup (Upstash)

### 2.1 Create Upstash Redis

1. Go to [upstash.com](https://upstash.com)
2. Create a new Redis database
3. Select **Global** for best performance
4. Copy the **REDIS_URL** (starts with `rediss://`)

### 2.2 Configure Redis

Add to `.env`:
```bash
REDIS_URL="rediss://default:[PASSWORD]@[HOST]:6379"
```

### 2.3 Test Connection

```bash
# Workers will automatically connect on startup
npm run worker
```

Look for: `[Redis] Connected successfully`

---

## Step 3: S3 Storage Setup (AWS)

### 3.1 Create S3 Bucket

1. Go to AWS Console → S3
2. Create bucket: `animatube-videos-prod`
3. Region: Choose closest to your users
4. **Block all public access**: OFF (we use presigned URLs)
5. Enable versioning (optional)

### 3.2 Configure CORS

Add CORS policy to bucket:

```json
[
  {
    "AllowedHeaders": ["*"],
    "AllowedMethods": ["GET", "PUT", "POST", "DELETE"],
    "AllowedOrigins": ["*"],
    "ExposeHeaders": ["ETag"]
  }
]
```

### 3.3 Create IAM User

1. IAM → Users → Create user: `animatube-s3-user`
2. Attach policy: `AmazonS3FullAccess` (or create custom policy)
3. Create access key → Copy credentials

### 3.4 Configure S3

Add to `.env`:
```bash
AWS_ACCESS_KEY_ID="AKIA..."
AWS_SECRET_ACCESS_KEY="..."
AWS_S3_BUCKET="animatube-videos-prod"
AWS_REGION="us-east-1"
```

### 3.5 Optional: Lifecycle Policy

Configure automatic cleanup of intermediate files:

1. S3 Bucket → Management → Lifecycle rules
2. Create rule: Delete objects in `jobs/*/` after 7 days
3. Keep objects in `videos/*/` permanently

---

## Step 4: Google OAuth Setup

### 4.1 Create OAuth Credentials

1. Go to [Google Cloud Console](https://console.cloud.google.com)
2. Create project: `Animatube`
3. Enable APIs:
   - Google+ API
   - YouTube Data API v3
4. OAuth consent screen:
   - User type: External
   - Scopes: `email`, `profile`, `youtube.upload`
5. Credentials → Create OAuth 2.0 Client ID:
   - Application type: Web application
   - Authorized redirect URIs:
     - `http://localhost:3000/api/auth/callback/google` (dev)
     - `https://your-domain.vercel.app/api/auth/callback/google` (prod)

### 4.2 Configure OAuth

Add to `.env`:
```bash
GOOGLE_CLIENT_ID="420262308589-..."
GOOGLE_CLIENT_SECRET="GOCSPX-..."
NEXTAUTH_SECRET="[Generate with: openssl rand -base64 32]"
NEXTAUTH_URL="https://your-domain.vercel.app"
```

---

## Step 5: Frontend Deployment (Vercel)

### 5.1 Connect Repository

1. Go to [vercel.com](https://vercel.com)
2. Import Git repository
3. Framework preset: **Next.js**
4. Root directory: `animatube`

### 5.2 Configure Environment Variables

Add all variables from `.env`:

```bash
# Database
DATABASE_URL="postgresql://..."

# Redis
REDIS_URL="rediss://..."

# NextAuth
NEXTAUTH_URL="https://your-domain.vercel.app"
NEXTAUTH_SECRET="..."

# Google OAuth
GOOGLE_CLIENT_ID="..."
GOOGLE_CLIENT_SECRET="..."

# AI APIs
GROQ_API_KEY="gsk_..."
PEXELS_API_KEY="..."

# AWS S3
AWS_ACCESS_KEY_ID="AKIA..."
AWS_SECRET_ACCESS_KEY="..."
AWS_S3_BUCKET="animatube-videos-prod"
AWS_REGION="us-east-1"

# Encryption
ENCRYPTION_KEY="[32 bytes hex]"
```

### 5.3 Deploy

```bash
# Vercel will automatically:
# 1. Install dependencies
# 2. Generate Prisma client
# 3. Build Next.js
# 4. Deploy to CDN

# Or deploy manually:
npm run build
vercel --prod
```

### 5.4 Verify Deployment

1. Visit your Vercel URL
2. Test Google OAuth login
3. Check API routes: `/api/dashboard`

---

## Step 6: Worker Deployment (Railway)

### 6.1 Create Railway Project

1. Go to [railway.app](https://railway.app)
2. New Project → Deploy from GitHub repo
3. Select your repository
4. Root directory: `animatube`

### 6.2 Configure Build

Railway settings:
- **Build Command**: `npm install && npx prisma generate`
- **Start Command**: `npm run worker`
- **Dockerfile**: Use `Dockerfile.worker` (includes FFmpeg)

### 6.3 Add Environment Variables

Add same variables as Vercel (Railway will use them for worker):

```bash
DATABASE_URL="postgresql://..."
REDIS_URL="rediss://..."
AWS_ACCESS_KEY_ID="..."
AWS_SECRET_ACCESS_KEY="..."
AWS_S3_BUCKET="..."
AWS_REGION="..."
GROQ_API_KEY="..."
PEXELS_API_KEY="..."
ENCRYPTION_KEY="..."
```

### 6.4 Deploy Worker

```bash
# Railway will automatically:
# 1. Build Docker image with FFmpeg
# 2. Install dependencies
# 3. Start worker process

# Or deploy manually:
railway up
```

### 6.5 Verify Worker

Check Railway logs:
```
🚀 Animatube Worker Starting
[Redis] Connected successfully
[Worker] Worker is running and waiting for jobs...
```

### 6.6 Scale Workers (Optional)

Railway → Settings → Replicas:
- Set to 2-5 replicas for parallel processing
- Each replica processes 2 concurrent jobs

---

## Step 7: Production Testing

### 7.1 Test Video Generation

1. Login to your deployed app
2. Generate a test video
3. Monitor progress in real-time
4. Verify video appears in dashboard
5. Test download functionality

### 7.2 Check Logs

**Vercel Logs** (Frontend):
```bash
vercel logs --follow
```

**Railway Logs** (Worker):
```bash
railway logs --follow
```

### 7.3 Monitor Redis

Upstash Console → Metrics:
- Connection count
- Command rate
- Memory usage

### 7.4 Monitor S3

AWS Console → S3 → Metrics:
- Storage size
- Request count
- Data transfer

---

## Step 8: Production Optimizations

### 8.1 Enable Caching

Add to `next.config.ts`:
```typescript
export default {
  images: {
    domains: ['img.youtube.com', 'your-bucket.s3.amazonaws.com'],
  },
  experimental: {
    optimizeCss: true,
  },
};
```

### 8.2 Configure Rate Limiting

Already configured in `/api/generate`:
- 5 videos per hour per user
- Uses Upstash Redis

### 8.3 Add Monitoring

**Vercel Analytics**:
```bash
npm install @vercel/analytics
```

**Sentry Error Tracking**:
```bash
npm install @sentry/nextjs
```

### 8.4 Database Connection Pooling

Prisma automatically handles connection pooling.

For additional pooling, use PgBouncer:
```bash
DATABASE_URL="postgresql://user:pass@pgbouncer-host:6432/db?pgbouncer=true"
```

---

## Step 9: Security Checklist

- ✅ All API keys in environment variables (not in code)
- ✅ S3 bucket uses presigned URLs (not public)
- ✅ OAuth tokens encrypted in database
- ✅ Rate limiting enabled
- ✅ CORS configured correctly
- ✅ HTTPS enforced (Vercel automatic)
- ✅ Database connection over SSL
- ✅ Redis connection over TLS

---

## Step 10: Maintenance

### 10.1 Database Backups

Supabase automatically backs up daily.

Manual backup:
```bash
pg_dump $DATABASE_URL > backup.sql
```

### 10.2 S3 Cleanup

Set lifecycle policy to delete old intermediate files:
- Keep `videos/*` permanently
- Delete `jobs/*` after 7 days

### 10.3 Monitor Costs

**Vercel**: Free tier covers most usage
**Railway**: ~$5-20/month depending on worker usage
**Supabase**: Free tier for small projects
**Upstash**: Free tier covers 10K commands/day
**AWS S3**: ~$0.023/GB/month storage

### 10.4 Update Dependencies

```bash
npm update
npm audit fix
```

---

## Troubleshooting

### Workers Not Processing Jobs

1. Check Railway logs for errors
2. Verify Redis connection: `[Redis] Connected successfully`
3. Check BullMQ queue in Upstash console
4. Restart worker: Railway → Restart

### Videos Not Appearing in Dashboard

1. Check database: `npm run db:studio`
2. Verify S3 upload: AWS Console → S3
3. Check presigned URL generation
4. Verify `s3VideoUrl` field in database

### FFmpeg Errors

1. Verify FFmpeg installed in Docker: `which ffmpeg`
2. Check Railway logs for FFmpeg stderr
3. Test locally: `npm run worker`

### Redis Connection Errors

1. Verify `REDIS_URL` format: `rediss://...`
2. Check Upstash console for connection limits
3. Verify TLS enabled in connection string

### S3 Upload Failures

1. Verify IAM permissions
2. Check bucket CORS policy
3. Verify region matches `AWS_REGION`
4. Check S3 bucket policy

---

## Production URLs

After deployment, you'll have:

- **Frontend**: `https://your-app.vercel.app`
- **API**: `https://your-app.vercel.app/api/*`
- **Worker**: Railway internal (no public URL)
- **Database**: Supabase connection string
- **Redis**: Upstash connection string
- **Storage**: S3 bucket URLs

---

## Support

For issues:
1. Check logs (Vercel + Railway)
2. Review this guide
3. Check GitHub issues
4. Contact support

---

## Next Steps

1. ✅ Deploy to production
2. ✅ Test end-to-end flow
3. ✅ Monitor for 24 hours
4. ✅ Set up alerts (optional)
5. ✅ Add custom domain (optional)
6. ✅ Enable analytics (optional)

**Your Animatube platform is now production-ready! 🚀**
