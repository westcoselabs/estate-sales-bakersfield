import { readFile } from "node:fs/promises";
import path from "node:path";

import { expect, test, type Page } from "@playwright/test";
import sharp from "sharp";

interface CapturedEmail {
  readonly kind: "EMAIL_VERIFICATION" | "PASSWORD_RESET";
  readonly to: string;
  readonly actionUrl: string;
}

const capturePath = path.resolve(".tmp/e2e-auth-emails.jsonl");
const runId = process.env.TEST_RUN_ID;
if (!runId || !/^testrun-[a-z0-9-]+$/.test(runId)) {
  throw new Error("Playwright requires a valid TEST_RUN_ID");
}

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
  const email = `${runId}-owner-${suffix}@example.test`;
  const otherEmail = `${runId}-other-${suffix}@example.test`;
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

test("builds, previews, approves, invalidates, and reapproves an owned event draft", async ({
  browser,
  page,
}) => {
  test.slow();
  const suffix = crypto.randomUUID();
  const email = `${runId}-phase3-owner-${suffix}@example.test`;
  const otherEmail = `${runId}-phase3-other-${suffix}@example.test`;
  const password = "phase-three-browser-password";
  const browserErrors: string[] = [];
  page.on("pageerror", (error) => browserErrors.push(error.message));

  await registerAndVerify(page, email, "Phase three owner", password);
  await login(page, email, password);
  await page.getByRole("link", { name: /organizer onboarding/i }).click();
  await page.getByLabel("Organizer or business name").fill("Phase Three Sales");
  await page.getByLabel("Contact name").fill("Phase three owner");
  await page.getByLabel("Contact email").fill(email);
  await page.getByRole("button", { name: "Save organizer profile" }).click();
  await expect(page.getByText("Organizer profile saved.")).toBeVisible();
  await page.goto("/dashboard");

  await page.getByLabel("Sale type").selectOption("ESTATE_SALE");
  await page.getByRole("button", { name: "Create event draft" }).click();
  await expect(page).toHaveURL(/\/dashboard\/events\/[0-9a-f-]+\/edit$/);
  const eventId = page.url().match(/events\/([^/]+)\/edit/)?.[1];
  expect(eventId).toBeTruthy();

  await page.getByLabel("Public title").fill("Oleander Estate Sale");
  await page
    .getByLabel("Public description")
    .fill(
      "A thoughtfully organized estate sale with furniture, art, books, and collectible household pieces.",
    );
  await page.getByRole("button", { name: "Save details" }).click();
  await expect(page.getByText("Draft saved.")).toBeVisible();

  await page.goto("/dashboard");
  await page.getByRole("link", { name: "Continue editing" }).click();
  await expect(page.getByLabel("Public title")).toHaveValue(
    "Oleander Estate Sale",
  );

  const stalePage = await page.context().newPage();
  await stalePage.goto(page.url());

  await page.getByLabel("Starts").fill("2026-08-08T09:00");
  await page.getByLabel("Ends").fill("2026-08-08T15:00");
  await page.getByLabel("IANA timezone").fill("America/Los_Angeles");
  await page.getByRole("button", { name: "Save schedule" }).click();
  await expect(page.getByText("Draft saved.")).toBeVisible();

  await stalePage.getByLabel("Public title").fill("Stale tab overwrite");
  await stalePage.getByRole("button", { name: "Save details" }).click();
  await expect(stalePage.getByText(/changed in another tab/i)).toBeVisible();
  await stalePage.close();

  await page.getByLabel("Street address").fill("123 Main Street");
  await page.getByLabel("Postal code").fill("93301");
  await page.getByLabel("Hide exact address until the event starts").check();
  await page.getByRole("button", { name: "Validate and save address" }).click();
  await expect(page.getByText("Draft saved.")).toBeVisible();

  const image = await sharp({
    create: {
      width: 900,
      height: 600,
      channels: 3,
      background: "#7b5b3c",
    },
  })
    .withMetadata({ orientation: 6 })
    .jpeg()
    .toBuffer();
  await page.getByLabel(/Upload an event photo/).setInputFiles({
    name: "estate-photo.jpg",
    mimeType: "image/jpeg",
    buffer: image,
  });
  await page.getByRole("button", { name: "Upload photo" }).click();
  await expect(page.getByText("Photo uploaded and sanitized.")).toBeVisible({
    timeout: 30_000,
  });
  await expect(page.getByText("Status: READY")).toBeVisible();
  await page.getByRole("button", { name: "Make cover" }).click();
  await expect(
    page.getByText("This draft is ready for exact preview."),
  ).toBeVisible();

  await page.getByRole("link", { name: "Open exact listing preview" }).click();
  await expect(
    page.getByRole("heading", { name: "Oleander Estate Sale" }),
  ).toBeVisible();
  await expect(
    page.getByText(/Exact address hidden until event start/),
  ).toBeVisible();
  await expect(page.getByText("123 Main Street")).toHaveCount(0);
  await page.getByRole("link", { name: "Return to editor" }).click();

  await page.getByLabel(/I accept publishing terms version/).check();
  await page.getByRole("button", { name: "Approve exact revision" }).click();
  await expect(
    page.getByText(/exact event revision is approved/i),
  ).toBeVisible();
  await expect(page.getByText(/Revision \d+ approved/)).toBeVisible();

  await page.getByLabel("Public title").fill("Oleander Estate Sale Updated");
  await page.getByRole("button", { name: "Save details" }).click();
  await expect(page.getByText("Approval", { exact: true })).toBeVisible();
  await expect(page.getByText("NOT APPROVED", { exact: true })).toBeVisible();
  await page.getByLabel(/I accept publishing terms version/).check();
  await page.getByRole("button", { name: "Approve exact revision" }).click();
  await expect(page.getByText(/Revision \d+ approved/)).toBeVisible();

  const otherContext = await browser.newContext();
  const otherPage = await otherContext.newPage();
  await registerAndVerify(
    otherPage,
    otherEmail,
    "Other phase three owner",
    password,
  );
  await login(otherPage, otherEmail, password);
  await otherPage.goto("/dashboard/organizer");
  await otherPage.getByLabel("Organizer or business name").fill("Other Sales");
  await otherPage.getByLabel("Contact name").fill("Other owner");
  await otherPage.getByLabel("Contact email").fill(otherEmail);
  await otherPage
    .getByRole("button", { name: "Save organizer profile" })
    .click();
  const denied = await otherPage.request.get(`/api/events/${eventId}`);
  expect(denied.status()).toBe(404);
  await otherPage.goto(`/dashboard/events/${eventId}/edit`);
  await expect(
    otherPage.getByText(/application error|not found/i),
  ).toBeVisible();
  await otherContext.close();

  expect(browserErrors).toEqual([]);
});
