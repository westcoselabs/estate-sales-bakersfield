/** Browser-only preparation; the server still validates and sanitizes every photo. */
const SUPPORTED_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const MINIMUM_SOURCE_BYTES = 512 * 1024;
const MAXIMUM_SOURCE_BYTES = 15 * 1024 * 1024;
const MAXIMUM_SOURCE_PIXELS = 50_000_000;
const MAXIMUM_EDGE = 2400;
const OUTPUT_QUALITY = 0.86;
const MINIMUM_BYTES_SAVED = 64 * 1024;
const MINIMUM_SAVINGS_RATIO = 0.15;
const HEADER_BYTES = 256 * 1024;

export interface PreparedPhotoUpload {
  readonly file: File;
  readonly optimized: boolean;
  readonly originalBytes: number;
  readonly preparedBytes: number;
  readonly width?: number;
  readonly height?: number;
}

interface Dimensions {
  readonly width: number;
  readonly height: number;
}

interface DecodedPhoto extends Dimensions {
  readonly source: CanvasImageSource;
  dispose(): void;
}

interface PreparationWaiter {
  readonly start: () => void;
}

// One decoded source at a time, even if the upload queue calls us concurrently.
let preparing = false;
const waiting: PreparationWaiter[] = [];

function abortError(): DOMException {
  return new DOMException("Photo preparation was canceled.", "AbortError");
}

function checkCanceled(signal?: AbortSignal): void {
  if (signal?.aborted) throw abortError();
}

function acquirePreparation(signal?: AbortSignal): Promise<() => void> {
  checkCanceled(signal);
  return new Promise((resolve, reject) => {
    const cancel = () => {
      const index = waiting.indexOf(waiter);
      if (index !== -1) waiting.splice(index, 1);
      reject(abortError());
    };
    const waiter: PreparationWaiter = {
      start() {
        signal?.removeEventListener("abort", cancel);
        preparing = true;
        resolve(() => {
          const next = waiting.shift();
          if (next) next.start();
          else preparing = false;
        });
      },
    };
    if (preparing) {
      waiting.push(waiter);
      signal?.addEventListener("abort", cancel, { once: true });
    } else waiter.start();
  });
}

function originalPhoto(file: File): PreparedPhotoUpload {
  return {
    file,
    optimized: false,
    originalBytes: file.size,
    preparedBytes: file.size,
  };
}

/** Read bounded headers before decoding; large/corrupt images use the original path. */
export function photoHeaderDimensions(
  bytes: Uint8Array,
  contentType: string,
): Dimensions | null {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (
    contentType === "image/png" &&
    bytes.length >= 24 &&
    view.getUint32(0) === 0x89504e47 &&
    view.getUint32(12) === 0x49484452
  ) {
    return { width: view.getUint32(16), height: view.getUint32(20) };
  }
  if (contentType === "image/jpeg" && bytes[0] === 0xff && bytes[1] === 0xd8) {
    let offset = 2;
    while (offset + 4 <= bytes.length) {
      if (bytes[offset] !== 0xff) return null;
      while (bytes[offset] === 0xff) offset += 1;
      const marker = bytes[offset++];
      if (marker === undefined || marker === 0xda || marker === 0xd9)
        return null;
      if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;
      if (offset + 2 > bytes.length) return null;
      const length = view.getUint16(offset);
      if (length < 2 || offset + length > bytes.length) return null;
      if (
        marker >= 0xc0 &&
        marker <= 0xcf &&
        ![0xc4, 0xc8, 0xcc].includes(marker) &&
        length >= 7
      ) {
        return {
          width: view.getUint16(offset + 5),
          height: view.getUint16(offset + 3),
        };
      }
      offset += length;
    }
  }
  if (
    contentType === "image/webp" &&
    bytes.length >= 30 &&
    view.getUint32(0) === 0x52494646 &&
    view.getUint32(8) === 0x57454250
  ) {
    const uint24 = (offset: number) =>
      bytes[offset]! + (bytes[offset + 1]! << 8) + (bytes[offset + 2]! << 16);
    let offset = 12;
    while (offset + 8 <= bytes.length) {
      const kind = view.getUint32(offset);
      const length = view.getUint32(offset + 4, true);
      const data = offset + 8;
      if (kind === 0x56503858 && length >= 10 && data + 10 <= bytes.length) {
        // Animated WebP is retained; flattening it would change the upload.
        if ((bytes[data]! & 0x02) !== 0) return null;
        return { width: uint24(data + 4) + 1, height: uint24(data + 7) + 1 };
      }
      if (
        kind === 0x56503820 &&
        length >= 10 &&
        data + 10 <= bytes.length &&
        bytes[data + 3] === 0x9d &&
        bytes[data + 4] === 0x01 &&
        bytes[data + 5] === 0x2a
      ) {
        return {
          width: view.getUint16(data + 6, true) & 0x3fff,
          height: view.getUint16(data + 8, true) & 0x3fff,
        };
      }
      if (
        kind === 0x5650384c &&
        length >= 5 &&
        data + 5 <= bytes.length &&
        bytes[data] === 0x2f
      ) {
        const packed = view.getUint32(data + 1, true);
        return {
          width: (packed & 0x3fff) + 1,
          height: ((packed >>> 14) & 0x3fff) + 1,
        };
      }
      offset = data + length + (length % 2);
    }
  }
  return null;
}

function safeDimensions(
  dimensions: Dimensions | null,
): dimensions is Dimensions {
  return Boolean(
    dimensions &&
    dimensions.width > 0 &&
    dimensions.height > 0 &&
    dimensions.width * dimensions.height <= MAXIMUM_SOURCE_PIXELS,
  );
}

