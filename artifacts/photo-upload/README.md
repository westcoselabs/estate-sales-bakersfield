# Photo upload improvements

Local measurements from September 15, 2026. These use representative fixtures, not the user's original 80 photos. Network transfer, storage-provider latency, and database time are excluded from the benchmarks.

| Check                                         | Before          | After         |
| --------------------------------------------- | --------------- | ------------- |
| Representative 12 MP JPEG sent by the browser | 4,217,115 bytes | 386,222 bytes |
| Server image work for 80 synthetic photos     | 62.36 seconds   | 35.50 seconds |
| Peak server-process memory during that run    | 276 MiB         | 210 MiB       |

Preparing 80 copies of the representative browser fixture took 16.77 seconds. Browser preparation preserves the full image, correct orientation, and transparency where supported; unsuitable or ineffective conversions retain the original file. The server still validates and strips metadata. Actual upload time depends on the images, device, connection, and providers.

- [Browser preparation measurements](../photo-preparation/benchmark.json)
- [Browser visual comparison](../photo-preparation/representative-photo-comparison.png)
- [Server baseline](server-before-80.json)
- [Server improved](server-after-80.json)
- [Mobile cover fit check](cover-mobile.png)
- [Desktop cover fit check](cover-desktop.png)

The server benchmark is reproducible using `scripts/benchmark-image-processing.ts`. Its four fixtures cover landscape, EXIF portrait, 48 MP input, and a smaller image. Full uncropped cover output increased combined output bytes by about 8%; the faster encoder keeps the existing quality settings.

The builder keeps up to three file pipelines active, shows each completed photo immediately, allows review while uploads continue, and requires the builder page to remain open. Approval waits for pending photos. Busy finalization retries reuse the transferred file; failed or interrupted uploads can be retried or removed.

## Verification

- 584 unit and image-contract tests passed.
- 14 event-builder and resource-limit integration tests passed in an isolated Development database schema.
- Browser checks passed for the existing approval/reapproval journey, payment/publication journey, and the new background-upload journey.
- The new browser journey verified actual file-size reduction, independent completion while a transfer is held, automatic busy retry without retransferring, preserved unsaved edits, transfer-failure retry, orphan removal after reload, and approval gating. Its cover screenshot also passed a check that all four colored source edges remained visible.
- TypeScript, scoped lint, formatting, and dependency-boundary checks passed.

These changes have not been deployed.
