import path from "node:path";
import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";

const root = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(root, "src"),
      "server-only": path.resolve(root, "tests/support/server-only.ts"),
    },
  },
  test: {
    coverage: {
      provider: "v8",
      reporter: ["text", "json-summary"],
      include: ["src/modules/**/*.ts", "src/platform/**/*.ts"],
      exclude: ["src/generated/**", "**/index.ts"],
      thresholds: {
        statements: 35,
        branches: 35,
        functions: 35,
        lines: 35,
      },
    },
    projects: [
      {
        extends: true,
        test: {
          name: "unit",
          environment: "node",
          include: ["tests/unit/**/*.test.ts"],
        },
      },
      {
        extends: true,
        test: {
          name: "integration",
          environment: "node",
          include: ["tests/integration/**/*.test.ts"],
          globalSetup: ["tests/integration/global-setup.ts"],
          fileParallelism: false,
          hookTimeout: 120_000,
          testTimeout: 30_000,
        },
      },
      {
        extends: true,
        test: {
          name: "blob-contract",
          environment: "node",
          include: ["tests/contract/blob/**/*.test.ts"],
        },
      },
      {
        extends: true,
        test: {
          name: "email-contract",
          environment: "node",
          include: ["tests/contract/email/**/*.test.ts"],
        },
      },
      {
        extends: true,
        test: {
          name: "location-contract",
          environment: "node",
          include: ["tests/contract/location/**/*.test.ts"],
        },
      },
      {
        extends: true,
        test: {
          name: "image-contract",
          environment: "node",
          include: ["tests/contract/image/**/*.test.ts"],
        },
      },
      {
        extends: true,
        test: {
          name: "stripe-contract",
          environment: "node",
          include: ["tests/contract/stripe/**/*.test.ts"],
        },
      },
      {
        extends: true,
        test: {
          name: "blob-live",
          environment: "node",
          include: ["tests/live/blob/**/*.test.ts"],
          testTimeout: 60_000,
        },
      },
    ],
  },
});
