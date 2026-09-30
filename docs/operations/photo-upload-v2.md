# Photo upload v2

Status: implemented behind `PHOTO_UPLOAD_V2_PERCENT=0`. The 180-second iPhone acceptance gate is **not yet measured**. Do not describe the target as achieved based on desktop conversion or synthetic concurrency tests.

## Implementation verification — September 25, 2026

- 657 unit/Blob/image contract tests pass across 126 files.
- 16 photo database integration tests pass in isolated Development Neon schemas, including full-capacity cleanup/retry and legacy event-builder behavior.
- The background uploader Playwright journey passes with V2 enabled and disabled. It checks overlap, busy finalization, transfer retry, unsaved edits, cover display, and approval behavior; it is not a 150-photo speed test.
- Desktop Chromium passes 12 native JPEG and 12 software HEIC conversions under the worker CSP. The report explicitly records its limitations.
- Typecheck, lint, architecture checks, Prisma validation, production build/native Sharp trace verification, and production dependency audit pass.
- The broader integration run exposed three remaining failures outside the changed uploader: two `external_listings_lifecycle` constraint failures in listing-import/public-search tests, and a missing-token fixture failure in the authentication resend test. Those areas were not changed. The two photo failures from that initial run were corrected and the 16-test photo suite rerun successfully.

Only isolated test schemas were migrated. No production migration, deployment, account enrollment, or physical iPhone throughput measurement was performed.

## Behavior

The editor receives a stable account cohort decision from the server when it opens. Set `PHOTO_UPLOAD_V2_PERCENT` to an integer from 0 to 100; the default is 0. Existing open editors keep their chosen pipeline. The additive photo API accepts both pipelines, including the legacy `expectedVersion` field. Ordinary listing edits still use optimistic version checks.

V2 detects image contents, then tries native worker decoding, native image-element decoding, and finally a lazy, same-origin libheif-js 1.23.2 worker for HEIC/HEIF. Failed conversion never transfers the HEIC original. The first still marked primary is selected by the software decoder. Encoding draws to an sRGB canvas and removes source metadata. JPEG/HEIC become JPEG; PNG/WebP become WebP with alpha. Orientation and HDR-to-SDR appearance still require the device/fixture checks below.

The encoding ladder is 2048 pixels at 0.82, 2048 at 0.76, then 1600 at 0.76, without upscaling. Stop as soon as output is at most 800 KiB; reject output over 2 MiB after the third attempt. Source limits remain 15 MiB and 50 million pixels. The software path checks dimensions before allocating RGBA pixels. Native decoders can allocate before reporting dimensions; 48 MP memory behavior is a physical-device gate.

One preparation lane feeds four bounded prepared slots, four transfer lanes, and two finalization lanes. Eight slots cap transfers plus photos awaiting readiness. Short ordered reservation requests share the editor mutation queue; finalization does not. Previews use 160-pixel thumbnails. Ready rows release their local prepared file and thumbnail. Stopping a batch aborts requests and terminates its worker; already accepted server work can still finish. Keep Safari in the foreground. Closing the tab can require reselection.

Retries reuse `clientUploadId`, reservation, and prepared bytes. `GET /api/events/:eventId/photos/:photoId/transfer?reservationId=…` reconciles uncertain transfers using owner-scoped database state and storage HEAD before another transfer. A finalization `202` is polled through existing event reads. The UI only counts server `READY` as complete. Terminal failures after source deletion require cleanup and a fresh reservation, using the retained prepared file. V2 retry deletion requests `cleanupNow: true` on the existing DELETE route: it fences the old photo and completes storage cleanup before freeing its slot, with the durable purge retained as a fallback. This permits retry in a full 150-photo batch; ready photos cannot be removed by this retry path.

## Database and server changes

Deploy migration `20260925000100_photo_upload_pipeline` before deploying code that reads its columns. It adds a nullable client upload UUID, a reserved byte limit (legacy default 15 MiB), a processing attempt UUID, and event/client-upload uniqueness. No storage migration or processing cron is needed.

Reservation idempotency resolves before quota charging, and mismatched byte/type metadata is rejected. Authorization, source reads, and finalization enforce reserved bytes. Claims and readiness commits lock account then event in short transactions. Completion checks the photo, reservation, attempt, active lease, and editable lifecycle rather than a version captured before remote I/O. Workflow is recomputed from current state. Attempt-specific variant keys prevent one failure from deleting a sibling's variants. The four private sanitized variants and source-before-readiness deletion ordering remain.

