import sharp from "sharp";
import { describe, expect, it } from "vitest";

import type { ImageProcessor } from "@/modules/media/application/image-processor";
import { SharpImageProcessor } from "@/modules/media/infrastructure/sharp-image-processor";

describe("image processor contract", () => {
  it("returns only the four application-owned sanitized variants", async () => {
    const processor: ImageProcessor = new SharpImageProcessor();
    const source = await sharp({
      create: {
        width: 640,
        height: 480,
        channels: 3,
        background: "#315b45",
      },
    })
      .png()
      .toBuffer();
    const result = await processor.process(source);
    expect(result.width).toBe(640);
    expect(result.height).toBe(480);
    expect(Object.values(result.variants)).toHaveLength(4);
    expect(
      Object.values(result.variants).every(
        (variant) =>
          variant.contentType === "image/webp" &&
          /^[0-9a-f]{64}$/.test(variant.sha256) &&
          variant.bytes.byteLength > 0,
      ),
    ).toBe(true);
  });
});
