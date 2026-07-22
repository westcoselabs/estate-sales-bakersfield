import {
  getPayloadFromClientToken,
  type HandleUploadBody,
} from "@vercel/blob/client";
import { describe, expect, it } from "vitest";

import { handleVercelClientUpload } from "@/modules/media";

describe("Vercel Blob supported client-token flow", () => {
  it("uses handleUpload to issue a bounded private-upload client token", async () => {
    const pathname = "preview/event-event-id/reservation-id/source-fixture.jpg";
    const body: HandleUploadBody = {
      type: "blob.generate-client-token",
      payload: {
        pathname,
        multipart: false,
        clientPayload: JSON.stringify({ reservationId: "opaque" }),
      },
    };

    const result = await handleVercelClientUpload({
      request: new Request(
        "https://preview.example.test/api/events/event-id/photos/upload",
        { method: "POST" },
      ),
      body,
      token: "vercel_blob_rw_fixture_test-secret-value",
      authorize: async (requestedPathname) => {
        expect(requestedPathname).toBe(pathname);
        return {
          contentType: "image/jpeg",
          maximumSizeInBytes: 15 * 1024 * 1024,
          expiresAt: new Date(Date.now() + 60_000),
        };
      },
    });

    expect(result.type).toBe("blob.generate-client-token");
    if (result.type !== "blob.generate-client-token") return;
    expect(result.clientToken).toMatch(/^vercel_blob_client_fixture_/);
    expect(result.clientToken).not.toContain("test-secret-value");
    expect(getPayloadFromClientToken(result.clientToken)).toMatchObject({
      pathname,
      allowedContentTypes: ["image/jpeg"],
      maximumSizeInBytes: 15 * 1024 * 1024,
      addRandomSuffix: false,
      allowOverwrite: false,
    });
  });
});
