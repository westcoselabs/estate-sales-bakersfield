import { defineConfig, devices } from "@playwright/test";

const port = 3417;
const baseURL = `http://127.0.0.1:${String(port)}`;
process.env.TEST_RUN_ID ??= `testrun-e2e-${Date.now().toString(36)}-${crypto.randomUUID().slice(0, 8)}`;

export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL,
    trace: "on-first-retry",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "pnpm exec tsx scripts/start-e2e-server.ts",
    url: `${baseURL}/api/health`,
    reuseExistingServer: false,
    timeout: 180_000,
  },
});
