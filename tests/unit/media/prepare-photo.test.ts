import { afterEach, describe, expect, it, vi } from "vitest";

import {
  photoHeaderDimensions,
  preparePhotoForUpload,
} from "@/modules/media/client/prepare-photo";

function jpegFile(width = 4000, height = 3000, size = 2 * 1024 * 1024): File {
  const bytes = new Uint8Array(size);
  bytes.set([
    0xff,
    0xd8,
    0xff,
    0xc0,
    0,
    17,
    8,
    height >> 8,
    height & 255,
    width >> 8,
    width & 255,
    3,
    1,
    0x11,
    0,
    2,
    0x11,
    0,
    3,
    0x11,
    0,
  ]);
  return new File([bytes], "family-sale.jpeg", {
    type: "image/jpeg",
    lastModified: 100,
  });
}

function mockCanvas(outputBytes = 200_000) {
  const drawImage = vi.fn();
  const encode = vi.fn(
    async (options: { type: string; quality: number }) =>
      new Blob([new Uint8Array(outputBytes)], { type: options.type }),
  );
  const instances: { width: number; height: number }[] = [];
  vi.stubGlobal(
    "OffscreenCanvas",
    class {
      constructor(
        public width: number,
        public height: number,
      ) {
        instances.push(this);
      }
      getContext() {
        return { drawImage };
      }
      convertToBlob = encode;
    },
  );
  return { drawImage, encode, instances };
}

afterEach(() => vi.unstubAllGlobals());

