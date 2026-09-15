import { copyFileSync, mkdirSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";

// MapLibre 6's module worker imports its shared module by relative path.
// Next's URL asset loader does not preserve that sibling, so serve both from
// public using the installed version. This runs before every application build.
export function prepareMapLibreWorkers(): void {
  const packagePath = createRequire(import.meta.url).resolve(
    "maplibre-gl/package.json",
  );
  const { version } = JSON.parse(readFileSync(packagePath, "utf8")) as {
    version: string;
  };
  const source = path.join(path.dirname(packagePath), "dist");
  const destination = path.join(process.cwd(), "public", "maplibre", version);
  mkdirSync(destination, { recursive: true });
  for (const filename of ["maplibre-gl-worker.mjs", "maplibre-gl-shared.mjs"]) {
    copyFileSync(path.join(source, filename), path.join(destination, filename));
  }
}
