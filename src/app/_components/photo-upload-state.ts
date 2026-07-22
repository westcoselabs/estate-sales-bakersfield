export interface PhotoBatchOutcome {
  readonly succeeded: number;
  readonly failed: number;
  readonly hadReadyPhotos: boolean;
  readonly hadReadyCover: boolean;
  readonly hasReadyCover: boolean;
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
