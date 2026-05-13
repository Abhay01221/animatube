# ⚡ Animatube Quick Deploy Guide

**Get Animatube running in production in 30 minutes**

---

## 🚀 Prerequisites (5 minutes)

Create accounts on:
- [ ] [Vercel](https://vercel.com) - Frontend hosting
- [ ] [Railway](https://railway.app) - Worker hosting
- [ ] [Supabase](https://supabase.com) - PostgreSQL database
- [ ] [Upstash](https://upstash.com) - Redis queue
- [ ] [AWS](https://aws.amazon.com) - S3 storage
- [ ] [Google Cloud](https://console.cloud.google.com) - OAuth

---

## 📋 Step 1: Database (5 minutes)

```bash
# 1. Create Supabase project
# 2. Copy connection string from Settings → Database
# 3. Add to .env:
DATABASE_URL="postgresql://postgres:PASSWORD@HOST:5432/postgres"

# 4. Deploy schema
npm run db:generate
npm run db:push
```

---

## 📋 Step 2: Redis (2 minutes)

```bash
# 1. Create Upstash Redis database (Global region)
# 2. Copy REDIS_URL (starts with rediss://)
# 3. Add to .env:
REDIS_URL="rediss://default:PASSWORD@HOST:6379"
```

---

## 📋 Step 3: S3 Storage (5 minutes)

```bash
# 1. Create S3 bucket: animatube-videos-prod
# 2. Disable "Block all public access"
# 3. Add CORS policy (see DEPLOYMENT_GUIDE.md)
# 4. Create IAM user with S3 access
# 5. Add to .env:
AWS_ACCESS_KEY_ID="AKIA..."
AWS_SECRET_ACCESS_KEY="..."
AWS_S3_BUCKET="animatube-videos-prod"
AWS_REGION="us-east-1"
```

---

## 📋 Step 4: Google OAuth (5 minutes)

```bash
# 1. Create Google Cloud project
# 2. Enable YouTube Data API v3
# 3. Create OAuth 2.0 credentials
# 4. Add redirect URIs:
#    - http://localhost:3000/api/auth/callback/google
#    - https://YOUR-DOMAIN.vercel.app/api/auth/callback/google
# 5. Add to .env:
GOOGLE_CLIENT_ID="..."
GOOGLE_CLIENT_SECRET="..."
```

---

## 📋 Step 5: Secrets (2 minutes)

```bash
# Generate NextAuth secret
openssl rand -base64 32
# Add to .env:
NEXTAUTH_SECRET="..."

# Generate encryption key
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
# Add to .env:
ENCRYPTION_KEY="..."

# Add NextAuth URL (update after Vercel deploy)
NEXTAUTH_URL="http://localhost:3000"
```

---

## 📋 Step 6: AI APIs (2 minutes)

```bash
# 1. Get Groq API key: https://console.groq.com
# 2. Get Pexels API key: https://www.pexels.com/api
# 3. Add to .env:
GROQ_API_KEY="gsk_..."
PEXELS_API_KEY="..."
```

---

## 📋 Step 7: Deploy Frontend (5 minutes)

```bash
# 1. Push code to GitHub
git add .
git commit -m "Production ready"
git push

# 2. Go to vercel.com
# 3. Import GitHub repository
# 4. Add ALL environment variables from .env
# 5. Deploy

# 6. Update NEXTAUTH_URL with Vercel URL
NEXTAUTH_URL="https://your-app.vercel.app"

# 7. Update Google OAuth redirect URIs
```

---

## 📋 Step 8: Deploy Workers (5 minutes)

```bash
# 1. Go to railway.app
# 2. New Project → Deploy from GitHub
# 3. Select repository
# 4. Add ALL environment variables from .env
# 5. Settings:
#    - Build: Use Dockerfile.worker
#    - Start Command: npm run worker
# 6. Deploy

# 7. Check logs for:
#    ✓ [Redis] Connected successfully
#    ✓ Worker is running and waiting for jobs...
```

---

## 📋 Step 9: Test (5 minutes)

```bash
# 1. Visit your Vercel URL
# 2. Login with Google
# 3. Generate a test video
# 4. Monitor progress
# 5. Verify video appears in dashboard
# 6. Test download

# Check logs:
# - Vercel: vercel logs --follow
# - Railway: railway logs --follow
```

---

## ✅ Verification Checklist

- [ ] Frontend loads at Vercel URL
- [ ] Google OAuth login works
- [ ] Worker logs show "running and waiting for jobs"
- [ ] Test video generates successfully
- [ ] All 6 stages complete
- [ ] Video appears in dashboard
- [ ] Video playback works
- [ ] Download button works
- [ ] S3 bucket contains video file
- [ ] Database shows video record

---

## 🎯 Environment Variables Summary

Copy this to both Vercel and Railway:

```bash
# Database
DATABASE_URL=postgresql://...

# Redis
REDIS_URL=rediss://...

# NextAuth
NEXTAUTH_URL=https://your-app.vercel.app
NEXTAUTH_SECRET=...

# Google OAuth
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...

# AI APIs
GROQ_API_KEY=gsk_...
PEXELS_API_KEY=...

# AWS S3
AWS_ACCESS_KEY_ID=AKIA...
AWS_SECRET_ACCESS_KEY=...
AWS_S3_BUCKET=animatube-videos-prod
AWS_REGION=us-east-1

# Security
ENCRYPTION_KEY=...
```

---

## 🆘 Quick Troubleshooting

### Workers not processing jobs
```bash
# Check Railway logs
railway logs --follow

# Look for:
# ✓ [Redis] Connected successfully
# ✓ Worker is running and waiting for jobs...
```

### Videos not appearing in dashboard
```bash
# Check S3 bucket
# Check database: npm run db:studio
# Verify s3VideoUrl field is populated
```

### Build failures
```bash
# Vercel: Check build logs
# Railway: Verify Dockerfile.worker exists
# Run locally: npm run build
```

---

## 📚 Full Documentation

- **Complete Guide**: `DEPLOYMENT_GUIDE.md`
- **Checklist**: `PRODUCTION_CHECKLIST.md`
- **Architecture**: `PRODUCTION_READY.md`
- **Troubleshooting**: See deployment guide

---

## 🎉 Done!

Your Animatube platform is now live at:
- **Frontend**: `https://your-app.vercel.app`
- **Workers**: Running on Railway
- **Storage**: AWS S3
- **Database**: Supabase
- **Queue**: Upstash Redis

**Total Time**: ~30 minutes
**Monthly Cost**: $7-25

---

## 🚀 Next Steps

1. Test with multiple videos
2. Monitor logs for 24 hours
3. Set up custom domain (optional)
4. Enable analytics (optional)
5. Invite users!

**Your production SaaS is ready! 🎊**
