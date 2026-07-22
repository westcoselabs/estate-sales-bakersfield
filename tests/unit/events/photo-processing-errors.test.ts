import { afterEach, describe, expect, it, vi } from "vitest";

import { eventApiError } from "@/app/api/events/_shared";
import { PhotoProcessingError } from "@/modules/events/domain/errors";
import { logger } from "@/platform/observability/logger";

const request = new Request(
  "https://application.example.test/api/events/event-id/photos/photo-id/finalize",
  { headers: { "x-request-id": "photo-processing-request" } },
);

afterEach(() => {
  vi.restoreAllMocks();
});

describe("photo processing API errors", () => {
  it("logs a safe request-correlated stage without exposing the internal cause", async () => {
    const warn = vi.spyOn(logger, "warn").mockImplementation(() => undefined);
    const error = new PhotoProcessingError(
      "The image could not be processed safely.",
      "image_decode",
      { cause: new Error("sensitive native runtime detail") },
    );

    const response = eventApiError(error, request, "events.finalize-photo");

    expect(response.status).toBe(422);
    await expect(response.json()).resolves.toEqual({
      error: "The image could not be processed safely.",
      requestId: "photo-processing-request",
    });
    expect(warn).toHaveBeenCalledWith(
      {
        requestId: "photo-processing-request",
        operation: "events.finalize-photo",
        errorType: "PhotoProcessingError",
        processingStage: "image_decode",
      },
      "Event photo processing failed",
    );
    expect(JSON.stringify(warn.mock.calls)).not.toContain(
      "sensitive native runtime detail",
    );
  });
});
