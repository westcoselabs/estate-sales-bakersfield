import "server-only";

import { createHash } from "node:crypto";

import type {
  ImageProcessor,
  ProcessedImageVariant,
  ProcessedPhoto,
} from "../application/image-processor";
import { MediaStoreError } from "../domain/errors";

const SUPPORTED_FORMATS = new Set(["jpeg", "png", "webp", "heif"]);

function variant(bytes: Buffer): ProcessedImageVariant {
  return {
    bytes: new Uint8Array(bytes),
    contentType: "image/webp",
    sha256: createHash("sha256").update(bytes).digest("hex"),
  };
}

export class SharpImageProcessor implements ImageProcessor {
  async process(bytes: Uint8Array): Promise<ProcessedPhoto> {
    try {
      const { default: sharp } = await import("sharp");
      const input = Buffer.from(
        bytes.buffer,
        bytes.byteOffset,
        bytes.byteLength,
      );
      const source = sharp(input, {
        failOn: "error",
        limitInputPixels: 80_000_000,
      });
      const metadata = await source.metadata();
      if (
        !metadata.format ||
        !SUPPORTED_FORMATS.has(metadata.format) ||
        !metadata.width ||
        !metadata.height
      ) {
        throw new MediaStoreError(
          "INVALID_SCOPE",
          "The uploaded file is not a supported image",
        );
      }
      // Decode and orient the original once. Every rendition shares this
      // bounded, uncompressed image rather than decoding an up-to-80 MP upload
      // four times. At most 2400 × 2400 × 4 bytes (~22 MiB) are retained here.
      const normalized = await source
        .rotate()
        .resize(2400, 2400, { fit: "inside", withoutEnlargement: true })
        .toColourspace("srgb")
        .raw()
        .toBuffer({ resolveWithObject: true });
      const rendition = () =>
        sharp(normalized.data, {
          raw: {
            width: normalized.info.width,
            height: normalized.info.height,
            channels: normalized.info.channels,
          },
        });
      // Keep encodes sequential so native processing stays within the existing
      // runtime/account memory limits. Effort 1 favors throughput over a small
      // additional reduction in file size without lowering the quality setting.
      const dashboardThumbnail = await rendition()
        .resize(320, 240, { fit: "cover", withoutEnlargement: true })
        .webp({ quality: 78, effort: 1 })
        .toBuffer();
      const listingCard = await rendition()
        .resize(800, 600, { fit: "cover", withoutEnlargement: true })
        .webp({ quality: 82, effort: 1 })
        .toBuffer();
      const gallery = await rendition()
        .resize(1600, 1600, { fit: "inside", withoutEnlargement: true })
        .webp({ quality: 84, effort: 1 })
        .toBuffer();
      const coverDisplay = await rendition()
        .webp({ quality: 86, effort: 1 })
        .toBuffer();
      return {
        width: metadata.autoOrient.width,
        height: metadata.autoOrient.height,
        variants: {
          dashboardThumbnail: variant(dashboardThumbnail),
          listingCard: variant(listingCard),
          gallery: variant(gallery),
          coverDisplay: variant(coverDisplay),
        },
      };
    } catch (cause) {
      if (cause instanceof MediaStoreError) throw cause;
      throw new MediaStoreError(
        "INVALID_SCOPE",
        "The uploaded image could not be decoded safely",
        { cause },
      );
    }
  }
}
