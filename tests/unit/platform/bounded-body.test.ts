import { describe, expect, it, vi } from "vitest";

import {
  DEFAULT_MAX_BODY_BYTES,
  readBoundedText,
} from "@/platform/http/bounded-body";
import type { BoundedBodyError } from "@/platform/http/bounded-body";

type StreamingRequestInit = RequestInit & { readonly duplex: "half" };

function postRequest(body: BodyInit, headers?: HeadersInit): Request {
  const init: StreamingRequestInit = {
    method: "POST",
    body,
    duplex: "half",
    ...(headers === undefined ? {} : { headers }),
  };
  return new Request("http://localhost/api/ingestion/v1/listing-batches", init);
}

async function expectBodyError(
  promise: Promise<unknown>,
  code: "PAYLOAD_TOO_LARGE" | "INVALID_BODY",
  maxBytes: number,
): Promise<void> {
  await expect(promise).rejects.toMatchObject({
    name: "BoundedBodyError",
    code,
    maxBytes,
  } satisfies Partial<BoundedBodyError>);
}

describe("readBoundedText", () => {
  it("rejects a declared body above the limit before reading it", async () => {
    const cancel = vi.fn();
    const stream = new ReadableStream<Uint8Array>({ cancel });
    const request = postRequest(stream, { "Content-Length": "9" });

    await expectBodyError(
      readBoundedText(request, { maxBytes: 8 }),
      "PAYLOAD_TOO_LARGE",
      8,
    );
    expect(cancel).toHaveBeenCalledOnce();
  });

  it("counts streamed bytes and cancels when the actual body exceeds the limit", async () => {
    const cancel = vi.fn();
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array([1, 2, 3, 4, 5]));
      },
      cancel,
    });

    await expectBodyError(
      readBoundedText(postRequest(stream), { maxBytes: 4 }),
      "PAYLOAD_TOO_LARGE",
      4,
    );
    expect(cancel).toHaveBeenCalledOnce();
  });

  it.each(["-1", "1.5", "1, 2", "not-a-number"])(
    "rejects malformed Content-Length %s",
    async (contentLength) => {
      await expectBodyError(
        readBoundedText(postRequest("x", { "Content-Length": contentLength }), {
          maxBytes: 8,
        }),
        "INVALID_BODY",
        8,
      );
    },
  );

  it("rejects invalid UTF-8 instead of replacement-decoding it", async () => {
    const request = postRequest(new Uint8Array([0xc3, 0x28]));

    await expectBodyError(
      readBoundedText(request, { maxBytes: 8 }),
      "INVALID_BODY",
      8,
    );
  });

  it("accepts an exact one-mebibyte UTF-8 body", async () => {
    const text = "a".repeat(DEFAULT_MAX_BODY_BYTES);
    const request = postRequest(text, {
      "Content-Length": String(DEFAULT_MAX_BODY_BYTES),
    });

    await expect(readBoundedText(request)).resolves.toBe(text);
  });
});
