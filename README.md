# Animatube

Create narrated videos from a saved prompt, review a storyboard, render the approved revision, then download or optionally publish to YouTube. Firebase handles app identity; YouTube uses a separate connection in Settings.

## Development setup

Use Node.js 20+, PostgreSQL, Redis, a private S3 bucket, Firebase Authentication, Groq and Pexels credentials. FFmpeg/ffprobe are bundled by installer packages; workers need writable temporary storage and sufficient CPU, memory and disk. Install a Devanagari font such as Noto Sans Devanagari for Hindi captions; set SUBTITLE_FONT_DIR to its directory if needed.

1. Run `npm ci`.
2. Copy `.env.production.example` to a local environment file and supply credentials. Use `NODE_ENV=development` and `APP_URL=http://localhost:3000` locally. Preserve existing credential files.
3. Enable Firebase Google and/or email/password sign-in and add your app hosts to Firebase authorized domains. Email/password accounts must verify their email.
4. Review/apply migrations below, then run `npm run db:generate`.
5. Run `npm run dev` and `npm run worker` in separate terminals.

Both processes need database, Redis, storage and provider configuration. The worker loads Next.js environment files. worker-entry.ts starts rendering, independent publishing, durable outbox dispatch and interruption recovery. Web hosting alone cannot process queued renders.

For Windows development with Ubuntu WSL, install Ubuntu's redis-server package, then run `npm run local:redis`. This starts a password-protected loopback Redis instance on port 6380 with persistent AOF storage and adds a local REDIS_URL override without modifying cloud credentials in .env. Run it again after WSL/machine restarts. Restart web/worker processes after environment changes. Run `npm run check:runtime` to verify database and queue connectivity without generating videos.

## Production setup

Deploy the Next.js web app and the persistent worker as separate services. The included `vercel.json` configures the web build; `railway.toml` selects `Dockerfile.worker`, which installs FFmpeg, build tools and Noto fonts and runs `npm run worker`. Other hosts can run the same commands.

1. Configure both services from `.env.production.example`, with `NODE_ENV=production`, the production `APP_URL`, and access to the same PostgreSQL, Redis and private storage.
2. Back up the database and apply the reviewed migrations with `npm run db:deploy` before starting the updated services. Use the existing-installation procedure below when migration history is missing.
3. Build the web service with `npm run build` and start it with `npm run start`. Start the worker independently with `npm run worker` or the supplied Docker image.
4. Add the production host to Firebase authorized domains and configure the separate YouTube callback described below. Supply Firebase client configuration at web build time; keep admin/provider credentials on the server.
5. Run `npm run check:runtime` and check worker logs. Verify login, storyboard approval, rendering, download and resume with a staging account before accepting production jobs.

Allow enough worker CPU, memory and temporary disk for FFmpeg. Web request timeouts must accommodate downloads; durable outbox tasks let cloud deletion continue in the worker after an interrupted web request.

## Code map

- `app/` contains pages and authenticated API routes; `components/` contains the creation form, storyboard editor, progress, library and video player.
- `lib/generation/` manages saved options, checkpoint validation, credits, queue intents, publishing and permanent deletion.
- `worker-entry.ts` starts the render/upload workers and outbox recovery; `lib/workers/` implements execution and `lib/stages/` implements each render stage.
- `lib/cinematic/` contains story planning, scene scripting, visual providers and render options; `lib/types/cinematic.ts` defines shared scene types.
- `lib/assets.ts`, `lib/storage.ts` and `lib/s3.ts` manage private media; `lib/server-auth.ts` and `lib/firebase-admin.ts` verify app identity.
- `prisma/` holds the schema and migrations; `scripts/` holds database/runtime utilities; `tests/` and component test files cover recovery and regressions.

## Database migrations

For an existing original installation, `npm run db:setup` saves a local schema/credit snapshot, baselines the existing tables and applies the additive migrations. The Prisma CLI now follows the same environment-file precedence as the app. Supabase migrations use session port 5432; use DIRECT_URL for a dedicated migration connection when needed. A successful `npx prisma migrate status` should report that the database is up to date.

