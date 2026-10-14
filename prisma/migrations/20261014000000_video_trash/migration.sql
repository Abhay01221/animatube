ALTER TABLE "Video" ADD COLUMN "deletedAt" TIMESTAMP(3);
CREATE INDEX "Video_userId_deletedAt_createdAt_idx" ON "Video"("userId", "deletedAt", "createdAt");
