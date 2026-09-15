import { expect, type Page, type TestInfo } from "@playwright/test";
import { TOTP } from "otpauth";

export async function enrollAdministratorMfa(
  page: Page,
  password: string,
  testInfo?: TestInfo,
) {
  if (!new URL(page.url()).pathname.startsWith("/account/security")) {
    await page.goto("/account/security?next=%2Fadmin");
  }
  await expect(page).toHaveURL(/\/account\/security/);
  await page.getByLabel("Current password", { exact: true }).fill(password);
  await page
    .getByRole("button", { name: "Set up authenticator", exact: true })
    .click();
  const secret = await page.getByLabel("Authenticator setup key").innerText();
  await page
    .getByLabel("Authenticator code", { exact: true })
    .fill(new TOTP({ secret }).generate());
  await page
    .getByRole("button", { name: "Confirm authenticator", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Save your recovery codes" }),
  ).toBeVisible();
  const recoveryCodes = (
    await page.getByLabel("One-time recovery codes").innerText()
  ).split(/\s+/);
  if (testInfo) {
    const checkbox = page.getByLabel("I saved my recovery codes securely.");
    await expect(checkbox).toHaveCSS("height", "20px");
    await expect(checkbox).toHaveCSS("width", "20px");
    await page.screenshot({
      path: testInfo.outputPath("administrator-recovery-codes-masked.png"),
      fullPage: true,
      mask: [
        page.getByLabel("One-time recovery codes"),
        page.getByLabel("Authenticator setup key"),
        page.getByLabel("Authenticator code", { exact: true }),
        page.locator('input[type="password"]'),
      ],
    });
    const desktopViewport = page.viewportSize();
    await page.setViewportSize({ width: 390, height: 844 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: testInfo.outputPath("administrator-recovery-mobile-masked.png"),
      fullPage: true,
      mask: [
        page.getByLabel("One-time recovery codes"),
        page.locator('input[type="password"]'),
      ],
    });
    if (desktopViewport) await page.setViewportSize(desktopViewport);
  }
  await page.getByLabel("I saved my recovery codes securely.").check();
  await page.getByRole("button", { name: "Continue to administrator" }).click();
  return { secret, recoveryCodes };
}
