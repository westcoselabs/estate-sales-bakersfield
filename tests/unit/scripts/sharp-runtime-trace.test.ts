import { describe, expect, it } from "vitest";

import { missingSharpRuntimeFiles } from "../../../scripts/verify-sharp-runtime-trace";

const completeTrace = [
  "../../node_modules/@img/sharp-linux-x64/package.json",
  "../../node_modules/@img/sharp-linux-x64/index.cjs",
  "../../node_modules/@img/sharp-linux-x64/lib/sharp-linux-x64-0.35.3.node",
  "../../node_modules/@img/sharp-libvips-linux-x64/package.json",
  "../../node_modules/@img/sharp-libvips-linux-x64/versions.json",
  "../../node_modules/@img/sharp-libvips-linux-x64/lib/libvips-cpp.so.8.18.3",
];

describe("photo finalizer runtime trace", () => {
  it("accepts the exact Sharp and libvips package runtime files", () => {
    expect(missingSharpRuntimeFiles(completeTrace)).toEqual([]);
  });

  it("fails closed when the libvips shared library is absent", () => {
    expect(missingSharpRuntimeFiles(completeTrace.slice(0, -1))).toEqual([
      "libvips shared library",
    ]);
  });
});