describe("browser photo preparation", () => {
  it("shrinks a phone photo to 2400px with bounded JPEG quality and accurate upload metadata", async () => {
    const close = vi.fn();
    const bitmap = { width: 4000, height: 3000, close };
    const decode = vi.fn(async () => bitmap);
    vi.stubGlobal("createImageBitmap", decode);
    const canvas = mockCanvas();
    const original = jpegFile();
    const result = await preparePhotoForUpload(original);
    expect(decode).toHaveBeenCalledWith(original, {
      imageOrientation: "from-image",
    });
    expect(canvas.drawImage).toHaveBeenCalledWith(bitmap, 0, 0, 2400, 1800);
    expect(canvas.encode).toHaveBeenCalledWith({
      type: "image/jpeg",
      quality: 0.86,
    });
    expect(result).toMatchObject({
      optimized: true,
      originalBytes: original.size,
      preparedBytes: 200_000,
      width: 2400,
      height: 1800,
    });
    expect(result.file.name).toBe("family-sale.jpg");
    expect(result.file.type).toBe("image/jpeg");
    expect(result.file.lastModified).toBe(100);
    expect(close).toHaveBeenCalledOnce();
    expect(canvas.instances[0]).toMatchObject({ width: 0, height: 0 });
  });

  it("uses decoded orientation and never enlarges an image", async () => {
    vi.stubGlobal(
      "createImageBitmap",
      vi.fn(async () => ({ width: 900, height: 1600, close: vi.fn() })),
    );
    const canvas = mockCanvas();
    const result = await preparePhotoForUpload(jpegFile(1600, 900));
    expect(result).toMatchObject({ width: 900, height: 1600 });
    expect(canvas.drawImage).toHaveBeenCalledWith(
      expect.anything(),
      0,
      0,
      900,
      1600,
    );
  });

  it("retains the original when output saves too few bytes and releases decoded memory", async () => {
    const close = vi.fn();
    vi.stubGlobal(
      "createImageBitmap",
      vi.fn(async () => ({ width: 4000, height: 3000, close })),
    );
    const original = jpegFile();
    mockCanvas(original.size - 50_000);
    const result = await preparePhotoForUpload(original);
    expect(result.file).toBe(original);
    expect(result.optimized).toBe(false);
    expect(close).toHaveBeenCalledOnce();
  });

  it("skips HEIC, already small files, malformed headers, and exceptionally large sources before decoding", async () => {
    const decode = vi.fn();
    vi.stubGlobal("createImageBitmap", decode);
    for (const original of [
      new File([new Uint8Array(700_000)], "phone.heic", { type: "image/heic" }),
      jpegFile(900, 600, 100_000),
      jpegFile(12000, 9000),
      new File([new Uint8Array(700_000)], "broken.jpeg", {
        type: "image/jpeg",
      }),
    ]) {
      expect((await preparePhotoForUpload(original)).file).toBe(original);
    }
    expect(decode).not.toHaveBeenCalled();
  });

  it("falls back to the original on a browser decoding or encoding failure", async () => {
    const original = jpegFile();
    vi.stubGlobal(
      "createImageBitmap",
      vi.fn(async () => {
        throw new Error("unsupported");
      }),
    );
    expect((await preparePhotoForUpload(original)).file).toBe(original);
    const close = vi.fn();
    vi.stubGlobal(
      "createImageBitmap",
      vi.fn(async () => ({ width: 4000, height: 3000, close })),
    );
    const canvas = mockCanvas();
    canvas.encode.mockRejectedValue(new Error("encoder failed"));
    expect((await preparePhotoForUpload(original)).file).toBe(original);
    expect(close).toHaveBeenCalledOnce();
    expect(canvas.instances[0]).toMatchObject({ width: 0, height: 0 });
  });

  it("preserves PNG alpha by encoding to WebP and falls back if the browser cannot do so", async () => {
    const bytes = new Uint8Array(700_000);
    const view = new DataView(bytes.buffer);
    view.setUint32(0, 0x89504e47);
    view.setUint32(12, 0x49484452);
    view.setUint32(16, 4000);
    view.setUint32(20, 3000);
    const original = new File([bytes], "transparent.png", {
      type: "image/png",
    });
    vi.stubGlobal(
      "createImageBitmap",
      vi.fn(async () => ({ width: 4000, height: 3000, close: vi.fn() })),
    );
    const canvas = mockCanvas();
    const result = await preparePhotoForUpload(original);
    expect(result.file.type).toBe("image/webp");
    expect(result.file.name).toBe("transparent.webp");
    canvas.encode.mockResolvedValue(
      new Blob([new Uint8Array(100_000)], { type: "image/png" }),
    );
    expect((await preparePhotoForUpload(original)).file).toBe(original);
  });

  it("serializes decoding for a concurrently submitted batch", async () => {
    let active = 0;
    let maximum = 0;
    const decode = vi.fn(async () => {
      active += 1;
      maximum = Math.max(maximum, active);
      return {
        width: 4000,
        height: 3000,
        close: () => {
          active -= 1;
        },
      };
    });
    vi.stubGlobal("createImageBitmap", decode);
    mockCanvas();
    const results = await Promise.all(
      Array.from({ length: 5 }, () => preparePhotoForUpload(jpegFile())),
    );
    expect(results.every((result) => result.optimized)).toBe(true);
    expect(maximum).toBe(1);
    expect(active).toBe(0);
  });

  it("cancels queued work without starting another decoder, and closes an aborted in-flight bitmap", async () => {
    const firstController = new AbortController();
    const secondController = new AbortController();
    const close = vi.fn();
    let finishDecode: (bitmap: {
      width: number;
      height: number;
      close: () => void;
    }) => void = () => {};
    const decode = vi.fn(
      () =>
        new Promise<{ width: number; height: number; close: () => void }>(
          (resolve) => {
            finishDecode = resolve;
          },
        ),
    );
    vi.stubGlobal("createImageBitmap", decode);
    mockCanvas();
    const first = preparePhotoForUpload(jpegFile(), {
      signal: firstController.signal,
    });
    await vi.waitFor(() => expect(decode).toHaveBeenCalledOnce());
    const second = preparePhotoForUpload(jpegFile(), {
      signal: secondController.signal,
    });
    secondController.abort();
    await expect(second).rejects.toMatchObject({ name: "AbortError" });
    firstController.abort();
    finishDecode({ width: 4000, height: 3000, close });
    await expect(first).rejects.toMatchObject({ name: "AbortError" });
    expect(close).toHaveBeenCalledOnce();
    expect(decode).toHaveBeenCalledOnce();
  });
});

describe("bounded photo header inspection", () => {
  it("reads JPEG dimensions and rejects truncated segment data", async () => {
    const bytes = new Uint8Array(await jpegFile().slice(0, 100).arrayBuffer());
    expect(photoHeaderDimensions(bytes, "image/jpeg")).toEqual({
      width: 4000,
      height: 3000,
    });
    expect(photoHeaderDimensions(bytes.slice(0, 8), "image/jpeg")).toBeNull();
  });

  it("reads extended WebP dimensions and excludes animation", () => {
    const bytes = new Uint8Array(30);
    const view = new DataView(bytes.buffer);
    view.setUint32(0, 0x52494646);
    view.setUint32(8, 0x57454250);
    view.setUint32(12, 0x56503858);
    view.setUint32(16, 10, true);
    bytes.set([0x9f, 0x0f, 0], 24);
    bytes.set([0xb7, 0x0b, 0], 27);
    expect(photoHeaderDimensions(bytes, "image/webp")).toEqual({
      width: 4000,
      height: 3000,
    });
    bytes[20] = 2;
    expect(photoHeaderDimensions(bytes, "image/webp")).toBeNull();
  });
});