The warm-runtime processing allowance is two when rollout is nonzero, one when disabled. The database account allowance remains two. Both cover storage and image processing; a busy request returns 429 with Retry-After. Setting the flag back to zero does not cancel active work or invalidate reservations.

## Checks

Use Development Neon credentials in `.env.local`; the repository test wrappers create, migrate, and remove isolated schemas. Never point these commands at Production.

```powershell
pnpm db:test:check
pnpm typecheck
pnpm lint
pnpm arch:check
pnpm exec vitest run --project unit --project blob-contract --project image-contract
pnpm test:integration
$env:TEST_PHOTO_UPLOAD_V2 = 'true'
pnpm test:e2e tests/e2e/background-photo-upload.spec.ts
Remove-Item Env:TEST_PHOTO_UPLOAD_V2
pnpm build
pnpm test:photos:browser C:/path/to/local-fixture.heic
```

The browser preparation command needs no database or uploads. It uses desktop Chromium, the real bundled worker under a strict CSP, one repeated synthetic JPEG, and optionally one repeated local HEIC. It writes `artifacts/photo-upload/v2-browser-check.json`, including the optional fixture hash. It is a decoder smoke check, not a throughput benchmark. The initial HEIC smoke fixture was libheif's [example.heic](https://github.com/strukturag/libheif/blob/master/examples/example.heic), hash `7f8b363e4936c0666a25f64f3a92fda10bd8e5453be4592530b65a55dd98f3f2`; the binary is not included in this change.

Database tests cover duplicate reservations, byte limits, full-batch quota admission, two concurrent finalizers alongside an edit and reservation, deletion/lease/attempt fences, and failure after source deletion. The browser journey checks upload overlap, a busy finalizer, transient transfer retry, cover selection, and unsaved edits. Run it with the switch unset too for legacy rollout coverage.

## Measurement and release gates

1. Confirm this repository's deployed commit and record the legacy 150-photo baseline. The connected Vercel project inspected during implementation belonged to a different repository, so it does not establish this application's live revision.
2. Apply the additive migration and backward-compatible API with the flag at 0. Validate private storage, legacy uploads, cleanup, and normal listing edits.
3. Enable V2 in the test environment. On physical iPhone 12 and a newer iPhone with Safari native HEIC support, run ten consecutive batches per device for **each** dataset: 150 distinct local HEIC photos and 150 mixed-format photos. Include portrait/landscape, fine detail, dark scenes, and some 48 MP images. Keep originals locally available before selection.
4. Shape actual uplink to sustained 10 Mbps with approximately 100 ms latency. Measure from the browser file-input event to the last server-confirmed READY. Require every valid photo to be ready within 180 seconds in every run; target at most 120 MiB of prepared payload per batch. Record device/iOS/Safari, revision, dataset hash, cold/warm worker state, counts, payload, elapsed time, retries, and memory/thermal observations. Picker/iCloud time before file delivery is excluded.
5. Visually compare primary still, rotation/mirroring, portrait orientation, SDR color, and transparency. Check stripped EXIF/GPS; corrupt files; misleading/empty MIME; source and pixel limits; reconnects; timeouts; cancellation; 429/5xx; lost responses; concurrent edits/deletion; and stable memory over 150 distinct images. Cold software-decoder loading, software-only devices, slower networks, and 48 MP-heavy batches need separate results and are not presumed to pass.
6. Advance production enrollment 10%, 50%, then 100% only after those gates pass and completion/failure rates, server memory, processing waits, and orphan cleanup remain acceptable relative to the baseline. Roll enrollment back to 0 if they regress. Keep additive schema/API support so in-flight and completed photos remain valid.

`events.photo-upload-batch` logs bounded authenticated summaries: selected/ready/failed/pending counts; original/prepared bytes; aggregate preparation, reservation, transfer, and finishing time; wall time; software decode count; transfer retries and reconciled outcomes. Aggregate stage time can exceed wall time because stages overlap. `events.finalize-photo-timing` provides server validation, source read, processing, variant write/verification, source deletion, and readiness commit durations. Existing API error logs record failures. Summaries contain no filenames, image contents, or location metadata. Summaries are best effort; tab closure can prevent delivery, so compare them with server readiness/error logs.
