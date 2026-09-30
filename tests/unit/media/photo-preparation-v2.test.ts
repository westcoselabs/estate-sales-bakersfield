import { afterEach, describe, expect, it, vi } from "vitest";
import {
  assertPhotoDimensions,
  detectPhotoFormat,
  encodeListingPhoto,
  inspectPhoto,
} from "@/modules/media/client/photo-preparation-core";
import { createPhotoPreparer } from "@/modules/media/client/photo-preparer";

function heic(): File {
  const bytes = new Uint8Array(24);
  new DataView(bytes.buffer).setUint32(0, 24);
  bytes.set(new TextEncoder().encode("ftypheic"), 4);
  bytes.set(new TextEncoder().encode("mif1heic"), 16);
  return new File([bytes], "iphone.HEIF", { type: "" });
}

afterEach(() => vi.unstubAllGlobals());

describe("listing photo normalization", () => {
  it("recognizes HEIF contents with an empty or misleading MIME and rejects AVIF", async () => {
    await expect(inspectPhoto(heic())).resolves.toBe("image/heic");
    await expect(
      inspectPhoto(new File([heic()], "wrong.png", { type: "image/png" })),
    ).resolves.toBe("image/heic");
    const bytes = new Uint8Array(await heic().arrayBuffer());
    bytes.set(new TextEncoder().encode("avif"), 8);
    expect(detectPhotoFormat(bytes)).toBeNull();
    await expect(
      inspectPhoto(
        new File(["not an image"], "photo.heic", { type: "image/heic" }),
      ),
    ).rejects.toThrow("not a supported photo");
  });

  it("rejects unsafe pixel counts and source sizes", async () => {
    expect(() => assertPhotoDimensions(100_000, 100_000)).toThrow(
      "50-megapixel",
    );
    expect(() => assertPhotoDimensions(0, 20)).toThrow();
    expect(() => assertPhotoDimensions(8000, 6000)).not.toThrow();
    await expect(inspectPhoto(new File([], "empty.heic"))).rejects.toThrow(
      "15 MB",
    );
  });

  it("bounds encoding attempts, dimensions, transparency, and releases canvas buffers", async () => {
    const surfaces: { width: number; height: number }[] = [];
    const draw = vi.fn();
    const encodes: { type: string; quality: number }[] = [];
    vi.stubGlobal(
      "OffscreenCanvas",
      class {
        constructor(
          public width: number,
          public height: number,
        ) {
          surfaces.push(this);
        }
        getContext() {
          return { drawImage: draw };
        }
        async convertToBlob(options: { type: string; quality: number }) {
          encodes.push(options);
          return new Blob(
            [new Uint8Array(encodes.length < 3 ? 900_000 : 100_000)],
            { type: options.type },
          );
        }
      },
    );
    const result = await encodeListingPhoto(
      {} as CanvasImageSource,
      4000,
      3000,
      "image/png",
    );
    expect(result).toMatchObject({ width: 1600, height: 1200 });
    expect(result.blob.type).toBe("image/webp");
    expect(encodes.slice(0, 3).map((value) => value.quality)).toEqual([
      0.82, 0.76, 0.76,
    ]);
    expect(draw.mock.calls.map((call) => call.slice(3))).toEqual([
      [2048, 1536],
      [2048, 1536],
      [1600, 1200],
      [160, 120],
    ]);
    expect(
      surfaces.every((surface) => surface.width === 0 && surface.height === 0),
    ).toBe(true);
  });

  it("never returns an original HEIC when decoding fails", async () => {
    vi.stubGlobal(
      "Worker",
      class {
        constructor() {
          throw new Error("Worker unavailable");
        }
      },
    );
    vi.stubGlobal(
      "Image",
      class {
        constructor() {
          throw new Error("Native decoder unavailable");
        }
      },
    );
    const preparer = createPhotoPreparer();
    await expect(
      preparer.prepare(heic(), new AbortController().signal),
    ).rejects.toThrow();
    preparer.dispose();
  });

  it("does not restart compression in another decoder after encoding reaches its limit", async () => {
    const image = vi.fn();
    const postMessage = vi.fn();
    vi.stubGlobal("Image", image);
    vi.stubGlobal(
      "Worker",
      class {
        onmessage?: (event: { data: { error: string; stage: string } }) => void;
        terminate() {}
        postMessage() {
          postMessage();
          queueMicrotask(() =>
            this.onmessage?.({
              data: { error: "Prepared image exceeds 2 MiB", stage: "prepare" },
            }),
          );
        }
      },
    );
    const preparer = createPhotoPreparer();
    await expect(
      preparer.prepare(heic(), new AbortController().signal),
    ).rejects.toThrow("2 MiB");
    expect(image).not.toHaveBeenCalled();
    expect(postMessage).toHaveBeenCalledOnce();
    preparer.dispose();
  });

  it("terminates active worker work on cancellation", async () => {
    const terminate = vi.fn();
    const postMessage = vi.fn();
    vi.stubGlobal(
      "Worker",
      class {
        terminate = terminate;
        postMessage = postMessage;
      },
    );
    const preparer = createPhotoPreparer();
    const controller = new AbortController();
    const pending = preparer.prepare(heic(), controller.signal);
    await vi.waitFor(() => expect(postMessage).toHaveBeenCalledOnce());
    controller.abort();
    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
    expect(terminate).toHaveBeenCalledOnce();
  });
});
