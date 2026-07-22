import { beforeEach, describe, expect, it, vi } from "vitest";

const provider = vi.hoisted(() => ({ upload: vi.fn() }));

vi.mock("@vercel/blob/client", () => provider);

const { classifyPhotoUploadError, PhotoUploadError, uploadPrivateMedia } =
  await import("@/modules/media/client/upload");

describe("browser Blob client adapter", () => {
  beforeEach(() => vi.clearAllMocks());

  it("uses the same-origin token exchange without exposing a store token", async () => {
    provider.upload.mockImplementation(
      async (
        pathname: string,
        _file: File,
        options: { onUploadProgress: (value: unknown) => void },
      ) => {
        options.onUploadProgress({ loaded: 4, total: 4, percentage: 100 });
        return { pathname };
      },
    );
    const progress = vi.fn();
    const file = new File([Uint8Array.of(1, 2, 3, 4)], "fixture.jpg", {
      type: "image/jpeg",
    });

    await expect(
      uploadPrivateMedia({
        pathname: "preview/event-a/reservation-a/source.bin",
        file,
        handleUploadUrl: "/api/events/event-a/photos/upload",
        clientPayload: "bounded-correlation",
        contentType: "image/jpeg",
        abortSignal: new AbortController().signal,
        onProgress: progress,
      }),
    ).resolves.toEqual({
      pathname: "preview/event-a/reservation-a/source.bin",
    });

    expect(provider.upload).toHaveBeenCalledWith(
      "preview/event-a/reservation-a/source.bin",
      file,
      expect.objectContaining({
        access: "private",
        handleUploadUrl: "/api/events/event-a/photos/upload",
        contentType: "image/jpeg",
      }),
    );
    const options = provider.upload.mock.calls[0]?.[2] as Record<
      string,
      unknown
    >;
    expect(options).not.toHaveProperty("token");
    expect(options).not.toHaveProperty("headers.Authorization");
    expect(progress).toHaveBeenCalledWith(100);
  });

  it.each([
    {
      error: new Error("Failed to retrieve the client token"),
      policyBlocked: false,
      code: "TOKEN_PERMISSION_FAILED",
      message: "Upload permission failed",
    },
    {
      error: new DOMException("The request was aborted.", "AbortError"),
      policyBlocked: false,
      code: "TRANSFER_ABORTED",
      message: "Blob transfer was canceled",
    },
    {
      error: new TypeError("Failed to fetch"),
      policyBlocked: false,
      code: "TRANSFER_FAILED",
      message: "Blob transfer failed",
    },
    {
      error: new TypeError("Failed to fetch"),
      policyBlocked: true,
      code: "POLICY_BLOCKED",
      message: "browser security policy",
    },
  ])("classifies $code failures without provider details", (testCase) => {
    const result = classifyPhotoUploadError(
      testCase.error,
      testCase.policyBlocked,
    );

    expect(result).toBeInstanceOf(PhotoUploadError);
    expect(result.code).toBe(testCase.code);
    expect(result.message).toContain(testCase.message);
    expect(result.message).not.toContain("Failed to fetch");
  });
});
