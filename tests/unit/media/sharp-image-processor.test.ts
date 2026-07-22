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

  it("processes a browser-like plain Uint8Array PNG with alpha", async () => {
    const encoded = await sharp({
      create: {
        width: 1280,
        height: 720,
        channels: 4,
        background: { r: 28, g: 72, b: 104, alpha: 0.72 },
      },
    })
      .png({ palette: true })
      .toBuffer();
    const browserBytes = new Uint8Array(encoded.byteLength);
    browserBytes.set(encoded);

    expect(Buffer.isBuffer(browserBytes)).toBe(false);

    const result = await new SharpImageProcessor().process(browserBytes);

    expect(result).toMatchObject({ width: 1280, height: 720 });
    expect(Object.keys(result.variants)).toEqual([
      "dashboardThumbnail",
      "listingCard",
      "gallery",
      "coverDisplay",
    ]);
    for (const output of Object.values(result.variants)) {
      const metadata = await sharp(output.bytes).metadata();
      expect(metadata.format).toBe("webp");
      expect(output.bytes.byteLength).toBeGreaterThan(0);
      expect(output.sha256).toMatch(/^[0-9a-f]{64}$/);
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