async function decodePhoto(
  file: File,
  signal?: AbortSignal,
): Promise<DecodedPhoto> {
  if (typeof createImageBitmap === "function") {
    // Browser applies EXIF orientation before we read dimensions or draw.
    const bitmap = await createImageBitmap(file, {
      imageOrientation: "from-image",
    });
    if (signal?.aborted) {
      bitmap.close();
      throw abortError();
    }
    return {
      source: bitmap,
      width: bitmap.width,
      height: bitmap.height,
      dispose: () => bitmap.close(),
    };
  }
  if (typeof Image === "undefined" || typeof URL.createObjectURL !== "function")
    throw new Error("Image decoding is unavailable.");
  const source = new Image();
  source.decoding = "async";
  const url = URL.createObjectURL(file);
  try {
    await new Promise<void>((resolve, reject) => {
      const finish = (error?: Error) => {
        clearTimeout(timer);
        signal?.removeEventListener("abort", cancel);
        source.onload = null;
        source.onerror = null;
        if (error) reject(error);
        else resolve();
      };
      const cancel = () => finish(abortError());
      const timer = setTimeout(
        () => finish(new Error("Image decoding timed out.")),
        15_000,
      );
      source.onload = () => finish();
      source.onerror = () => finish(new Error("Image decoding failed."));
      signal?.addEventListener("abort", cancel, { once: true });
      source.src = url;
    });
    return {
      source,
      width: source.naturalWidth,
      height: source.naturalHeight,
      dispose() {
        source.src = "";
        URL.revokeObjectURL(url);
      },
    };
  } catch (error) {
    source.src = "";
    URL.revokeObjectURL(url);
    throw error;
  }
}

async function yieldToBrowser(signal?: AbortSignal): Promise<void> {
  await new Promise<void>((resolve) => setTimeout(resolve, 0));
  checkCanceled(signal);
}

async function encodePhoto(
  photo: DecodedPhoto,
  width: number,
  height: number,
  contentType: string,
  signal?: AbortSignal,
): Promise<Blob | null> {
  const canvas =
    typeof OffscreenCanvas === "function"
      ? new OffscreenCanvas(width, height)
      : typeof document !== "undefined"
        ? document.createElement("canvas")
        : null;
  if (!canvas) return null;
  canvas.width = width;
  canvas.height = height;
  try {
    const context = canvas.getContext("2d") as
      CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null;
    if (!context) return null;
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = "high";
    context.drawImage(photo.source, 0, 0, width, height);
    await yieldToBrowser(signal);
    const blob =
      "convertToBlob" in canvas
        ? await canvas.convertToBlob({
            type: contentType,
            quality: OUTPUT_QUALITY,
          })
        : await new Promise<Blob | null>((resolve) =>
            canvas.toBlob(resolve, contentType, OUTPUT_QUALITY),
          );
    checkCanceled(signal);
    return blob;
  } finally {
    // Release the backing pixel buffer promptly before the next photo starts.
    canvas.width = 0;
    canvas.height = 0;
  }
}

/** Shrinks eligible large photos before reservation/upload; never makes files larger. */
export async function preparePhotoForUpload(
  file: File,
  options: { readonly signal?: AbortSignal } = {},
): Promise<PreparedPhotoUpload> {
  const { signal } = options;
  checkCanceled(signal);
  if (
    !SUPPORTED_TYPES.has(file.type) ||
    file.size < MINIMUM_SOURCE_BYTES ||
    file.size > MAXIMUM_SOURCE_BYTES
  )
    return originalPhoto(file);
  const release = await acquirePreparation(signal);
  let photo: DecodedPhoto | undefined;
  try {
    await yieldToBrowser(signal);
    const header = new Uint8Array(
      await file.slice(0, HEADER_BYTES).arrayBuffer(),
    );
    checkCanceled(signal);
    if (!safeDimensions(photoHeaderDimensions(header, file.type)))
      return originalPhoto(file);
    photo = await decodePhoto(file, signal);
    if (!safeDimensions(photo)) return originalPhoto(file);
    const scale = Math.min(
      1,
      MAXIMUM_EDGE / Math.max(photo.width, photo.height),
    );
    const width = Math.max(1, Math.round(photo.width * scale));
    const height = Math.max(1, Math.round(photo.height * scale));
    await yieldToBrowser(signal);
    // WebP preserves transparency in PNG/WebP originals.
    const contentType =
      file.type === "image/jpeg" ? "image/jpeg" : "image/webp";
    const blob = await encodePhoto(photo, width, height, contentType, signal);
    const minimumSaving = Math.max(
      MINIMUM_BYTES_SAVED,
      file.size * MINIMUM_SAVINGS_RATIO,
    );
    if (
      !blob ||
      blob.type !== contentType ||
      blob.size === 0 ||
      file.size - blob.size < minimumSaving
    )
      return originalPhoto(file);
    const suffix = contentType === "image/jpeg" ? ".jpg" : ".webp";
    const name = file.name.replace(/\.[^.]+$/, "") + suffix;
    const prepared = new File([blob], name, {
      type: contentType,
      lastModified: file.lastModified,
    });
    return {
      file: prepared,
      optimized: true,
      originalBytes: file.size,
      preparedBytes: prepared.size,
      width,
      height,
    };
  } catch (error) {
    if (
      signal?.aborted ||
      (error instanceof DOMException && error.name === "AbortError")
    )
      throw abortError();
    return originalPhoto(file);
  } finally {
    photo?.dispose();
    release();
  }
}