Back up an existing database and review prisma/migrations before applying. The additive migration preserves balances and existing records. Historical jobs use legacy credit state so past charges are not guessed or refunded.

For a new database, run `npm run db:deploy`. For an existing original schema with no migration history, compare it with 20261010000000_initial/migration.sql, then baseline it with `npx prisma migrate resolve --applied 20261010000000_initial`. Preserve any existing Firebase migration history. Run `npm run db:deploy` for the remaining migrations. Do not reset production or use db:push as a production migration strategy.

New fields include saved options, render/approval revisions, execution leases and a versioned stage/scene manifest. New tables hold the credit ledger, transactional queue outbox and channel profiles.

## Resume generation

Checkpoints cover script, voice, visuals, assembly, captions and final storage, recording input/output hashes, attempts, timestamps, elapsed time and output references. Provider cost is recorded only when supplied. Scene speech, visuals and rendered clips are cached where practical.

Retry or **Resume generation** loads the saved instructions and approved revision, checks availability/checksums, skips valid completed work, and invalidates descendants of changed or missing outputs. The UI previews reused stages and where work will restart. Execution leases and queue versions prevent simultaneous renders. The worker reconciles interrupted jobs without requiring the browser to stay open.

FFmpeg restarts an incomplete stage or scene encode; arbitrary mid-encode continuation is not supported. **Start over** creates a separate generation.

Keep private jobs/ checkpoint objects at least 30 days if offering a 30-day resume window. The app does not automatically delete them. Remove conflicting seven-day bucket lifecycle policies. Keep final videos and uploaded references while projects remain available. Expired/missing objects require regeneration; the resume preview reports invalid stages.

To test recovery without paid services, run `npm test`. An isolated integration test fails assembly after script/speech/visual fixtures are saved, resumes the same job, and verifies those providers are not called again. Other tests fail each major stage and check invalidation, ownership, credits and publishing retries.

In the UI: open a failed/interrupted job from Dashboard or its progress page, click **Resume generation**, review reused stages and cost, then resume. No prompt re-entry is needed. Approve the storyboard first if waiting for review. Resolve a provider outage before its failed stage can succeed.

## Credits and submission

A new generation reserves one app credit. Debit, job and outbox commit together. Request keys deduplicate repeated submissions and conditional balance updates prevent overdrafts. Queue acknowledgment failures leave durable intents to reconcile rather than speculative refunds.

Automatic retries reuse the reservation. A terminal render failure refunds once. Manual resume re-reserves that refunded credit, disclosed before submission. Successful renders consume the reservation. Approving an edited/regenerated completed video reserves one further credit, including edits first saved as drafts. Replacement failures follow the same refund policy. Upload retries do not charge a generation credit or re-render. External provider billing can still accrue for repeated work. The pilot has a fixed allowance and no payment checkout.

## Private storage and YouTube

S3 stores checkpoints/user uploads. Final videos use Supabase Storage when configured, with S3 fallback. Keep Supabase's videos bucket private and S3 public access blocked. lib/assets.ts routes verification, reads, downloads and signed playback URLs by provider. App privacy is independent of YouTube visibility.

Enable YouTube Data API v3. Configure a Web OAuth client with exact callback `APP_URL/api/youtube/callback`. Supply GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET and a random 32-byte hex ENCRYPTION_KEY. Connect in Settings, grant offline authorization, then publish a completed render. State/PKCE validation, encrypted refresh tokens and disconnect operate independently of Firebase login. Configure Google OAuth consent test users or verification as your project requires.

Publishing has a separate queue/error state. Retry reuses the rendered cloud asset and existing remote IDs. A crash after YouTube accepts an upload but before its ID is stored can require manual duplicate reconciliation; remote exactly-once delivery is not guaranteed.

## Editing and product features

Storyboard editing covers narration, timing, captions, source passages, media replacement, diagrams, scene order/removal and selected voice/visual regeneration. Saving is rejected during active generation or a revision conflict while edits remain in the open editor. Unchanged scene inputs reuse valid caches.

