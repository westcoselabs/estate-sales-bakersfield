import { readFile } from "node:fs/promises";
import path from "node:path";

import { expect, test, type Page } from "@playwright/test";
import sharp from "sharp";

import { PUBLISHING_TERMS_VERSION } from "@/modules/events/application/policy";

import {
  choosePhotoCover,
  chooseSingleDaySchedule,
  completeOrganizerProfile,
} from "./event-builder-support";

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
  await page.getByLabel("Email", { exact: true }).fill(email);
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
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
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

test("completes the account, recovery, session, and optional profile lifecycle", async ({
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

  await page.goto("/dashboard/profile");
  await page
    .getByLabel("Business or organizer name (required, shown publicly)")
    .fill("Main Estate Sales");
  await page.getByLabel("Contact name (required, kept private)").fill("Owner");
  await page.getByLabel("Contact email (required, kept private)").fill(email);
  await page.getByLabel("Website (optional)").fill("main-estate.example.test");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByText("Profile saved.")).toBeVisible();

  const secondContext = await browser.newContext();
  const secondPage = await secondContext.newPage();
  await registerAndVerify(secondPage, otherEmail, "Other owner", password);
  await login(secondPage, otherEmail, password);
  await secondPage.goto("/dashboard/organizer");
  await expect(secondPage).toHaveURL(/\/dashboard\/profile$/);
  await secondPage
    .getByLabel("Business or organizer name (required, shown publicly)")
    .fill("Other Estate Sales");
  await secondPage
    .getByLabel("Contact name (required, kept private)")
    .fill("Other owner");
  await secondPage
    .getByLabel("Contact email (required, kept private)")
    .fill(otherEmail);
  await secondPage.getByRole("button", { name: "Save", exact: true }).click();
  await expect(secondPage.getByText("Profile saved.")).toBeVisible();
  await page.reload();
  await expect(
    page.getByLabel("Business or organizer name (required, shown publicly)"),
  ).toHaveValue("Main Estate Sales");
  await expect(page.getByLabel("Website (optional)")).toHaveValue(
    "https://main-estate.example.test",
  );

  const parallelSession = await browser.newContext();
  const parallelPage = await parallelSession.newPage();
  await login(parallelPage, email, password);

  await page.goto("/forgot-password");
  await page.getByLabel("Email", { exact: true }).fill(email);
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

  await page.getByLabel("Email", { exact: true }).fill("unknown@example.test");
  await page.getByLabel("Password").fill("not-the-right-password");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(
    page.getByText("The email or password was not accepted. Please try again."),
  ).toBeVisible();

  await secondContext.close();
  await parallelSession.close();
  expect(pageErrors).toEqual([]);
});

