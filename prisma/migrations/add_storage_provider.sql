-- Migration: add_storage_provider
-- Run this manually in the Supabase SQL editor or via a direct DB connection.
-- Adds storageProvider and s3Key columns to the "Video" table.

ALTER TABLE "Video"
  ADD COLUMN IF NOT EXISTS "storageProvider" TEXT,
  ADD COLUMN IF NOT EXISTS "s3Key" TEXT;
