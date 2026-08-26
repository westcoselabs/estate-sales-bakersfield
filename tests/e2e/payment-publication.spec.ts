import { readFile } from "node:fs/promises";
import path from "node:path";

import { expect, test, type Page } from "@playwright/test";
import sharp from "sharp";

import {
  choosePhotoCover,
  chooseSingleDaySchedule,
  completeOrganizerProfile,
} from "./event-builder-support";

interface CapturedEmail {
  readonly kind: "EMAIL_VERIFICATION";
  readonly to: string;
  readonly actionUrl: string;
}

interface EventResponse {
  readonly event: {
    readonly id: string;
    readonly version: number;
    readonly futurePublicPath: string;
  };
}

const capturePath = path.resolve(".tmp/e2e-auth-emails.jsonl");
const runId = process.env.TEST_RUN_ID;
if (!runId || !/^testrun-[a-z0-9-]+$/.test(runId)) {
  throw new Error("Playwright requires a valid TEST_RUN_ID");
}

async function verifyLatestEmail(page: Page, email: string) {
  let captured: CapturedEmail | undefined;
  await expect
    .poll(async () => {
      const messages = (await readFile(capturePath, "utf8").catch(() => ""))
        .split(/\r?\n/)
        .filter(Boolean)
        .map((line) => JSON.parse(line) as CapturedEmail);
      captured = messages.filter((message) => message.to === email).at(-1);
      return Boolean(captured);
    })
    .toBe(true);
  const action = new URL(captured!.actionUrl);
  await page.goto(`${action.pathname}${action.search}`);
  await page.getByRole("button", { name: "Verify email" }).click();
}

async function createAccount(page: Page): Promise<string> {
  const suffix = crypto.randomUUID();
  const email = `${runId}-phase4-browser-${suffix}@example.test`;
  const password = "phase-four-browser-password";
  await page.goto("/signup");
  await page.getByLabel("Display name").fill("Phase four owner");
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByLabel("Confirm password").fill(password);
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.getByText(/verification instructions/i)).toBeVisible();
  await verifyLatestEmail(page, email);
  await page.goto("/login");
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
  await completeOrganizerProfile(page, {
    displayName: "Phase Four Estate Sales",
    contactName: "Phase four owner",
    contactEmail: email,
  });
  return email;
}

async function buildApprovedEvent(
  page: Page,
  title: string,
  date: string,
): Promise<EventResponse["event"]> {
  await page.goto("/dashboard");
  await page.getByLabel("Sale type").selectOption("ESTATE_SALE");
  await page.getByRole("button", { name: "Create event" }).click();
  await expect(page).toHaveURL(/\/dashboard\/events\/[0-9a-f-]+\/edit$/);
  const eventId = page.url().match(/events\/([^/]+)\/edit/)?.[1];
  if (!eventId) throw new Error("Event editor did not expose an event ID");

  await page.getByLabel("Public title").fill(title);
  await page
    .getByLabel("Public description")
    .fill(
      "A deterministic Phase 4 estate sale with furniture, art, books, and collectible household pieces.",
    );
  await page.getByRole("button", { name: "Save and continue" }).click();
  await chooseSingleDaySchedule(page, date);
  await page.getByRole("button", { name: "Save and continue" }).click();
  await page
    .getByLabel("Search the sale property address")
    .fill("123 Baker Street");
  await page.getByRole("option").getByRole("button").click();
  await page.getByLabel("I confirm this is the sale property.").check();
  await page.getByLabel("Hide exact address until the event starts").check();
  await page.getByRole("button", { name: "Save and continue" }).click();

  const image = await sharp({
    create: {
      width: 900,
      height: 600,
      channels: 3,
      background: "#806242",
    },
  })
    .jpeg()
    .toBuffer();
  await page.getByLabel(/Event photos/).setInputFiles({
    name: "phase4-estate-photo.jpg",
    mimeType: "image/jpeg",
    buffer: image,
  });
  const photoManager = page.getByRole("list", {
    name: "Photo uploads and event photo order",
  });
  await expect(photoManager.getByText("Ready", { exact: true })).toBeVisible({
    timeout: 30_000,
  });
  await expect(
    page.getByText(
      "1 photo uploaded successfully. Select a cover photo to continue.",
    ),
  ).toBeVisible();
  await choosePhotoCover(page, "phase4-estate-photo.jpg");
  await page.getByRole("button", { name: "Save and continue" }).click();
  await page.getByLabel(/I accept publishing terms version/).check();
  await page.getByRole("button", { name: "Approve exact revision" }).click();
  await expect(page).toHaveURL(
    new RegExp(`/dashboard/events/${eventId}/payment`),
  );

  const response = await page.request.get(`/api/events/${eventId}`);
  expect(response.ok()).toBe(true);
  return ((await response.json()) as EventResponse).event;
}

