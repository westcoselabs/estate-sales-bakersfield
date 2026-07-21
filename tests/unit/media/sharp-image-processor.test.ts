import sharp from "sharp";
import { describe, expect, it } from "vitest";

import { SharpImageProcessor } from "@/modules/media/infrastructure/sharp-image-processor";

describe("SharpImageProcessor", () => {
  it("decodes, rotates, strips metadata, and creates all sanitized WebP variants", async () => {
    const source = await sharp({
      create: {
        width: 900,
        height: 600,
        channels: 3,
        background: { r: 50, g: 110, b: 70 },
      },
    })
      .withMetadata({ orientation: 6 })
      .jpeg()
      .toBuffer();
    const result = await new SharpImageProcessor().process(source);
    expect(Object.keys(result.variants)).toEqual([
      "dashboardThumbnail",
      "listingCard",
      "gallery",
      "coverDisplay",
    ]);
    for (const variant of Object.values(result.variants)) {
      const metadata = await sharp(variant.bytes).metadata();
      expect(metadata.format).toBe("webp");
      expect(metadata.exif).toBeUndefined();
      expect(metadata.icc).toBeUndefined();
      expect(variant.sha256).toMatch(/^[0-9a-f]{64}$/);
    }
  });

  it("rejects non-image bytes safely", async () => {
    await expect(
      new SharpImageProcessor().process(
        new TextEncoder().encode("not an image"),
      ),
    ).rejects.toThrow(/could not be decoded safely/);
  });
});
