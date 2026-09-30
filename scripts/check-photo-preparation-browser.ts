import { createServer } from "node:http";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
import assert from "node:assert/strict";
import { build } from "esbuild";
import { chromium } from "@playwright/test";
import sharp from "sharp";
import type { prepareFixture } from "../tests/browser/photo-preparation-harness";

// No application server, credentials, database, or uploads are used by this check.
const directory = path.resolve(".tmp/photo-preparation-browser");
await mkdir(directory, { recursive: true });
await build({
  entryPoints: [
    "tests/browser/photo-preparation-harness.ts",
    "src/modules/media/client/photo-preparation.worker.ts",
  ],
  outdir: directory,
  entryNames: "[name]",
  bundle: true,
  splitting: true,
  format: "esm",
  platform: "browser",
  target: "es2022",
  logLevel: "warning",
});
const jpeg = await sharp({
  create: { width: 4000, height: 3000, channels: 3, background: "#416e85" },
})
  .jpeg({ quality: 98 })
  .toBuffer();
const heicPath = process.argv[2];
const heic = heicPath ? await readFile(path.resolve(heicPath)) : undefined;
const server = createServer((request, response) => {
  void (async () => {
    const name = path.basename(
      new URL(request.url ?? "/", "http://localhost").pathname,
    );
    response.setHeader(
      "Content-Security-Policy",
      "default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; worker-src 'self'; img-src 'self' blob:; connect-src 'self'",
    );
    if (!name) {
      response.setHeader("Content-Type", "text/html");
      response.end(
        '<!doctype html><title>Photo preparation check</title><script type="module" src="/photo-preparation-harness.js"></script>',
      );
    } else if (name === "fixture.jpg" || name === "fixture.heic") {
      response.end(name === "fixture.jpg" ? jpeg : heic);
    } else {
      response.setHeader("Content-Type", "application/javascript");
      response.end(
        await readFile(
          path.join(directory, name.replace(/\.worker\.ts$/, ".worker.js")),
        ),
      );
    }
  })().catch(() => {
    response.statusCode = 404;
    response.end();
  });
});
await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
const address = server.address();
if (!address || typeof address === "string")
  throw new Error("No browser test port");
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage();
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(`http://127.0.0.1:${address.port}/`);
  await page.waitForFunction(() => "prepareFixture" in window);
  const run = (url: string, count: number) =>
    page.evaluate(
      async ({ url, count }) => {
        const harness = window as unknown as {
          prepareFixture: typeof prepareFixture;
        };
        return harness.prepareFixture(url, count);
      },
      { url, count },
    );
  const native = await run("/fixture.jpg", 12);
  assert(
    native.results.every(
      (result) =>
        result.decoder === "native" &&
        result.width === 2048 &&
        result.height === 1536 &&
        result.type === "image/jpeg",
    ),
  );
  const software = heic ? await run("/fixture.heic", 12) : null;
  if (software)
    assert(
      software.results.every(
        (result) =>
          result.decoder === "software" &&
          result.type === "image/jpeg" &&
          result.preparedBytes <= 2 * 1024 * 1024,
      ),
    );
  assert.deepEqual(errors, []);
  const output = {
    browser: await browser.version(),
    native,
    software,
    heicFixtureSha256: heic
      ? createHash("sha256").update(heic).digest("hex")
      : null,
    limitations:
      "Desktop Chromium conversion check only. Repeated fixtures; no network upload, database, iPhone, color-fidelity, or 180-second acceptance measurement.",
  };
  await mkdir("artifacts/photo-upload", { recursive: true });
  await writeFile(
    "artifacts/photo-upload/v2-browser-check.json",
    JSON.stringify(output, null, 2) + "\n",
  );
  process.stdout.write(
    `PASS: ${native.count} native JPEG conversions${software ? ` and ${software.count} real HEIC software conversions` : "; HEIC fixture not supplied"}.\n`,
  );
} finally {
  await browser.close();
  await new Promise<void>((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
}
