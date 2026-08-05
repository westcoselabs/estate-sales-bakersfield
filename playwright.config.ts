import { defineConfig, devices } from "@playwright/test";

const port = 3417;
const baseURL = `http://127.0.0.1:${String(port)}`;
process.env.TEST_RUN_ID ??= `testrun-e2e-${Date.now().toString(36)}-${crypto.randomUUID().slice(0, 8)}`;

export default defineConfig({
  testDir: "tests/e2e",
  // Capture email, deterministic media, fake Stripe, and one isolated schema
  // inside Development Neon
  // are intentionally shared integration fixtures. Serialize browser journeys
  // so provider-heavy workflows cannot contend through the single test server.
  fullyParallel: false,
  workers: 1,
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
