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

async function visibleMapPixels(
  page: Page,
  kind: "pin" | "area",
): Promise<number> {
  // Inspect rendered pixels rather than only the keyboard marker list: that
  // list still works when a missing worker leaves the actual map blank.
  const screenshot = await page.locator(".maplibregl-canvas").screenshot();
  const { data, info } = await sharp(screenshot)
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  let matching = 0;
  for (let index = 0; index < data.length; index += info.channels) {
    const red = data[index]!;
    const green = data[index + 1]!;
    const blue = data[index + 2]!;
    if (
      kind === "pin"
        ? red >= 160 && red <= 205 && green >= 95 && green <= 145 && blue < 60
        : red >= 175 && red > green * 1.8 && red > blue * 1.8
    )
      matching += 1;
  }
  return matching;
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
  additionalDates: readonly string[] = [],
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
  for (const additionalDate of additionalDates) {
    const label = new Intl.DateTimeFormat("en-US", {
      weekday: "long",
      month: "long",
      day: "numeric",
      year: "numeric",
      timeZone: "UTC",
    }).format(new Date(`${additionalDate}T12:00:00Z`));
    await page
      .getByRole("region", { name: "Choose your sale dates" })
      .getByRole("button", { name: label, exact: true })
      .click();
  }
  await page.getByRole("button", { name: "Save and continue" }).click();
  await page
    .getByLabel("Search the sale property address")
    .fill("123 Baker Street");
  await page.getByRole("option").getByRole("button").click();
  await page.getByLabel("I confirm this is the sale property.").check();
  await page.getByLabel("Hide address until", { exact: true }).check();
  await page.getByLabel("Address reveal date").fill(date);
  await page.getByLabel("Address reveal time").fill("06:00");
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
  await page
    .getByLabel(/I accept publishing terms and approve this event for payment/)
    .check();
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
}, testInfo) => {
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
    ["2027-08-29", "2027-08-30"],
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
  await expect(page.getByText(/Full address will be shown on/)).toBeVisible();
  await expect(page.getByText("123 Baker Street")).toHaveCount(0);
  await expect(page.getByRole("link", { name: email })).toHaveAttribute(
    "href",
    `mailto:${encodeURIComponent(email)}`,
  );
  await expect(
    page.getByText("Listed by Phase Four Estate Sales"),
  ).toBeVisible();
  await expect(
    page.getByRole("list", { name: "Daily sale hours" }).locator("li"),
  ).toHaveCount(3);
  await expect(
    page.getByRole("list", { name: "Daily sale hours" }),
  ).toContainText("1:00 PM");
  await page.screenshot({
    path: testInfo.outputPath("public-address-reveal.png"),
    fullPage: true,
  });

  // List responses deliberately omit map markers. Switching to Map must load
  // the public projection, while preserving this sale's hidden address.
  await page.goto(
    "/search?view=list&date=custom&from=2027-08-28&to=2027-08-28",
  );
  await expect(page.locator(".explore-list")).toContainText(
    "Seven Oaks Phase Four Sale",
  );
  await expect(page.locator(".maplibregl-canvas")).toHaveCount(0);
  await page.getByRole("button", { name: "Map View" }).first().click();
  const saleMarker = page.getByRole("button", {
    name: "Show Seven Oaks Phase Four Sale on the map",
  });
  await saleMarker.focus();
  await saleMarker.press("Enter");
  const preview = page.locator(".explore-map-preview");
  await expect(preview).toContainText("Seven Oaks Phase Four Sale");
  await expect(preview).toContainText("Address available");
  await expect(preview).toContainText("6:00 AM PDT");
  await expect(
    preview.getByRole("link", { name: /Get directions/ }),
  ).toHaveCount(0);
  await expect(page.getByText("123 Baker Street")).toHaveCount(0);
  await expect
    .poll(() => visibleMapPixels(page, "pin"), {
      message: "The protected sale pin must actually render on the map",
      timeout: 15_000,
    })
    .toBeGreaterThan(200);
  await page.screenshot({
    path: testInfo.outputPath("hidden-sale-map-overview.png"),
  });
  const zoomIn = page.getByRole("button", { name: "Zoom in", exact: true });
  await page.emulateMedia({ reducedMotion: "reduce" });
  for (let zoom = 0; zoom < 4; zoom += 1) {
    await zoomIn.click();
  }
  await expect
    .poll(() => visibleMapPixels(page, "area"), {
      message: "Zooming in must render the dashed approximate-location circle",
      timeout: 15_000,
    })
    .toBeGreaterThan(300);
  await page.screenshot({
    path: testInfo.outputPath("hidden-sale-map-neighborhood.png"),
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(preview.getByText(/Address available/)).toBeVisible();
  await expect(preview.getByText(/8:00 AM to 1:00 PM daily/)).toBeVisible();
  await page.screenshot({
    path: testInfo.outputPath("hidden-sale-map-mobile.png"),
  });
  await page.setViewportSize({ width: 1280, height: 720 });

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
