#!/bin/bash

# ═══════════════════════════════════════════════════════════════════════════
# Animatube Production Setup Test Script
# ═══════════════════════════════════════════════════════════════════════════
# Tests all production dependencies before deployment
# ═══════════════════════════════════════════════════════════════════════════

set -e

echo "════════════════════════════════════════════════════════════════════════"
echo "🧪 Testing Animatube Production Setup"
echo "════════════════════════════════════════════════════════════════════════"
echo ""

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Test counter
PASSED=0
FAILED=0

# Helper functions
test_pass() {
    echo -e "${GREEN}✓${NC} $1"
    ((PASSED++))
}

test_fail() {
    echo -e "${RED}✗${NC} $1"
    ((FAILED++))
}

test_warn() {
    echo -e "${YELLOW}⚠${NC} $1"
}

# ─── Test 1: Environment Variables ────────────────────────────────────────────
echo "📋 Testing Environment Variables..."

if [ -f .env ]; then
    test_pass ".env file exists"
else
    test_fail ".env file missing"
fi

required_vars=(
    "DATABASE_URL"
    "REDIS_URL"
    "NEXTAUTH_SECRET"
    "NEXTAUTH_URL"
    "GOOGLE_CLIENT_ID"
    "GOOGLE_CLIENT_SECRET"
    "GROQ_API_KEY"
    "PEXELS_API_KEY"
    "AWS_ACCESS_KEY_ID"
    "AWS_SECRET_ACCESS_KEY"
    "AWS_S3_BUCKET"
    "AWS_REGION"
    "ENCRYPTION_KEY"
)

for var in "${required_vars[@]}"; do
    if grep -q "^$var=" .env 2>/dev/null; then
        test_pass "$var configured"
    else
        test_fail "$var missing"
    fi
done

echo ""

# ─── Test 2: Dependencies ─────────────────────────────────────────────────────
echo "📦 Testing Dependencies..."

if [ -d node_modules ]; then
    test_pass "node_modules exists"
else
    test_fail "node_modules missing - run: npm install"
fi

if [ -f node_modules/.bin/prisma ]; then
    test_pass "Prisma installed"
else
    test_fail "Prisma missing"
fi

if [ -f node_modules/.bin/next ]; then
    test_pass "Next.js installed"
else
    test_fail "Next.js missing"
fi

echo ""

# ─── Test 3: Database Connection ──────────────────────────────────────────────
echo "🗄️  Testing Database Connection..."

if command -v npx &> /dev/null; then
    if npx prisma db execute --stdin <<< "SELECT 1;" &> /dev/null; then
        test_pass "Database connection successful"
    else
        test_fail "Database connection failed"
    fi
else
    test_warn "npx not found, skipping database test"
fi

echo ""

# ─── Test 4: Redis Connection ─────────────────────────────────────────────────
echo "🔴 Testing Redis Connection..."

if command -v node &> /dev/null; then
    node -e "
        const Redis = require('ioredis');
        const redis = new Redis(process.env.REDIS_URL, {
            tls: process.env.REDIS_URL.startsWith('rediss://') ? { rejectUnauthorized: false } : undefined,
        });
        redis.ping()
            .then(() => { console.log('Redis connection successful'); process.exit(0); })
            .catch((err) => { console.error('Redis connection failed:', err.message); process.exit(1); });
    " 2>&1 | grep -q "successful" && test_pass "Redis connection successful" || test_fail "Redis connection failed"
else
    test_warn "Node.js not found, skipping Redis test"
fi

echo ""

# ─── Test 5: S3 Access ────────────────────────────────────────────────────────
echo "☁️  Testing S3 Access..."

if command -v node &> /dev/null; then
    node -e "
        const { S3Client, ListBucketsCommand } = require('@aws-sdk/client-s3');
        const s3 = new S3Client({
            region: process.env.AWS_REGION,
            credentials: {
                accessKeyId: process.env.AWS_ACCESS_KEY_ID,
                secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
            },
        });
        s3.send(new ListBucketsCommand({}))
            .then(() => { console.log('S3 access successful'); process.exit(0); })
            .catch((err) => { console.error('S3 access failed:', err.message); process.exit(1); });
    " 2>&1 | grep -q "successful" && test_pass "S3 access successful" || test_fail "S3 access failed"
else
    test_warn "Node.js not found, skipping S3 test"
fi

echo ""

# ─── Test 6: FFmpeg ───────────────────────────────────────────────────────────
echo "🎬 Testing FFmpeg..."

if command -v ffmpeg &> /dev/null; then
    test_pass "FFmpeg installed"
    ffmpeg -version | head -n 1
else
    test_fail "FFmpeg not found - required for video processing"
fi

if command -v ffprobe &> /dev/null; then
    test_pass "FFprobe installed"
else
    test_fail "FFprobe not found"
fi

echo ""

# ─── Test 7: Build ────────────────────────────────────────────────────────────
echo "🔨 Testing Build..."

if npm run build &> /dev/null; then
    test_pass "Next.js build successful"
else
    test_fail "Next.js build failed"
fi

echo ""

# ─── Test 8: Prisma ───────────────────────────────────────────────────────────
echo "🔷 Testing Prisma..."

if [ -d node_modules/.prisma/client ]; then
    test_pass "Prisma client generated"
else
    test_warn "Prisma client not generated - run: npm run db:generate"
fi

echo ""

# ─── Summary ──────────────────────────────────────────────────────────────────
echo "════════════════════════════════════════════════════════════════════════"
echo "📊 Test Summary"
echo "════════════════════════════════════════════════════════════════════════"
echo -e "${GREEN}Passed: $PASSED${NC}"
echo -e "${RED}Failed: $FAILED${NC}"
echo ""

if [ $FAILED -eq 0 ]; then
    echo -e "${GREEN}✅ All tests passed! Ready for production deployment.${NC}"
    exit 0
else
    echo -e "${RED}❌ Some tests failed. Fix issues before deploying.${NC}"
    exit 1
fi
