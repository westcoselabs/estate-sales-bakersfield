import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const PHOTO_FINALIZER_TRACE =
  ".next/server/app/api/events/[eventId]/photos/[photoId]/finalize/route.js.nft.json";

const REQUIRED_RUNTIME_FILES: ReadonlyArray<{
  readonly label: string;
  readonly matches: (file: string) => boolean;
}> = [
  {
    label: "Sharp package manifest",
    matches: (file) =>
      file.endsWith("/node_modules/@img/sharp-linux-x64/package.json"),
  },
  {
    label: "Sharp package entrypoint",
    matches: (file) =>
      file.endsWith("/node_modules/@img/sharp-linux-x64/index.cjs"),
  },
  {
    label: "Sharp native binding",
    matches: (file) =>
      /\/node_modules\/@img\/sharp-linux-x64\/lib\/sharp-linux-x64-[^/]+\.node$/.test(
        file,
      ),
  },
  {
    label: "libvips package manifest",
    matches: (file) =>
      file.endsWith("/node_modules/@img/sharp-libvips-linux-x64/package.json"),
  },
  {
    label: "libvips version manifest",
    matches: (file) =>
      file.endsWith("/node_modules/@img/sharp-libvips-linux-x64/versions.json"),
  },
  {
    label: "libvips shared library",
    matches: (file) =>
      /\/node_modules\/@img\/sharp-libvips-linux-x64\/lib\/libvips-cpp\.so\.[^/]+$/.test(
        file,
      ),
  },
];

export function missingSharpRuntimeFiles(files: readonly string[]): string[] {
  const normalized = files.map((file) => file.replaceAll("\\", "/"));
  return REQUIRED_RUNTIME_FILES.filter(
    (required) => !normalized.some(required.matches),
  ).map((required) => required.label);
}

export function verifySharpRuntimeTrace(root = process.cwd()): void {
  const tracePath = resolve(root, PHOTO_FINALIZER_TRACE);
  const parsed = JSON.parse(readFileSync(tracePath, "utf8")) as {
    readonly files?: unknown;
  };
  if (
    !Array.isArray(parsed.files) ||
    !parsed.files.every((file): file is string => typeof file === "string")
  ) {
    throw new Error("The photo finalizer runtime trace is malformed.");
  }
  const missing = missingSharpRuntimeFiles(parsed.files);
  if (missing.length > 0) {
    throw new Error(
      `The photo finalizer runtime trace is missing: ${missing.join(", ")}.`,
    );
  }
}
