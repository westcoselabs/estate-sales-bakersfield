import { describe, expect, it } from "vitest";

import {
  photoBatchSummary,
  photoUploadTimeoutMs,
} from "@/app/_components/photo-upload-state";

describe("photo upload timeout", () => {
  it("uses a two-minute minimum for small files", () => {
    expect(photoUploadTimeoutMs(128 * 1024)).toBe(120_000);
  });

  it("allows a 15 MB file four and a half minutes", () => {
    expect(photoUploadTimeoutMs(15 * 1024 * 1024)).toBe(270_000);
  });

  it("keeps invalid and unexpectedly large inputs bounded", () => {
    expect(photoUploadTimeoutMs(-1)).toBe(120_000);
    expect(photoUploadTimeoutMs(Number.MAX_SAFE_INTEGER)).toBe(480_000);
  });
});

describe("photo upload batch summaries", () => {
  it("reports all success from READY outcomes", () => {
    expect(
      photoBatchSummary({
        succeeded: 3,
        failed: 0,
        hadReadyPhotos: false,
        hadReadyCover: false,
        hasReadyCover: false,
      }),
    ).toBe("3 photos uploaded successfully. Select a cover photo to continue.");
  });

  it("reports partial success with accurate counts", () => {
    expect(
      photoBatchSummary({
        succeeded: 2,
        failed: 1,
        hadReadyPhotos: false,
        hadReadyCover: false,
        hasReadyCover: false,
      }),
    ).toBe(
      "2 photos uploaded successfully. 1 photo failed. You can retry the failed photo.",
    );
  });

  it("does not use success language when every new file fails", () => {
    expect(
      photoBatchSummary({
        succeeded: 0,
        failed: 2,
        hadReadyPhotos: false,
        hadReadyCover: false,
        hasReadyCover: false,
      }),
    ).toBe("No photos were uploaded. Review the errors below and retry.");
  });

  it("preserves authoritative existing READY cover messaging", () => {
    expect(
      photoBatchSummary({
        succeeded: 0,
        failed: 1,
        hadReadyPhotos: true,
        hadReadyCover: true,
        hasReadyCover: true,
      }),
    ).toBe(
      "The new upload failed. Your existing cover and ready photos are unchanged.",
    );
  });

  it("keeps ambiguous server processing distinct from a retryable failure", () => {
    expect(
      photoBatchSummary({
        succeeded: 1,
        failed: 1,
        pending: 2,
        hadReadyPhotos: false,
        hadReadyCover: false,
        hasReadyCover: false,
      }),
    ).toBe(
      "1 photo uploaded successfully. 1 photo failed. 2 photos are still being confirmed by the server. Reload before taking another action; retry is disabled to prevent duplicates.",
    );
  });
});
