import { expect, test } from "@playwright/test";

test("serves the Phase 1 shell with baseline security headers", async ({
  page,
}) => {
  const response = await page.goto("/");

  await expect(
    page.getByRole("heading", { name: "Phase 1 foundation is running." }),
  ).toBeVisible();
  expect(response?.headers()["x-content-type-options"]).toBe("nosniff");
  expect(response?.headers()["x-frame-options"]).toBe("DENY");
  expect(response?.headers()["content-security-policy"]).toContain(
    "default-src 'self'",
  );
});

test("exposes a no-store health endpoint with a request identifier", async ({
  request,
}) => {
  const response = await request.get("/api/health", {
    headers: { "x-request-id": "playwright-fixture" },
  });
  expect(response.ok()).toBe(true);
  expect(response.headers()["cache-control"]).toBe("no-store");
  expect(response.headers()["x-request-id"]).toBe("playwright-fixture");
  await expect(response.json()).resolves.toMatchObject({
    requestId: "playwright-fixture",
    status: "ok",
  });
});
