# YouTube Upload Decoupling - Implementation Checklist

## ✅ Completed (Backend)

### Database
- [x] Added `renderStatus` column
- [x] Added `uploadStatus` column
- [x] Added `subtitlesAdded` column
- [x] Added `localFilePath` column
- [x] Added `renderError` column
- [x] Added `uploadError` column
- [x] Applied schema changes with `prisma db push`
- [x] Regenerated Prisma client

### Queue System
- [x] Created `uploadQueue` for YouTube uploads
- [x] Added `UploadJobData` interface
- [x] Configured separate queue with retry logic

### Local Storage
- [x] Created `lib/local-storage.ts` module
- [x] Implemented `saveFinalVideoToLibrary()`
- [x] Implemented `getLocalFilePath()`
- [x] Implemented `localFileExists()`
- [x] Implemented `getFileSize()`
- [x] Implemented `deleteLocalFile()`
- [x] Implemented `getLibraryVideos()`

### Workers
- [x] Created `lib/workers/video-worker.ts` (Jobs A-C)
- [x] Created `lib/workers/upload-worker.ts` (Job D)
- [x] Updated `worker-entry.ts` to start both workers
- [x] Separated render and upload logic
- [x] Implemented independent error handling

### API Endpoints
- [x] Created `POST /api/projects/:id/upload`
- [x] Created `POST /api/projects/:id/upload/retry`
- [x] Created `GET /api/projects/:id/download`
- [x] Updated `GET /api/dashboard` with new fields
- [x] Fixed all TypeScript errors

### Documentation
- [x] Created `YOUTUBE_UPLOAD_DECOUPLING.md`
- [x] Created `REFACTOR_SUMMARY.md`
- [x] Created `IMPLEMENTATION_CHECKLIST.md`

## ⏳ Pending (Frontend)

### UI Components

#### Video Card Component
- [ ] Create `VideoCard` component
- [ ] Add render status badge
- [ ] Add upload status badge
- [ ] Add subtitles badge
- [ ] Add download button (always enabled when render complete)
- [ ] Add upload button (trigger upload)
- [ ] Add retry button (for failed uploads)
- [ ] Add YouTube link (when uploaded)
- [ ] Display render errors (red, blocking)
- [ ] Display upload errors (yellow, warning)

#### Status Badge Components
- [ ] Create `RenderBadge` component
  - [ ] Pending state (⏳ gray)
  - [ ] Processing state (⚙️ blue)
  - [ ] Completed state (✅ green)
  - [ ] Failed state (❌ red)
- [ ] Create `UploadBadge` component
  - [ ] Queued state (⏳ gray)
  - [ ] Uploading state (⬆️ blue)
  - [ ] Uploaded state (✅ green)
  - [ ] Failed state (⚠️ yellow)
- [ ] Create `SubtitlesBadge` component

#### Dashboard Layout
- [ ] Update dashboard to use new status fields
- [ ] Add dashboard tabs:
  - [ ] All Videos
  - [ ] Ready (render complete)
  - [ ] Uploading
  - [ ] On YouTube
  - [ ] Failed
  - [ ] Downloads
- [ ] Update stats display:
  - [ ] Total videos
  - [ ] Render completed
  - [ ] Uploaded
  - [ ] Render failed
  - [ ] Upload failed

#### API Integration
- [ ] Implement upload trigger
  ```typescript
  await fetch(`/api/projects/${id}/upload`, { method: "POST" });
  ```
- [ ] Implement upload retry
  ```typescript
  await fetch(`/api/projects/${id}/upload/retry`, { method: "POST" });
  ```
- [ ] Implement download
  ```typescript
  window.location.href = `/api/projects/${id}/download`;
  ```
- [ ] Update dashboard data fetching
- [ ] Handle new status fields in UI

### Error Handling
- [ ] Display render errors prominently
- [ ] Display upload errors as warnings
- [ ] Show specific error messages:
  - [ ] "YouTube auth expired — reconnect account"
  - [ ] "YouTube quota exceeded — try again tomorrow"
  - [ ] "Network error — check connection"
  - [ ] "Invalid video format"

## 🧪 Testing

### Render Pipeline
- [ ] Start workers: `npx tsx worker-entry.ts`
- [ ] Generate a test video
- [ ] Verify `renderStatus` updates to "completed"
- [ ] Verify `localFilePath` is set
- [ ] Verify file exists in `storage/library/{jobId}/final.mp4`
- [ ] Verify video appears in dashboard immediately

### Download
- [ ] Click download button
- [ ] Verify MP4 downloads correctly
- [ ] Verify filename is sanitized
- [ ] Verify Content-Type is correct

### Upload
- [ ] Click "Upload to YouTube" button
- [ ] Verify `uploadStatus` updates: queued → uploading → uploaded
- [ ] Verify `youtubeId` and `youtubeUrl` are set
- [ ] Verify video remains downloadable during upload
- [ ] Verify video remains downloadable after upload

