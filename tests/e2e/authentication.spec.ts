import { readFile } from "node:fs/promises";
import path from "node:path";

import { expect, test, type Page } from "@playwright/test";
import sharp from "sharp";

import { PUBLISHING_TERMS_VERSION } from "@/modules/events/application/policy";

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
  const signupResponse = page.waitForResponse((response) =>
    response.url().endsWith("/api/auth/signup"),
  );
  await page.getByRole("button", { name: "Create account" }).click();
  const response = await signupResponse;
  if (!response.ok()) {
    const body = (await response.text()).slice(0, 500);
    throw new Error(`Registration failed (${response.status()}): ${body}`);
  }
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

async function sameOriginPost(
  page: Page,
  url: string,
  body: Readonly<Record<string, unknown>>,
): Promise<{ readonly status: number; readonly body: unknown }> {
  return page.evaluate(
    async ({ endpoint, payload }) => {
      const response = await fetch(endpoint, {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      return { status: response.status, body: await response.json() };
    },
    { endpoint: url, payload: body },
  );
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
  await expect(
    page.request.get("/api/account").then((response) => response.json()),
  ).resolves.toMatchObject({
    account: { emailVerified: true },
  });

  await page.getByRole("link", { name: /continue onboarding/i }).click();
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
  await page.getByLabel("Open account menu for Primary owner").click();
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

test("supports unverified onboarding while preserving publishing verification gates", async ({
  page,
}) => {
  test.slow();
  const suffix = crypto.randomUUID();
  const email = `${runId}-unverified-${suffix}@example.test`;
  const password = "unverified-browser-password";
  await page.context().setExtraHTTPHeaders({
    "x-forwarded-for": `e2e-unverified-${suffix}`,
  });

  await page.goto("/signup");
  await page.getByLabel("Display name").fill("Unverified owner");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByLabel("Confirm password").fill(password);
  const signupResponse = page.waitForResponse((response) =>
    response.url().endsWith("/api/auth/signup"),
  );
  await page.getByRole("button", { name: "Create account" }).click();
  await expect((await signupResponse).status()).toBe(202);
  await expect(
    page.getByText(
      "Check your email for verification instructions. You can sign in now.",
    ),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Continue to login" }),
  ).toBeVisible();
  await page.getByRole("link", { name: "Continue to login" }).click();
  await expect(page).toHaveURL(/\/login\?registered=1$/);
  await expect(page.url()).not.toContain(encodeURIComponent(email));
  await expect(
    page.getByText(/sign in now and verify before uploading photos/i),
  ).toBeVisible();

  const duplicate = await sameOriginPost(page, "/api/auth/signup", {
    displayName: "Unverified owner",
    email,
    password,
    passwordConfirmation: password,
  });
  expect(duplicate.status).toBe(202);
  expect(duplicate.body).toMatchObject({
    message:
      "Check your email for verification instructions. You can sign in now.",
  });

  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Log in" }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(
    page.getByRole("heading", { name: "Verify your email" }),
  ).toBeVisible();
  await expect(
    page.getByText(
      "Draft now, then verify before photos, approval, payment, or publication.",
    ),
  ).toBeVisible();

  await page.goto("/dashboard/profile");
  await page
    .getByLabel("Organizer or business name")
    .fill("Unverified Draft Sales");
  await page.getByLabel("Contact name").fill("Unverified owner");
  await page.getByLabel("Contact email").fill(email);
  await page.getByRole("button", { name: "Save organizer profile" }).click();
  await expect(page.getByText("Organizer profile saved.")).toBeVisible();

  await page.goto("/dashboard");
  await page.getByLabel("Sale type").selectOption("ESTATE_SALE");
  await page.getByRole("button", { name: "Create event draft" }).click();
  await expect(page).toHaveURL(/\/dashboard\/events\/[0-9a-f-]+\/edit$/);
  const eventId = page.url().match(/events\/([^/]+)\/edit/)?.[1];
  expect(eventId).toBeTruthy();
  await page.getByLabel("Public title").fill("Unverified editable draft");
  await page
    .getByLabel("Public description")
    .fill("Ordinary draft text remains editable before email verification.");
  await page.getByRole("button", { name: "Save and continue" }).click();
  await expect(
    page.getByText("Saved and confirmed by the server."),
  ).toBeVisible();

  const eventResponse = await page.request.get(`/api/events/${eventId}`);
  expect(eventResponse.status()).toBe(200);
  const eventPayload = (await eventResponse.json()) as {
    readonly event: { readonly version: number };
  };
  const expectedVersion = eventPayload.event.version;
  expect(
    (
      await sameOriginPost(page, `/api/events/${eventId}/photos/reserve`, {
        expectedVersion,
        contentType: "image/jpeg",
        fileName: "blocked.jpg",
      })
    ).status,
  ).toBe(403);
  expect(
    (
      await sameOriginPost(page, `/api/events/${eventId}/approval`, {
        expectedVersion,
        acceptedTerms: true,
        termsVersion: PUBLISHING_TERMS_VERSION,
      })
    ).status,
  ).toBe(403);
  expect(
    (
      await sameOriginPost(page, `/api/events/${eventId}/checkout`, {
        expectedVersion,
      })
    ).status,
  ).toBe(403);

  await page.goto("/dashboard");
  await page.getByRole("button", { name: "Resend verification" }).click();
  await expect(
    page.getByText(/account can be verified, instructions have been sent/i),
  ).toBeVisible();
  const verificationMessage = await capturedEmail(email, "EMAIL_VERIFICATION");
  const action = new URL(verificationMessage.actionUrl);
  const verificationPath = `${action.pathname}${action.search}`;
  await page.goto(verificationPath);
  await page.getByRole("button", { name: "Verify email" }).click();
  await expect(page).toHaveURL(/\/dashboard\?verified=1$/);
  await expect(page.getByText(/Email verified/).first()).toBeVisible();
  await expect(
    page.request.get("/api/account").then((response) => response.json()),
  ).resolves.toMatchObject({
    account: { emailVerified: true },
  });

  await page.goto(verificationPath);
  await page.getByRole("button", { name: "Verify email" }).click();
  await expect(page).toHaveURL(/\/dashboard\?verified=1$/);
  await expect(
    page.request.get("/api/account").then((response) => response.json()),
  ).resolves.toMatchObject({
    account: { emailVerified: true },
  });
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
  await page.addInitScript(() => {
    const originalRevokeObjectUrl = URL.revokeObjectURL.bind(URL);
    const trackedWindow = window as Window & {
      __revokedPhotoPreviewCount?: number;
    };
    trackedWindow.__revokedPhotoPreviewCount = 0;
    URL.revokeObjectURL = (url) => {
      trackedWindow.__revokedPhotoPreviewCount =
        (trackedWindow.__revokedPhotoPreviewCount ?? 0) + 1;
      originalRevokeObjectUrl(url);
    };
  });

  await registerAndVerify(page, email, "Phase three owner", password);
  await login(page, email, password);
  await page.getByRole("link", { name: /continue onboarding/i }).click();
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
  await page.getByRole("button", { name: "Save and continue" }).click();
  await expect(
    page.getByRole("heading", { name: "Local schedule" }),
  ).toBeVisible();

  await page.goto("/dashboard");
  await page.getByRole("link", { name: "Continue editing" }).click();
  await page.getByRole("button", { name: "Details" }).click();
  await expect(page.getByLabel("Public title")).toHaveValue(
    "Oleander Estate Sale",
  );

  const stalePage = await page.context().newPage();
  await stalePage.goto(page.url());

  await page.getByRole("button", { name: "Schedule" }).click();

  await page.getByLabel("Starts", { exact: true }).fill("2026-08-08T09:00");
  await page.getByLabel("Ends", { exact: true }).fill("2026-08-08T15:00");
  await page
    .getByLabel("IANA timezone", { exact: true })
    .fill("America/Los_Angeles");
  await page.getByRole("button", { name: "Save and continue" }).click();
  await expect(
    page.getByRole("heading", { name: "Address and privacy" }),
  ).toBeVisible();

  await stalePage.getByRole("button", { name: "Details" }).click();
  await stalePage.getByLabel("Public title").fill("Stale tab overwrite");
  await stalePage.getByRole("button", { name: "Save and continue" }).click();
  await expect(stalePage.getByText(/changed in another tab/i)).toBeVisible();
  await stalePage.close();

  await page.getByLabel("Street address").fill("123 Main Street");
  await page.getByLabel("Postal code").fill("93301");
  await page.getByLabel("Hide exact address until the event starts").check();
  await page.getByRole("button", { name: "Save and continue" }).click();

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

  const waitingForReadyPhoto = page.getByRole("button", {
    name: "Waiting for a READY photo",
  });
  await expect(waitingForReadyPhoto).toBeDisabled();
  await expect(waitingForReadyPhoto).toHaveAttribute("aria-busy", "false");
  await expect(waitingForReadyPhoto).toHaveCSS("cursor", "not-allowed");
  await expect(
    page.getByText(
      "No photos are READY yet. Uploaded files count only after server image processing succeeds.",
    ),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Upload selected photos" }),
  ).toHaveCount(0);

  await page.route(
    "**/api/events/*/photos/reserve",
    async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 750));
      await route.continue();
    },
    { times: 1 },
  );
  await page.getByLabel(/Event photos/).setInputFiles([
    {
      name: "estate-photo.jpg",
      mimeType: "image/jpeg",
      buffer: image,
    },
    {
      name: "estate-photo-two.jpg",
      mimeType: "image/jpeg",
      buffer: image,
    },
  ]);
  await expect(
    page.getByRole("img", { name: /Selected preview for estate-photo/ }),
  ).toHaveCount(2);
  await expect
    .poll(async () =>
      page
        .getByRole("img", { name: /Selected preview for estate-photo/ })
        .evaluateAll((images) =>
          images.every((image) => (image as HTMLImageElement).naturalWidth > 0),
        ),
    )
    .toBe(true);
  await expect(
    page.getByRole("progressbar", {
      name: "Upload progress for estate-photo.jpg",
    }),
  ).toBeVisible();
  await expect(page.getByText("Status: READY")).toHaveCount(2, {
    timeout: 30_000,
  });
  const processedQueueThumbnails = page.getByRole("img", {
    name: /Processed thumbnail for estate-photo/,
  });
  await expect(processedQueueThumbnails).toHaveCount(2);
  await expect(processedQueueThumbnails.first()).toHaveAttribute(
    "src",
    /^\/media\//,
  );
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (
            window as Window & {
              __revokedPhotoPreviewCount?: number;
            }
          ).__revokedPhotoPreviewCount ?? 0,
      ),
    )
    .toBeGreaterThanOrEqual(2);
  const persistedThumbnails = page.getByRole("img", {
    name: /^Event photo \d+$/,
  });
  await expect(persistedThumbnails).toHaveCount(2);
  await expect
    .poll(async () =>
      persistedThumbnails.evaluateAll((images) =>
        images.every((image) => (image as HTMLImageElement).naturalWidth > 0),
      ),
    )
    .toBe(true);
  const completedQueueRow = page
    .getByRole("listitem")
    .filter({ hasText: "estate-photo.jpg" });
  await expect(
    completedQueueRow.getByRole("button", { name: "Dismiss" }),
  ).toBeVisible();
  await completedQueueRow.getByRole("button", { name: "Dismiss" }).click();
  await expect(completedQueueRow).toHaveCount(0);
  await expect(page.getByText("Status: READY")).toHaveCount(2);

  let interceptedCommittedFinalize = false;
  await page.route(
    "**/api/events/*/photos/*/finalize",
    async (route) => {
      const response = await route.fetch();
      expect(response.ok()).toBe(true);
      interceptedCommittedFinalize = true;
      await route.abort("failed");
    },
    { times: 1 },
  );
  await page.getByLabel(/Event photos/).setInputFiles({
    name: "ambiguous-response.jpg",
    mimeType: "image/jpeg",
    buffer: image,
  });
  await expect.poll(() => interceptedCommittedFinalize).toBe(true);
  const reconciledQueueRow = page
    .getByRole("listitem")
    .filter({ hasText: "ambiguous-response.jpg" });
  await expect(reconciledQueueRow.getByText(/Ready.*100%/)).toBeVisible({
    timeout: 30_000,
  });
  await expect(
    reconciledQueueRow.getByRole("img", {
      name: "Processed thumbnail for ambiguous-response.jpg",
    }),
  ).toHaveAttribute("src", /^\/media\//);
  await expect(
    reconciledQueueRow.getByRole("button", { name: "Retry" }),
  ).toHaveCount(0);
  await expect(
    reconciledQueueRow.getByRole("button", { name: "Dismiss" }),
  ).toBeVisible();
  await expect(page.getByText("Status: READY")).toHaveCount(3);

  const waitingForCover = page.getByRole("button", {
    name: "Select a cover to continue",
  });
  await expect(waitingForCover).toBeDisabled();
  await expect(waitingForCover).toHaveAttribute("aria-busy", "false");
  await expect(
    page.getByText(
      "3 photos are READY. Select a READY photo as the cover to continue.",
    ),
  ).toBeVisible();
  await page.getByRole("button", { name: "Make photo 1 cover" }).click();
  await expect(page.getByText("Photo changes saved.")).toBeVisible();
  await expect(
    page.getByText("3 photos are READY and the cover is selected."),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Save and continue" }),
  ).toBeEnabled();
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Review, approval and payment" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Photos" }).click();
  await expect(page.getByText("Status: READY")).toHaveCount(3);
  await expect(
    page.getByRole("img", { name: /^Event photo \d+$/ }),
  ).toHaveCount(3);
  await expect
    .poll(async () =>
      page
        .getByRole("img", { name: /^Event photo \d+$/ })
        .evaluateAll((images) =>
          images.every((image) => (image as HTMLImageElement).naturalWidth > 0),
        ),
    )
    .toBe(true);
  await page.getByLabel(/Event photos/).setInputFiles({
    name: "not-an-image.gif",
    mimeType: "image/gif",
    buffer: Buffer.from("not-an-image"),
  });
  await expect(
    page.getByText(
      "The new upload failed. Your existing cover and ready photos are unchanged.",
    ),
  ).toBeVisible();
  await expect(page.getByText("Status: READY")).toHaveCount(3);
  await expect(
    page.getByRole("button", { name: "Save and continue" }),
  ).toBeEnabled();
  await page.getByRole("button", { name: "Save and continue" }).click();

  await page.getByRole("link", { name: "Open exact listing preview" }).click();
  await expect(
    page.getByRole("heading", { name: "Oleander Estate Sale", level: 1 }),
  ).toBeVisible();
  await expect(
    page.getByText(/Exact address hidden until event start/),
  ).toBeVisible();
  await expect(page.getByText("123 Main Street")).toHaveCount(0);
  await page.getByRole("link", { name: "Return to editor" }).click();

  await page.getByLabel(/I accept publishing terms version/).check();
  await page.getByRole("button", { name: "Approve exact revision" }).click();
  await expect(page).toHaveURL(
    new RegExp(`/dashboard/events/${eventId}/payment`),
  );

  const approvedResponse = await page.request.get(`/api/events/${eventId}`);
  expect(approvedResponse.status()).toBe(200);
  const approvedPayload = (await approvedResponse.json()) as {
    readonly event: {
      readonly version: number;
      readonly approvedRevision: number;
    };
  };
  const repeatedApproval = await sameOriginPost(
    page,
    `/api/events/${eventId}/approval`,
    {
      expectedVersion: approvedPayload.event.version,
      acceptedTerms: true,
      termsVersion: PUBLISHING_TERMS_VERSION,
    },
  );
  expect(repeatedApproval.status).toBe(200);
  expect(repeatedApproval.body).toMatchObject({
    event: {
      version: approvedPayload.event.version,
      approvedRevision: approvedPayload.event.approvedRevision,
    },
  });

  await page.goto(`/dashboard/events/${eventId}/edit`);
  await expect(page.getByText(/Approval is saved/)).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Approve exact revision" }),
  ).toHaveCount(0);
  await expect(
    page.getByLabel(/I accept publishing terms version/),
  ).toHaveCount(0);
  await page.getByRole("link", { name: "Make payment" }).click();
  await expect(page).toHaveURL(
    new RegExp(`/dashboard/events/${eventId}/payment`),
  );
  await expect(page.getByText(/Your approval is saved/)).toBeVisible();
  await page.goto("/dashboard");
  await expect(
    page.getByRole("link", { name: "Continue payment" }),
  ).toBeVisible();

  await page.goto(`/dashboard/events/${eventId}/edit`);
  await page.getByRole("button", { name: "Details" }).click();
  await page.getByLabel("Public title").fill("Oleander Estate Sale Updated");
  await page.getByRole("button", { name: "Save and continue" }).click();
  await page.getByRole("button", { name: "Review", exact: true }).click();
  await expect(page.getByText("Approval", { exact: true })).toBeVisible();
  await expect(page.getByText("NOT APPROVED", { exact: true })).toBeVisible();
  await page.getByLabel(/I accept publishing terms version/).check();
  await page.getByRole("button", { name: "Approve exact revision" }).click();
  await expect(page).toHaveURL(
    new RegExp(`/dashboard/events/${eventId}/payment`),
  );

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
  await expect(otherPage.getByText("Organizer profile saved.")).toBeVisible();
  await otherPage.goto("/dashboard");
  await expect(
    otherPage.getByText("Organizer onboarding: COMPLETE."),
  ).toBeVisible();
  const denied = await otherPage.request.get(`/api/events/${eventId}`);
  expect(denied.status()).toBe(404);
  await otherPage.goto(`/dashboard/events/${eventId}/edit`);
  await expect(
    otherPage.getByText("This page could not be found."),
  ).toBeVisible();
  await expect(
    otherPage.getByRole("heading", {
      name: "Oleander Estate Sale Updated",
    }),
  ).toHaveCount(0);
  await otherContext.close();

  expect(browserErrors).toEqual([]);
});
