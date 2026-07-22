import { describe, expect, it } from "vitest";

import { photoBatchSummary } from "@/app/_components/photo-upload-state";

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
});
