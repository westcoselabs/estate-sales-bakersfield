import { stat } from "node:fs/promises";
import path from "node:path";

import sharp from "sharp";
import { describe, expect, it } from "vitest";

describe("public marketplace assets", () => {
  it("ships a decodable, responsive hero image within the approved budget", async () => {
    const heroPath = path.resolve("public/images/marketplace-hero.webp");
    const [file, metadata] = await Promise.all([
      stat(heroPath),
      sharp(heroPath).metadata(),
    ]);

    expect(file.size).toBeLessThanOrEqual(200_000);
    expect(metadata.format).toBe("webp");
    expect(metadata.width).toBeGreaterThanOrEqual(1600);
    expect(metadata.height).toBeGreaterThanOrEqual(800);
  });
});
