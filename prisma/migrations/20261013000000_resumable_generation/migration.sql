-- AlterTable
ALTER TABLE "Video" ADD COLUMN     "approvedRevision" INTEGER,
ADD COLUMN     "channelProfileId" TEXT,
ADD COLUMN     "creditState" TEXT NOT NULL DEFAULT 'legacy',
ADD COLUMN     "executionLease" TIMESTAMP(3),
ADD COLUMN     "executionToken" TEXT,
ADD COLUMN     "generationManifest" JSONB,
ADD COLUMN     "generationOptions" JSONB,
ADD COLUMN     "parentVideoId" TEXT,
ADD COLUMN     "publicationHistory" JSONB,
ADD COLUMN     "queueVersion" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "renderRevision" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "requestKey" TEXT,
ADD COLUMN     "thumbnailKey" TEXT;

-- CreateTable
CREATE TABLE "CreditLedger" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "operationKey" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CreditLedger_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JobOutbox" (
    "id" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "leaseUntil" TIMESTAMP(3),
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dispatchedAt" TIMESTAMP(3),

    CONSTRAINT "JobOutbox_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChannelProfile" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "settings" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ChannelProfile_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CreditLedger_operationKey_key" ON "CreditLedger"("operationKey");

-- CreateIndex
CREATE INDEX "CreditLedger_userId_createdAt_idx" ON "CreditLedger"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "JobOutbox_status_leaseUntil_idx" ON "JobOutbox"("status", "leaseUntil");

-- CreateIndex
CREATE INDEX "ChannelProfile_userId_idx" ON "ChannelProfile"("userId");

-- CreateIndex
CREATE INDEX "Video_userId_createdAt_idx" ON "Video"("userId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Video_userId_requestKey_key" ON "Video"("userId", "requestKey");

-- AddForeignKey
ALTER TABLE "CreditLedger" ADD CONSTRAINT "CreditLedger_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
