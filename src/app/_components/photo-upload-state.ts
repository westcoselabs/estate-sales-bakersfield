export interface PhotoBatchOutcome {
  readonly succeeded: number;
  readonly failed: number;
  readonly hadReadyPhotos: boolean;
  readonly hadReadyCover: boolean;
  readonly hasReadyCover: boolean;
}

const MINIMUM_UPLOAD_TIMEOUT_MS = 120_000;
const MAXIMUM_UPLOAD_TIMEOUT_MS = 480_000;
const ASSUMED_MINIMUM_BYTES_PER_SECOND = 64 * 1024;
const UPLOAD_CONNECTION_OVERHEAD_MS = 30_000;

export function photoUploadTimeoutMs(sizeInBytes: number): number {
  const boundedSize = Math.max(0, Math.floor(sizeInBytes));
  const estimated =
    Math.ceil(boundedSize / ASSUMED_MINIMUM_BYTES_PER_SECOND) * 1_000 +
    UPLOAD_CONNECTION_OVERHEAD_MS;
  return Math.min(
    Math.max(estimated, MINIMUM_UPLOAD_TIMEOUT_MS),
    MAXIMUM_UPLOAD_TIMEOUT_MS,
  );
}

export function photoBatchSummary(outcome: PhotoBatchOutcome): string {
  const { succeeded, failed } = outcome;
  if (succeeded > 0 && failed === 0) {
    return `${String(succeeded)} ${succeeded === 1 ? "photo" : "photos"} uploaded successfully. ${outcome.hasReadyCover ? "Your ready cover remains selected." : "Select a cover photo to continue."}`;
  }
  if (succeeded > 0) {
    return `${String(succeeded)} ${succeeded === 1 ? "photo" : "photos"} uploaded successfully. ${String(failed)} ${failed === 1 ? "photo failed" : "photos failed"}. You can retry the failed ${failed === 1 ? "photo" : "photos"}.`;
  }
  if (outcome.hadReadyCover) {
    return "The new upload failed. Your existing cover and ready photos are unchanged.";
  }
  if (outcome.hadReadyPhotos) {
    return "The new upload failed. Your existing ready photos are still available.";
  }
  return "No photos were uploaded. Review the errors below and retry.";
}