test("pays and publishes from a fake signed webhook while stale paid revisions remain private", async ({
  page,
}) => {
  test.setTimeout(180_000);
  await page.context().setExtraHTTPHeaders({
    "x-forwarded-for": `e2e-payment-${crypto.randomUUID()}`,
  });
  const browserErrors: string[] = [];
  page.on("pageerror", (error) => browserErrors.push(error.message));
  const email = await createAccount(page);

  const publishable = await buildApprovedEvent(
    page,
    "Seven Oaks Phase Four Sale",
    "2027-08-28",
  );
  expect((await page.request.get(publishable.futurePublicPath)).status()).toBe(
    404,
  );

  await page.goto(
    `/dashboard/events/${publishable.id}/payment/success?session_id=cs_test_untrusted_hint`,
  );
  await expect(
    page.getByText(/return from Checkout is not proof/i),
  ).toBeVisible();
  expect((await page.request.get(publishable.futurePublicPath)).status()).toBe(
    404,
  );

  await page.goto(`/dashboard/events/${publishable.id}/payment`);
  await page.getByRole("button", { name: "Pay and publish" }).click();
  await expect(page).toHaveURL(/\/test-checkout\/cs_test_/);
  const originalCheckoutUrl = page.url();
  await expect(page.getByText("$12.34")).toBeVisible();

  await page.goto(`/dashboard/events/${publishable.id}/edit`);
  await expect(page.getByText(/Approval is saved/)).toBeVisible();
  await page.getByRole("link", { name: "Make payment" }).click();
  await expect(
    page.getByRole("button", { name: "Continue to Checkout" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Continue to Checkout" }).click();
  await expect(page).toHaveURL(originalCheckoutUrl);

  await page.getByRole("button", { name: "Complete test payment" }).click();
  await expect(page).toHaveURL(
    new RegExp(`/dashboard/events/${publishable.id}/payment/success`),
  );
  await expect(
    page.getByRole("heading", { name: "Your listing is live" }),
  ).toBeVisible();
  await page.getByRole("link", { name: "View live listing" }).click();
  await expect(
    page.getByRole("heading", { name: "Seven Oaks Phase Four Sale" }),
  ).toBeVisible();
  await expect(
    page.getByText("Address releases when the sale starts"),
  ).toBeVisible();
  await expect(page.getByText("123 Baker Street")).toHaveCount(0);
  await expect(page.getByRole("link", { name: email })).toHaveAttribute(
    "href",
    `mailto:${encodeURIComponent(email)}`,
  );
  await expect(
    page.getByText("Listed by Phase Four Estate Sales"),
  ).toBeVisible();

  await page.goto(`/dashboard/events/${publishable.id}/edit`);
  await expect(page.getByText("This listing is published.")).toBeVisible();
  await expect(page.getByRole("link", { name: "Make payment" })).toHaveCount(0);
  await expect(
    page.getByRole("link", { name: "View live listing" }),
  ).toBeVisible();
  await page.goto(`/dashboard/events/${publishable.id}/preview`);
  await expect(page.getByRole("link", { name: "Make payment" })).toHaveCount(0);
  await expect(
    page.getByRole("link", { name: "View live listing" }),
  ).toBeVisible();
  await page.goto(`/dashboard/events/${publishable.id}/payment`);
  await expect(page.getByText(/no further payment is required/i)).toBeVisible();
  await expect(page.getByRole("button", { name: /pay|checkout/i })).toHaveCount(
    0,
  );

  const stale = await buildApprovedEvent(
    page,
    "Stale Revision Phase Four Sale",
    "2027-08-29",
  );
  await page.goto(`/dashboard/events/${stale.id}/payment`);
  await page.getByRole("button", { name: "Pay and publish" }).click();
  await expect(page).toHaveURL(/\/test-checkout\/cs_test_/);
  const checkoutUrl = page.url();

  await page.goto(`/dashboard/events/${stale.id}/edit`);
  await page.getByRole("button", { name: "Details" }).click();
  await page
    .getByLabel("Public title")
    .fill("Materially Edited After Checkout");
  await page.getByRole("button", { name: "Save and continue" }).click();
  await expect(
    page.getByRole("heading", { name: "Schedule your sale" }),
  ).toBeVisible();
  const changed = (await (
    await page.request.get(`/api/events/${stale.id}`)
  ).json()) as EventResponse;

  await page.goto(checkoutUrl);
  await page.getByRole("button", { name: "Complete test payment" }).click();
  await expect(page).toHaveURL(
    new RegExp(`/dashboard/events/${stale.id}/payment/success`),
  );
  await expect(
    page.getByRole("heading", { name: "Publication status" }),
  ).toBeVisible();
  await expect(page.getByText("Publication needs attention")).toBeVisible();
  expect((await page.request.get(stale.futurePublicPath)).status()).toBe(404);
  expect(
    (await page.request.get(changed.event.futurePublicPath)).status(),
  ).toBe(404);
  expect(browserErrors).toEqual([]);
});
