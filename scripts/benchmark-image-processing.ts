/** Local synthetic-image benchmark; does not contact storage or run live load.
 * node --conditions=react-server --expose-gc --import tsx scripts/benchmark-image-processing.ts <baseline|current> [count=80]
 * Run each mode in a fresh process to compare peak RSS fairly.
 */
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { performance } from "node:perf_hooks";

import sharp from "sharp";

import { SharpImageProcessor } from "../src/modules/media/infrastructure/sharp-image-processor";

const mode = process.argv[2];
const count = Number(process.argv[3] ?? 80);
if (
  !["baseline", "current"].includes(mode ?? "") ||
  !Number.isInteger(count) ||
  count < 1 ||
  count > 150
) {
  throw new Error(
    "Usage: benchmark-image-processing.ts <baseline|current> [count=80, maximum150]",
  );
}
const directory = path.resolve(".tmp/image-processing-benchmark");
await mkdir(directory, { recursive: true });

async function fixture(width: number, height: number, orientation?: number) {
  const file = path.join(
    directory,
    `${width}x${height}-${orientation ?? 1}-q78.jpg`,
  );
  try {
    return await readFile(file);
  } catch {
    /* Generate repeatable local fixture. */
  }
  const data = Buffer.alloc(width * height * 3);
  let seed = 47;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const offset = (y * width + x) * 3;
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      const noise = (seed >>> 27) - 16;
      data[offset] = (x / 9 + y / 23 + noise + 256) % 256;
      data[offset + 1] = (x / 31 + y / 11 + noise + 256) % 256;
      data[offset + 2] = (x / 17 + y / 29 + noise + 256) % 256;
    }
  }
  const pipeline = sharp(data, { raw: { width, height, channels: 3 } });
  const encoded = await (
    orientation ? pipeline.withMetadata({ orientation }) : pipeline
  )
    .jpeg({ quality: 78 })
    .toBuffer();
  await writeFile(file, encoded);
  return encoded;
}

// Landscape/portrait phone photos, one 48MP source, and a smaller camera image.
const inputs = [
  await fixture(4032, 3024),
  await fixture(4032, 3024, 6),
  await fixture(8064, 6048),
  await fixture(1600, 1200),
];
if (inputs.some((bytes) => bytes.byteLength > 15 * 1024 * 1024)) {
  throw new Error("Benchmark fixtures must fit the upload byte limit");
}
global.gc?.();

async function baseline(bytes: Buffer) {
  const source = sharp(bytes, {
    failOn: "error",
    limitInputPixels: 80_000_000,
  });
  await source.metadata();
  const normalized = source.clone().rotate().toColourspace("srgb");
  const output = [];
  output.push(
    await normalized
      .clone()
      .resize(320, 240, { fit: "cover", withoutEnlargement: true })
      .webp({ quality: 78 })
      .toBuffer(),
  );
  output.push(
    await normalized
      .clone()
      .resize(800, 600, { fit: "cover", withoutEnlargement: true })
      .webp({ quality: 82 })
      .toBuffer(),
  );
  output.push(
    await normalized
      .clone()
      .resize(1600, 1600, { fit: "inside", withoutEnlargement: true })
      .webp({ quality: 84 })
      .toBuffer(),
  );
  output.push(
    await normalized
      .clone()
      .resize(2400, 1350, { fit: "cover", withoutEnlargement: true })
      .webp({ quality: 86 })
      .toBuffer(),
  );
  return output.map((bytes) => ({
    bytes: new Uint8Array(bytes),
    sha256: createHash("sha256").update(bytes).digest("hex"),
  }));
}

const processor = new SharpImageProcessor();
let peakRss = process.memoryUsage().rss;
const monitor = setInterval(() => {
  peakRss = Math.max(peakRss, process.memoryUsage().rss);
}, 10);
const timings: number[] = [];
let outputBytes = 0;
const start = performance.now();
for (let index = 0; index < count; index += 1) {
  const input = inputs[index % inputs.length]!;
  const photoStart = performance.now();
  const variants =
    mode === "baseline"
      ? await baseline(input)
      : Object.values((await processor.process(input)).variants);
  outputBytes += variants.reduce(
    (sum, variant) => sum + variant.bytes.byteLength,
    0,
  );
  timings.push(performance.now() - photoStart);
  peakRss = Math.max(peakRss, process.memoryUsage().rss);
  if ((index + 1) % 20 === 0)
    console.log(`${mode}: processed ${index + 1}/${count}`);
}
clearInterval(monitor);
const sorted = [...timings].sort((left, right) => left - right);
const result = {
  mode,
  count,
  fixture:
    "synthetic textured JPEGs:12MP landscape,12MP EXIFportrait,48MP landscape,1.9MP landscape",
  totalMilliseconds: Math.round(performance.now() - start),
  medianMilliseconds: Math.round(sorted[Math.floor(count / 2)]!),
  p95Milliseconds: Math.round(
    sorted[Math.min(count - 1, Math.floor(count * 0.95))]!,
  ),
  peakRssMiB: Math.round(peakRss / 1024 / 1024),
  outputMiB: Math.round((outputBytes / 1024 / 1024) * 100) / 100,
  inputBytes: inputs.map((bytes) => bytes.byteLength),
  sharp: sharp.versions,
};
await writeFile(
  path.join(directory, `${mode}-${count}.json`),
  `${JSON.stringify(result, null, 2)}\n`,
);
console.log(JSON.stringify(result));
