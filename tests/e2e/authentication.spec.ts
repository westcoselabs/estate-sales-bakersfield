import { readFile } from "node:fs/promises";
import path from "node:path";

import { expect, test, type Page } from "@playwright/test";

interface CapturedEmail {
  readonly kind: "EMAIL_VERIFICATION" | "PASSWORD_RESET";
  readonly to: string;
  readonly actionUrl: string;
}

const capturePath = path.resolve(".tmp/e2e-auth-emails.jsonl");

async function capturedEmail(
  recipient: string,
  kind: CapturedEmail["kind"],
): Promise<CapturedEmail> {
  let found: CapturedEmail | undefined;
  await expect
    .poll(
      async () => {
        const text = await readFile(capturePath, "utf8").catch(() => "");
        const messages = text
          .split(/\r?\n/)
          .filter(Boolean)
          .map((line) => JSON.parse(line) as CapturedEmail);
        found = messages
          .filter(
            (message) => message.to === recipient && message.kind === kind,
          )
          .at(-1);
        return Boolean(found);
      },
      { timeout: 10_000 },
    )
    .toBe(true);
  return found as CapturedEmail;
}

async function registerAndVerify(
  page: Page,
  email: string,
  displayName: string,
  password: string,
) {
  await page.goto("/signup");
  await page.getByLabel("Display name").fill(displayName);
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByLabel("Confirm password").fill(password);
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.getByText(/verification instructions/i)).toBeVisible();

  const emailMessage = await capturedEmail(email, "EMAIL_VERIFICATION");
  const action = new URL(emailMessage.actionUrl);
  await page.goto(`${action.pathname}${action.search}`);
  await page.getByRole("button", { name: "Verify email" }).click();
  await expect(page).toHaveURL(/\/login\?verified=1$/);
}

async function login(page: Page, email: string, password: string) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Log in" }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
}

test("completes the Phase 2 account, recovery, session, and organizer lifecycle", async ({
  browser,
  page,
}) => {
  test.slow();
  const suffix = crypto.randomUUID();
  const email = `owner-${suffix}@example.test`;
  const otherEmail = `other-${suffix}@example.test`;
  const password = "phase-two-initial-password";
  const replacementPassword = "phase-two-replacement-password";
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));

  await registerAndVerify(page, email, "Primary owner", password);
  await login(page, email, password);
  await expect(page.getByText("Email status: Verified")).toBeVisible();

  await page.getByRole("link", { name: /organizer onboarding/i }).click();
  await page.getByLabel("Organizer or business name").fill("Main organizer");
  await page.getByLabel("Contact name").fill("Primary owner");
  await page.getByLabel("Contact email").fill(email);
  await page.getByRole("button", { name: "Save organizer profile" }).click();
  await expect(page.getByText("Organizer profile saved.")).toBeVisible();

  const secondContext = await browser.newContext();
  const secondPage = await secondContext.newPage();
  await registerAndVerify(secondPage, otherEmail, "Other owner", password);
  await login(secondPage, otherEmail, password);
  await secondPage.goto("/dashboard/organizer");
  await secondPage
    .getByLabel("Organizer or business name")
    .fill("Other organizer");
  await secondPage.getByLabel("Contact name").fill("Other owner");
  await secondPage.getByLabel("Contact email").fill(otherEmail);
  await secondPage
    .getByRole("button", { name: "Save organizer profile" })
    .click();
  await expect(secondPage.getByText("Organizer profile saved.")).toBeVisible();
  await page.reload();
  await expect(page.getByLabel("Organizer or business name")).toHaveValue(
    "Main organizer",
  );

  const parallelSession = await browser.newContext();
  const parallelPage = await parallelSession.newPage();
  await login(parallelPage, email, password);

  await page.goto("/forgot-password");
  await page.getByLabel("Email").fill(email);
  await page.getByRole("button", { name: "Send reset link" }).click();
  await expect(page.getByText(/account can be recovered/i)).toBeVisible();
  const resetMessage = await capturedEmail(email, "PASSWORD_RESET");
  const resetAction = new URL(resetMessage.actionUrl);
  await page.goto(`${resetAction.pathname}${resetAction.search}`);
  await page
    .getByLabel("New password", { exact: true })
    .fill(replacementPassword);
  await page.getByLabel("Confirm new password").fill(replacementPassword);
  await page.getByRole("button", { name: "Reset password" }).click();
  await expect(page).toHaveURL(/\/login\?reset=1$/);

  const revokedResponse = await parallelPage.request.get("/api/account");
  expect(revokedResponse.status()).toBe(401);

  await login(page, email, replacementPassword);
  await page.getByRole("button", { name: "Log out", exact: true }).click();
  await expect(page).toHaveURL(/\/login$/);

  await page.getByLabel("Email").fill("unknown@example.test");
  await page.getByLabel("Password").fill("not-the-right-password");
  await page.getByRole("button", { name: "Log in" }).click();
  await expect(
    page.getByText("The email or password was not accepted. Please try again."),
  ).toBeVisible();

  await secondContext.close();
  await parallelSession.close();
  expect(pageErrors).toEqual([]);
});

test("denies anonymous organizer access and retains security headers", async ({
  request,
}) => {
  const organizer = await request.get("/api/organizer");
  expect(organizer.status()).toBe(401);

  const signup = await request.get("/signup");
  expect(signup.headers()["x-content-type-options"]).toBe("nosniff");
  expect(signup.headers()["x-frame-options"]).toBe("DENY");
  expect(signup.headers()["cache-control"]).toMatch(/private|no-store/);

  const tokenPage = await request.get(
    `/reset-password?token=${"a".repeat(43)}`,
  );
  expect(tokenPage.headers()["referrer-policy"]).toBe("no-referrer");
});
