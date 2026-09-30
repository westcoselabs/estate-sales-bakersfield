import { photoHeaderDimensions } from "./prepare-photo";

export const MAX_SOURCE_BYTES = 15 * 1024 * 1024;
export const MAX_SOURCE_PIXELS = 50_000_000;
export const MAX_PREPARED_BYTES = 2 * 1024 * 1024;
export const TARGET_PREPARED_BYTES = 800 * 1024;
export type PhotoFormat =
  "image/jpeg" | "image/png" | "image/webp" | "image/heic";

export interface EncodedPhoto {
  readonly blob: Blob;
  readonly thumbnail: Blob;
  readonly width: number;
  readonly height: number;
}

/** Contents are authoritative; picker MIME types and extensions are often missing. */
export function detectPhotoFormat(bytes: Uint8Array): PhotoFormat | null {
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff)
    return "image/jpeg";
  const text = (start: number, end: number) =>
    String.fromCharCode(...bytes.slice(start, end));
  if (text(0, 8) === "\x89PNG\r\n\x1a\n") return "image/png";
  if (text(0, 4) === "RIFF" && text(8, 12) === "WEBP") return "image/webp";
  if (bytes.length >= 16 && text(4, 8) === "ftyp") {
    const size = new DataView(
      bytes.buffer,
      bytes.byteOffset,
      bytes.byteLength,
    ).getUint32(0);
    if (size < 16 || size > bytes.length) return null;
    const brands = [text(8, 12)];
    for (let offset = 16; offset + 4 <= size; offset += 4)
      brands.push(text(offset, offset + 4));
    if (brands.some((brand) => ["avif", "avis"].includes(brand))) return null;
    if (
      brands.some((brand) =>
        [
          "heic",
          "heix",
          "hevc",
          "hevx",
          "heim",
          "heis",
          "mif1",
          "msf1",
        ].includes(brand),
      )
    )
      return "image/heic";
  }
  return null;
}

export function assertPhotoDimensions(width: number, height: number): void {
  if (
    !Number.isSafeInteger(width) ||
    !Number.isSafeInteger(height) ||
    width <= 0 ||
    height <= 0 ||
    width * height > MAX_SOURCE_PIXELS
  )
    throw new Error(
      "This photo exceeds the 50-megapixel limit or has invalid dimensions.",
    );
}

export async function inspectPhoto(file: File): Promise<PhotoFormat> {
  if (!file.size || file.size > MAX_SOURCE_BYTES)
    throw new Error("Choose a photo between 1 byte and 15 MB.");
  const bytes = new Uint8Array(await file.slice(0, 256 * 1024).arrayBuffer());
  const format = detectPhotoFormat(bytes);
  if (!format)
    throw new Error(
      "This file is not a supported photo. Export it as JPEG and try again.",
    );
  const dimensions = photoHeaderDimensions(bytes, format);
  if (dimensions) assertPhotoDimensions(dimensions.width, dimensions.height);
  return format;
}

function canvas(
  width: number,
  height: number,
): OffscreenCanvas | HTMLCanvasElement {
  if (typeof OffscreenCanvas === "function")
    return new OffscreenCanvas(width, height);
  const element = document.createElement("canvas");
  element.width = width;
  element.height = height;
  return element;
}

async function encode(
  source: CanvasImageSource,
  width: number,
  height: number,
  type: string,
  quality: number,
): Promise<Blob> {
  const surface = canvas(width, height);
  try {
    const context = surface.getContext("2d", {
      alpha: type !== "image/jpeg",
      colorSpace: "srgb",
    }) as CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null;
    if (!context) throw new Error("Photo preparation is unavailable.");
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = "high";
    context.drawImage(source, 0, 0, width, height);
    const blob =
      "convertToBlob" in surface
        ? await surface.convertToBlob({ type, quality })
        : await new Promise<Blob | null>((resolve) =>
            surface.toBlob(resolve, type, quality),
          );
    if (!blob?.size || blob.type !== type)
      throw new Error(
        "The browser cannot encode this photo. Export it as JPEG and try again.",
      );
    return blob;
  } finally {
    surface.width = 0;
    surface.height = 0;
  }
}

export async function encodeListingPhoto(
  source: CanvasImageSource,
  sourceWidth: number,
  sourceHeight: number,
  format: PhotoFormat,
): Promise<EncodedPhoto> {
  assertPhotoDimensions(sourceWidth, sourceHeight);
  const type =
    format === "image/png" || format === "image/webp"
      ? "image/webp"
      : "image/jpeg";
  let blob: Blob | undefined;
  let width = 0;
  let height = 0;
  for (const [edge, quality] of [
    [2048, 0.82],
    [2048, 0.76],
    [1600, 0.76],
  ] as const) {
    const scale = Math.min(1, edge / Math.max(sourceWidth, sourceHeight));
    width = Math.max(1, Math.round(sourceWidth * scale));
    height = Math.max(1, Math.round(sourceHeight * scale));
    blob = await encode(source, width, height, type, quality);
    if (blob.size <= TARGET_PREPARED_BYTES) break;
  }
  if (!blob || blob.size > MAX_PREPARED_BYTES)
    throw new Error(
      "This photo could not be reduced below 2 MB. Export a smaller JPEG and retry.",
    );
  const thumbnailScale = Math.min(1, 160 / Math.max(sourceWidth, sourceHeight));
  const thumbnail = await encode(
    source,
    Math.max(1, Math.round(sourceWidth * thumbnailScale)),
    Math.max(1, Math.round(sourceHeight * thumbnailScale)),
    type,
    0.65,
  );
  return { blob, thumbnail, width, height };
}