test("supports unverified drafting while preserving publishing verification gates", async ({
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
  await page.getByLabel("Email", { exact: true }).fill(email);
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
  await expect(page.getByText(/continue building your event/i)).toBeVisible();

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

  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(
    page.getByRole("heading", { name: "Verify your email" }),
  ).toBeVisible();
  await expect(
    page.getByText(
      "You can keep building your event now. Verify before review and approval.",
    ),
  ).toBeVisible();

  await page.goto("/dashboard");
  await page.getByLabel("Sale type").selectOption("ESTATE_SALE");
  await page.getByRole("button", { name: "Create event" }).click();
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
  const reservation = await sameOriginPost(
    page,
    `/api/events/${eventId}/photos/reserve`,
    {
      expectedVersion,
      contentType: "image/jpeg",
      fileName: "unverified-draft.jpg",
    },
  );
  expect(reservation.status).toBe(201);

  const approval = await sameOriginPost(
    page,
    `/api/events/${eventId}/approval`,
    {
      expectedVersion,
      acceptedTerms: true,
      termsVersion: PUBLISHING_TERMS_VERSION,
    },
  );
  expect(approval).toMatchObject({
    status: 403,
    body: { code: "EMAIL_VERIFICATION_REQUIRED" },
  });
  const checkout = await sameOriginPost(
    page,
    `/api/events/${eventId}/checkout`,
    {
      expectedVersion,
    },
  );
  expect(checkout).toMatchObject({
    status: 403,
    body: { code: "EMAIL_VERIFICATION_REQUIRED" },
  });

  await page.goto("/dashboard");
  await page.getByRole("button", { name: "Send verification email" }).click();
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

test("denies anonymous profile access and retains security headers", async ({
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
  await completeOrganizerProfile(page, {
    displayName: "Main Estate Sales",
    contactName: "Phase three owner",
    contactEmail: email,
    website: "main-estate.example.test",
  });

  await page.getByLabel("Sale type").selectOption("ESTATE_SALE");
  await page.getByRole("button", { name: "Create event" }).click();
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
    page.getByRole("heading", { name: "Schedule your sale" }),
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
  await chooseSingleDaySchedule(page, "2026-09-05");
  await page.getByRole("button", { name: "Save and continue" }).click();
  await expect(
    page.getByRole("heading", { name: "Address and privacy" }),
  ).toBeVisible();

  await stalePage.getByRole("button", { name: "Details" }).click();
  await stalePage.getByLabel("Public title").fill("Stale tab overwrite");
  await stalePage.getByRole("button", { name: "Save and continue" }).click();
  await expect(
    stalePage.getByText("Details saved and confirmed by the server."),
  ).toBeVisible();
  await expect(
    stalePage.getByRole("region", { name: "Sale schedule details" }),
  ).toContainText("September 5, 2026");
  await stalePage.close();

  await page
    .getByLabel("Search the sale property address")
    .fill("123 Baker Street");
  await page.getByRole("option").getByRole("button").click();
  await expect(
    page.getByRole("region", {
      name: /Map showing the selected sale property/,
    }),
  ).toBeVisible();
  await page.getByLabel("I confirm this is the sale property.").check();
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
    name: "Add a photo to continue",
  });
  await expect(waitingForReadyPhoto).toBeDisabled();
  await expect(waitingForReadyPhoto).toHaveAttribute("aria-busy", "false");
  await expect(waitingForReadyPhoto).toHaveCSS("cursor", "not-allowed");
  await expect(
    page.getByText("Add at least one photo to continue."),
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
  const photoManager = page.getByRole("list", {
    name: "Photo uploads and event photo order",
  });
  await expect(photoManager.getByText("Ready", { exact: true })).toHaveCount(
    2,
    { timeout: 30_000 },
  );
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
  await expect(
    reconciledQueueRow.getByText("Ready", { exact: true }),
  ).toBeVisible({ timeout: 30_000 });
  await expect(
    reconciledQueueRow.getByRole("img", {
      name: "Processed thumbnail for ambiguous-response.jpg",
    }),
  ).toHaveAttribute("src", /^\/media\//);
  await expect(
    reconciledQueueRow.getByRole("button", { name: "Retry" }),
  ).toHaveCount(0);
  await expect(photoManager.getByText("Ready", { exact: true })).toHaveCount(3);
  await expect(
    page.getByText(
      "1 photo uploaded successfully. Select a cover photo to continue.",
    ),
  ).toBeVisible();

  const waitingForCover = page.getByRole("button", {
    name: "Choose a cover to continue",
  });
  await expect(waitingForCover).toBeDisabled();
  await expect(waitingForCover).toHaveAttribute("aria-busy", "false");
  await expect(
    page.getByText(
      "3 photos have finished processing. Choose a cover to continue.",
    ),
  ).toBeVisible();
  await choosePhotoCover(page, "estate-photo.jpg");
  await expect(page.getByText("Photo changes saved.")).toBeVisible();
  await expect(
    page.getByText("3 photos are uploaded and the cover is selected."),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Save and continue" }),
  ).toBeEnabled();
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Review, approval and payment" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Photos" }).click();
  await expect(
    page
      .getByRole("list", { name: "Photo uploads and event photo order" })
      .getByText("READY", { exact: true }),
  ).toHaveCount(3);
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
  const invalidPhotoRow = page
    .locator(".photo-manager__list > li")
    .filter({ hasText: "not-an-image.gif" });
  await expect(
    invalidPhotoRow.getByRole("button", { name: "Retry" }),
  ).toHaveCount(0);
  for (const width of [360, 390, 430]) {
    await page.setViewportSize({ width, height: 844 });
    const rowBox = await invalidPhotoRow.boundingBox();
    const removeBox = await invalidPhotoRow
      .getByRole("button", { name: "Remove" })
      .boundingBox();
    expect(rowBox).not.toBeNull();
    expect(removeBox).not.toBeNull();
    expect((rowBox?.x ?? 0) + (rowBox?.width ?? 0)).toBeLessThanOrEqual(width);
    expect(removeBox?.height ?? 0).toBeGreaterThanOrEqual(44);
    expect(
      await page.evaluate(
        () =>
          document.documentElement.scrollWidth <=
          document.documentElement.clientWidth,
      ),
    ).toBe(true);
  }
  await expect(
    page
      .getByRole("list", { name: "Photo uploads and event photo order" })
      .locator(":scope > li[data-status='ready']"),
  ).toHaveCount(3);
  await expect(
    page.getByRole("button", { name: "Save and continue" }),
  ).toBeEnabled();
  await page.getByRole("button", { name: "Save and continue" }).click();

  await page.getByRole("link", { name: "Open exact listing preview" }).click();
  await expect(
    page.getByRole("heading", { name: "Stale tab overwrite", level: 1 }),
  ).toBeVisible();
  await expect(
    page.getByText(/exact address that will be released/i),
  ).toBeVisible();
  await expect(page.getByText("123 Baker Street")).toBeVisible();
  await expect(page.getByText("Listed by Main Estate Sales")).toBeVisible();
  await expect(page.getByRole("link", { name: "Website" })).toHaveAttribute(
    "href",
    "https://main-estate.example.test/",
  );
  await expect(page.getByRole("link", { name: email })).toHaveAttribute(
    "href",
    `mailto:${encodeURIComponent(email)}`,
  );
  await page.getByRole("link", { name: "Exit preview" }).click();

  await expect(
    page.getByText(
      `Your verified email address, ${email}, will be visible on the live listing.`,
      { exact: true },
    ),
  ).toBeVisible();
  await expect(page.getByRole("checkbox")).toHaveCount(1);
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
  await expect(otherPage).toHaveURL(/\/dashboard\/profile$/);
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
