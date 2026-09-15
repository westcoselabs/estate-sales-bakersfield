import { defineConfig } from "@playwright/test";
import base from "./playwright.config";

export default defineConfig({
  ...base,
  testDir: "tests/performance",
  testMatch: "http-load.spec.ts",
  timeout: 600_000,
  retries: 0,
  reporter: "list",
});
