# Implementation and verification checklist

Implemented in the working tree; unrelated existing edits preserved. No deployment or external publishing performed.

- [x] One authoritative rendering pipeline; separate upload worker and durable cloud references
- [x] Versioned stage/scene checkpoints, checksum verification, retries and interruption recovery
- [x] Ownership-checked Resume / Start over APIs and UI; saved instructions and cost preview
- [x] Transactional credit reservations, idempotency, durable outbox and exactly-once refunds
- [x] Private provider-aware media access; YouTube OAuth state/PKCE, encrypted tokens and disconnect
- [x] Editable storyboard, approval revisions, scene previews and selective cache reuse
- [x] Language-aware speech, measured timing, boundary captions, pronunciation and SRT/VTT
- [x] Separate visual styles, bounded stock/generated providers, placeholders and uploaded media
- [x] Native formats, transitions, licensed music ducking and thumbnail choices
- [x] Auth readiness, browser drafts, preferences, progress and dashboard playback
- [x] Channel profiles including approved reference media; source passages/corrections and variants
- [x] 55 automated tests, including actual FFmpeg recovery, private Supabase streaming and migrations
- [x] TypeScript, production build and lint passed (zero lint errors/warnings)
- [x] README and environment template updated

## Remaining configuration and limits

- The configured app database was baselined and upgraded on 14 October 2026. Schema and credit balances were snapshotted first; balance comparison passed. Prisma migrate status reports up to date.
- Local persistent Redis replaces the unresolvable Upstash host via a local environment override. Database queries and both queues pass check:runtime; the worker is running. After a machine/WSL restart, run npm run local:redis and npm run worker. Live provider credentials/private buckets still need operational validation. No paid generation or YouTube upload was performed during these checks.
- Keep checkpoints for the offered resume window (documented 30-day recommendation); bucket retention is an operator responsibility.
- Browser automation blocked the final local UI visit by policy. Earlier development UI checks exercised the prompt form and sign-in redirect, but final visual/authenticated end-to-end testing is not claimed.
- Compatible dependency updates removed critical audit findings. The production audit still reports 23 advisories (15 high, 8 moderate), involving Firebase and Prisma/shadcn dependency trees. Major upgrades/downgrades need separate compatibility/security review; deployment readiness is not claimed.
- Source ingestion supports pasted/plain-text material, not PDF parsing or automatic URL fetching. Exact source quotations do not prove semantic factual accuracy.
- Localization and Shorts require human approval; no voice cloning, automatic semantic fact checking or generated character identity guarantee.
- Generated visuals require the optional provider adapter and configured cost estimate. Actual provider costs remain unavailable unless supplied.
- Captions use word boundaries when available and explicitly warn/fall back to measured scene timing when the speech provider lacks boundary data. Caption placement uses safe presets rather than arbitrary per-word positioning.
- YouTube upload cannot guarantee exactly-once remote creation if a process dies between remote acceptance and saving the returned ID; existing saved IDs prevent ordinary retry duplication.

## Reproduce resume acceptance

Run npm test for the deterministic isolated acceptance test: assembly is failed deliberately after script, voice and visuals succeed; the same job is resumed; those providers are called once and assembly is called twice, producing a verified playable MP4. The suite also fails each major checkpoint and checks missing/tampered outputs.

With configured services, open a failed/interrupted job on its progress page or dashboard, choose Resume generation, review the reused stages and credit cost, then confirm Resume generation. Saved instructions are loaded automatically. Approve a pending storyboard revision first. Start over remains a separate one-credit action.



Groq throttling fix: provider-directed retry delays, bounded automatic backoff, safe user-facing errors and a persisted story-plan sub-checkpoint. Tests verify Retry-After, message/reset fallbacks, exhaustion and planning reuse after a narration failure. No paid provider calls were made during verification.


Final storage fix: the configured Supabase videos bucket is now private. Supabase maximum-size responses (including string 413 and provider wording) correctly fall back to private S3. The user's approved video completed by resuming only storage. The final SHA-256 matches the captioned render, signed byte-range playback returns 206, anonymous access returns 403, and no additional app credit was charged. All 47 tests, TypeScript, lint and production build pass.


Download fix: authenticated preparation now verifies the object and creates an encrypted five-minute ticket. An app-domain endpoint streams video bytes with Content-Disposition attachment; both download buttons expose a direct Save MP4 fallback and no longer announce an unverified completed transfer. Tests cover exact streamed bytes, owner rejection, absent files and invalid/expired tickets. The two selected older videos were saved directly to the user's Downloads folder and verified as 1080p H.264/AAC MP4 files.


Library and playback update: recoverable Delete/Trash/Restore with ownership checks and active-job protection; deleted assets cannot be resumed, downloaded via app tickets, or published. Additive deletedAt migration applied with balances preserved. Playback sources stay stable across polling, and expiry recovery preserves current time and paused/playing state. All 55 tests pass. No actual user videos were deleted during verification.

Permanent deletion update: Trash cards now offer confirmed Delete permanently. Durable purge outbox tasks remove final videos, all checkpoint/render attempts, subtitles and dedicated thumbnails from Supabase/S3 (including S3 object versions), then remove the Video record. Interrupted cleanup stays in Trash, disables Restore and retries through the existing worker or manual retry. Shared source clips are retained until the final project/profile reference is removed; reusable uploads, ledger/credits, downloaded copies and YouTube publications are preserved. Unfinished translations protect their source storyboard. No schema change was required. All 61 tests, TypeScript, lint and production build pass. Live isolated text fixtures were uploaded/deleted and absence verified on both configured providers; existing user videos were untouched. Local database/Redis are ready, production/development servers and worker restarted.

