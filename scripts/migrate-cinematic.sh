#!/bin/bash

# Migration script for Cinematic Architecture
# Run this after pulling the cinematic updates

echo "🎬 Animatube Cinematic Architecture Migration"
echo "=============================================="
echo ""

# Step 1: Install dependencies (if any new ones)
echo "📦 Step 1: Checking dependencies..."
cd "$(dirname "$0")/.."
npm install
echo "✓ Dependencies checked"
echo ""

# Step 2: Generate Prisma client with new schema
echo "🗄️  Step 2: Updating database schema..."
npx prisma generate
echo "✓ Prisma client generated"
echo ""

# Step 3: Push schema changes to database
echo "📤 Step 3: Pushing schema changes to database..."
read -p "Do you want to push schema changes to the database? (y/n) " -n 1 -r
echo ""
if [[ $REPLY =~ ^[Yy]$ ]]
then
    npx prisma db push
    echo "✓ Schema pushed to database"
else
    echo "⚠ Skipped database push. Run 'npx prisma db push' manually when ready."
fi
echo ""

# Step 4: Verify environment variables
echo "🔐 Step 4: Verifying environment variables..."
if [ ! -f .env ]; then
    echo "❌ .env file not found!"
    echo "Please create .env file with required variables:"
    echo "  - GROQ_API_KEY"
    echo "  - PEXELS_API_KEY (optional)"
    echo "  - REDIS_URL"
    echo "  - DATABASE_URL"
    exit 1
fi

if grep -q "GROQ_API_KEY" .env; then
    echo "✓ GROQ_API_KEY found"
else
    echo "⚠ GROQ_API_KEY not found in .env"
fi

if grep -q "PEXELS_API_KEY" .env; then
    echo "✓ PEXELS_API_KEY found"
else
    echo "⚠ PEXELS_API_KEY not found (will use placeholders)"
fi
echo ""

# Step 5: Test FFmpeg installation
echo "🎥 Step 5: Testing FFmpeg installation..."
if command -v ffmpeg &> /dev/null; then
    FFMPEG_VERSION=$(ffmpeg -version | head -n 1)
    echo "✓ FFmpeg found: $FFMPEG_VERSION"
else
    echo "❌ FFmpeg not found!"
    echo "Please install FFmpeg:"
    echo "  - macOS: brew install ffmpeg"
    echo "  - Ubuntu: sudo apt install ffmpeg"
    echo "  - Windows: Download from https://ffmpeg.org/download.html"
    exit 1
fi
echo ""

# Step 6: Build TypeScript
echo "🔨 Step 6: Building TypeScript..."
npm run build
if [ $? -eq 0 ]; then
    echo "✓ TypeScript build successful"
else
    echo "❌ TypeScript build failed"
    exit 1
fi
echo ""

# Step 7: Summary
echo "✅ Migration Complete!"
echo ""
echo "Next steps:"
echo "1. Start the development server: npm run dev"
echo "2. Start the worker: npm run worker"
echo "3. Generate a test video to verify the cinematic pipeline"
echo ""
echo "📚 Documentation: See CINEMATIC_ARCHITECTURE.md for details"
echo ""