Native 16:9/9:16, 720p/1080p and 24/30 FPS reach rendering. Speech uses language-specific voices, measured scene durations and word boundaries. Caption presets, pronunciation overrides and licensed uploaded music with speech ducking are supported. Publication tools provide MP4, SRT/VTT, metadata, thumbnails, selected-scene Shorts and language variants linked to the parent. Shorts require editorial hook/framing review; translations require localization review.

Channel profiles supply reusable preferences and earlier episode titles to generation. Sources are pasted approved text with optional provenance URLs; URLs are labels, not automatic fetching. Scene passages must match source text. Unsupported scenes are flagged. Corrections can be applied across narration, captions and diagrams. These tools assist review and do not verify every factual claim. PDF/web ingestion, automatic semantic fact checking, voice cloning and animated character continuity are not implemented.

Stock is the default style. Generated illustration/anime requires a configured provider and does not imply consistent characters. Set GENERATED_VISUAL_ENDPOINT, optional bearer key/provider name, and estimated USD per second. The endpoint accepts JSON `{prompt, sceneIndex, duration, width, height}` and returns PNG/JPEG/WebP/MP4 bytes with correct Content-Type, within 180 seconds and 50 MB. Pricing remains an estimate unless actual provider cost is available.

## Verification and operations

Run `npm run typecheck`, `npm run lint`, `npm test` and `npm run build`. Tests use isolated PGlite PostgreSQL-compatible storage, local fake cloud/provider responses and actual FFmpeg fixture renders; they do not modify your production DB or publish videos. Live Firebase/YouTube/provider integration needs a configured staging smoke test.

Hosted Redis should use TLS; certificate validation is enabled. Submission limits use the database and do not silently bypass errors. Monitor outbox backlog, worker errors, disk use and bucket retention. Keep credentials out of source control. Avoid logging raw prompts and tokens.

Channel profiles can also store approved uploaded image/video references. Select a saved reference for each storyboard scene to use those exact bytes in rendering; automatic generated character continuity remains unsupported.

Groq 429 responses now honor Retry-After (or the provider's retry delay), add a safety margin, and retry up to five times within a bounded waiting budget. A verified story-plan sub-checkpoint is saved before narration so a later failure does not repeat planning. Persistent/day-long limits pause with Resume generation guidance; creating another key does not increase an organization quota.

Downloads verify that the stored file exists, then issue a five-minute encrypted ticket for a same-origin attachment endpoint. The server streams the video rather than buffering it. If an automatic download is blocked, use the visible Save MP4 link; prepare a new link after expiry. Hosting must allow the connection to remain open for the file transfer.

Video cards include Delete video with a confirmation. Deletion moves the record to recoverable Trash, hides it from generation/download/publishing endpoints, and preserves stored assets, credits, downloaded copies and existing YouTube publications. Use Trash → Restore video to recover it. Active generation/upload jobs must finish before deletion. Playback pins the current asset URL across dashboard refreshes; expired URLs renew from the saved position without restarting at zero.

Trash cards also include **Delete permanently**. After irreversible confirmation, the app deletes the cloud final video, subtitles, dedicated thumbnail, and all render attempts/checkpoints under that project's exact S3/Supabase namespaces, then removes the Video record. S3 versions and delete markers are included. The S3 worker identity needs `s3:ListBucket`, `s3:ListBucketVersions`, `s3:GetObject`, `s3:DeleteObject`, and `s3:DeleteObjectVersion`; retention locks or missing permissions leave cleanup pending instead of reporting success. Supabase uses the existing service-role storage client. No additional schema migration is needed.

Cleanup is recorded in the durable JobOutbox before any file is removed and retried by `npm run worker` after interrupted requests or storage failures. Once permanent deletion starts, Restore is disabled. Shared source clips referenced by other projects/profiles remain available and their cleanup is deferred until the last reference is removed; reusable uploaded sources and music are retained. Finish or delete an unfinished translation that still needs the original storyboard first. Credits/credit ledger, existing YouTube publications and downloaded local copies are preserved. Failed cleanup appears in Trash with a retry button.