### Upload Failure
- [ ] Disconnect YouTube auth or cause upload to fail
- [ ] Verify `uploadStatus` updates to "failed"
- [ ] Verify `uploadError` contains error message
- [ ] Verify `renderStatus` remains "completed"
- [ ] Verify video is still downloadable
- [ ] Verify retry button appears

### Retry
- [ ] Click "Retry Upload" button
- [ ] Verify `uploadStatus` updates to "queued"
- [ ] Verify `uploadError` is cleared
- [ ] Verify no re-rendering occurs
- [ ] Verify upload processes again

### Status Display
- [ ] Verify render and upload badges show separately
- [ ] Verify "Video Ready" shows when `renderStatus === "completed"`
- [ ] Verify "Upload Failed" shows as warning, not error
- [ ] Verify download button always enabled when render complete

## 🚀 Deployment

### Pre-Deployment
- [ ] Run TypeScript check: `npx tsc --noEmit`
- [ ] Run tests (if available)
- [ ] Review all changes
- [ ] Backup database

### Deployment Steps
- [ ] Deploy database schema changes
- [ ] Deploy backend code
- [ ] Deploy frontend code
- [ ] Start both workers (video + upload)
- [ ] Monitor logs for errors

### Post-Deployment
- [ ] Test end-to-end flow
- [ ] Monitor worker logs
- [ ] Monitor error rates
- [ ] Check database for correct status values

## 📊 Migration

### Existing Videos
- [ ] Run migration SQL:
  ```sql
  -- Backfill renderStatus from status
  UPDATE "Video" SET "renderStatus" = "status";
  
  -- Set uploadStatus for videos with YouTube IDs
  UPDATE "Video" SET "uploadStatus" = 'uploaded' WHERE "youtubeId" IS NOT NULL;
  
  -- Set subtitlesAdded for completed videos
  UPDATE "Video" SET "subtitlesAdded" = true WHERE "status" = 'completed';
  ```
- [ ] Verify migration results
- [ ] Check for any null values

### Backfill Local Files (Optional)
- [ ] For existing videos, download from S3 to local library
- [ ] Update `localFilePath` in database
- [ ] Verify files are accessible

## 🔍 Monitoring

### Metrics to Track
- [ ] Render success rate
- [ ] Upload success rate
- [ ] Average render time
- [ ] Average upload time
- [ ] Error rates by type
- [ ] Queue depths

### Alerts to Set Up
- [ ] Render failure rate > 10%
- [ ] Upload failure rate > 20%
- [ ] Queue depth > 100
- [ ] Worker crashes
- [ ] Disk space low (for local storage)

## 📝 Documentation

### User Documentation
- [ ] Update user guide with new workflow
- [ ] Document download feature
- [ ] Document upload retry feature
- [ ] Add FAQ for common issues

### Developer Documentation
- [ ] Update API documentation
- [ ] Document worker architecture
- [ ] Document queue system
- [ ] Add troubleshooting guide

## 🎯 Success Criteria

- [ ] Videos are downloadable immediately when render completes
- [ ] Upload failures don't block video access
- [ ] Render and upload status are clearly separated
- [ ] Upload retry works without re-rendering
- [ ] Users can generate videos without YouTube account
- [ ] All tests pass
- [ ] No TypeScript errors
- [ ] No runtime errors in logs

## 🔄 Rollback Plan

If issues arise:

1. **Stop new workers:**
   ```bash
   # Kill worker processes
   pkill -f "tsx worker-entry.ts"
   ```

2. **Revert to old worker:**
   ```typescript
   // In worker-entry.ts
   import { createWorker } from "./lib/worker";
   const worker = createWorker();
   ```

3. **Database rollback (if needed):**
   ```sql
   -- Remove new columns
   ALTER TABLE "Video" DROP COLUMN "renderStatus";
   ALTER TABLE "Video" DROP COLUMN "uploadStatus";
   ALTER TABLE "Video" DROP COLUMN "subtitlesAdded";
   ALTER TABLE "Video" DROP COLUMN "localFilePath";
   ALTER TABLE "Video" DROP COLUMN "renderError";
   ALTER TABLE "Video" DROP COLUMN "uploadError";
   ```

4. **Redeploy previous version**

## 📅 Timeline

- **Backend Implementation:** ✅ Complete
- **Frontend Implementation:** ⏳ 2-3 days
- **Testing:** ⏳ 1-2 days
- **Deployment:** ⏳ 1 day
- **Monitoring:** ⏳ Ongoing

## 🎉 Completion

When all checkboxes are checked:
- [ ] Backend complete
- [ ] Frontend complete
- [ ] Testing complete
- [ ] Deployment complete
- [ ] Documentation complete
- [ ] Monitoring set up

**Status:** Backend ✅ | Frontend ⏳ | Testing ⏳ | Deployment ⏳
