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
      const source = sharp(bytes, {
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
      const normalized = source.clone().rotate().toColourspace("srgb");
      const [dashboardThumbnail, listingCard, gallery, coverDisplay] =
        await Promise.all([
          normalized
            .clone()
            .resize(320, 240, { fit: "cover", withoutEnlargement: true })
            .webp({ quality: 78 })
            .toBuffer(),
          normalized
            .clone()
            .resize(800, 600, { fit: "cover", withoutEnlargement: true })
            .webp({ quality: 82 })
            .toBuffer(),
          normalized
            .clone()
            .resize(1600, 1600, { fit: "inside", withoutEnlargement: true })
            .webp({ quality: 84 })
            .toBuffer(),
          normalized
            .clone()
            .resize(2400, 1350, { fit: "cover", withoutEnlargement: true })
            .webp({ quality: 86 })
            .toBuffer(),
        ]);
      return {
        width: metadata.width,
        height: metadata.height,
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
