import { mkdir } from "node:fs/promises";
import path from "node:path";

import { expect, test, type Page } from "@playwright/test";

const screenshotDirectory = path.resolve(".tmp/ui-review");

async function expectNoHorizontalOverflow(page: Page) {
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          document.documentElement.scrollWidth <=
          document.documentElement.clientWidth,
      ),
    )
    .toBe(true);
}

test.beforeAll(async () => {
  await mkdir(screenshotDirectory, { recursive: true });
});

test("renders fail-closed robots metadata and does not advertise a sitemap", async ({
  page,
  request,
}) => {
  await page.goto("/");
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute(
    "content",
    /noindex, follow/i,
  );

  await page.goto("/signup");
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute(
    "content",
    /noindex, nofollow/i,
  );

  const robots = await request.get("/robots.txt");
  expect(robots.ok()).toBe(true);
  expect(await robots.text()).not.toContain("Sitemap:");
});

test("auth validation focuses the first invalid field and exposes password controls", async ({
  page,
}) => {
  await page.goto("/signup");
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.getByText("Check the following")).toBeVisible();
  await expect(page.locator("#signup-display-name")).toBeFocused();
  await expect(page.locator("#signup-display-name")).toHaveAttribute(
    "aria-invalid",
    "true",
  );

  const password = page.locator("#signup-password");
  await password.fill("a sufficiently long password");
  await expect(password).toHaveAttribute("type", "password");
  await page.getByRole("button", { name: "Show password" }).first().click();
  await expect(password).toHaveAttribute("type", "text");
  await page.getByRole("button", { name: "Hide password" }).first().click();
  await expect(password).toHaveAttribute("type", "password");

  await page.keyboard.press("Tab");
  const focusedOutline = await page.evaluate(() => {
    const element = document.activeElement;
    return element ? getComputedStyle(element).outlineStyle : "none";
  });
  expect(focusedOutline).not.toBe("none");
});

for (const width of [360, 390, 430, 768, 1280]) {
  test(`auth shell is stable at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: width < 768 ? 844 : 900 });
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/login");
    await expectNoHorizontalOverflow(page);
    await expect(page.getByRole("main")).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Welcome back" }),
    ).toBeVisible();
    const transitionDuration = await page
      .locator(".ui-button")
      .evaluate((element) => getComputedStyle(element).transitionDuration);
    expect(transitionDuration).toMatch(/1e-05s|0\.00001s|0s/);
    const hasSafeAreaRule = await page.evaluate(() =>
      [...document.styleSheets].some((sheet) =>
        [...sheet.cssRules].some((rule) =>
          rule.cssText.includes("safe-area-inset-bottom"),
        ),
      ),
    );
    expect(hasSafeAreaRule).toBe(true);
    await page.screenshot({
      path: path.join(screenshotDirectory, `login-${width}.png`),
      fullPage: true,
      animations: "disabled",
    });
  });
}

test("dashboard shell is stable at 1440px", async ({ page }) => {
  const runId = process.env.TEST_RUN_ID ?? "testrun-ui";
  const suffix = crypto.randomUUID();
  const email = `${runId}-visual-${suffix}@example.test`;
  const password = "foundation-visual-password";
  await page.context().setExtraHTTPHeaders({
    "x-forwarded-for": `e2e-visual-${suffix}`,
  });
  await page.request.post("/api/auth/signup", {
    headers: {
      origin: "http://127.0.0.1:3417",
      "content-type": "application/json",
    },
    data: {
      displayName: "Preview organizer",
      email,
      password,
      passwordConfirmation: password,
    },
  });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
  await expectNoHorizontalOverflow(page);
  await expect(
    page.getByRole("navigation", { name: "Organizer" }),
  ).toBeVisible();
  await page.screenshot({
    path: path.join(screenshotDirectory, "dashboard-1440.png"),
    fullPage: true,
    animations: "disabled",
  });

  await page.goto("/");
  const desktopAccount = page.locator(
    ".public-header__actions .account-menu--public",
  );
  await expect(desktopAccount).toBeVisible();
  await expect(
    page
      .locator(".public-header__actions")
      .getByRole("link", { name: "Log in", exact: true }),
  ).toHaveCount(0);
  await desktopAccount.getByLabel(/Open account menu/).click();
  await expect(
    desktopAccount.getByRole("link", { name: "Dashboard", exact: true }),
  ).toHaveAttribute("href", "/dashboard");
  await expect(
    desktopAccount.getByRole("link", { name: "Profile", exact: true }),
  ).toHaveAttribute("href", "/dashboard/profile");
  await expect(
    desktopAccount.getByRole("link", { name: "Settings", exact: true }),
  ).toHaveAttribute("href", "/dashboard/settings");
  await expect(
    desktopAccount.getByRole("button", { name: "Log out", exact: true }),
  ).toBeVisible();

  await page.setViewportSize({ width: 390, height: 844 });
  const mobileActions = page.locator(".public-header__mobile-actions");
  const menuBox = await mobileActions
    .getByLabel("Open navigation")
    .boundingBox();
  const accountBox = await mobileActions
    .locator(".account-menu--public")
    .getByLabel(/Open account menu/)
    .boundingBox();
  expect(menuBox).not.toBeNull();
  expect(accountBox).not.toBeNull();
  expect(accountBox?.x ?? 0).toBeLessThan(menuBox?.x ?? 0);
  await expectNoHorizontalOverflow(page);
});
