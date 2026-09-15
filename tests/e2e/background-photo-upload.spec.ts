import { readFile } from "node:fs/promises";
import path from "node:path";

import { expect, test, type Page } from "@playwright/test";
import sharp from "sharp";

import {
  choosePhotoCover,
  chooseSingleDaySchedule,
} from "./event-builder-support";

const runId = process.env.TEST_RUN_ID;
if (!runId || !/^testrun-[a-z0-9-]+$/.test(runId)) {
  throw new Error("Playwright requires a valid TEST_RUN_ID");
}

interface EventResponse {
  readonly event: {
    readonly version: number;
    readonly title: string;
    readonly description: string;
    readonly photos: readonly {
      readonly id: string;
      readonly status: string;
      readonly isCover: boolean;
      readonly errorCode: string | null;
    }[];
  };
}

async function createVerifiedOrganizer(page: Page, email: string) {
  const password = "background-photo-upload-browser-password";
  await page.goto("/signup");
  await page.getByLabel("Display name").fill("Background photo owner");
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByLabel("Confirm password").fill(password);
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.getByText(/verification instructions/i)).toBeVisible();
  let actionUrl: string | undefined;
  await expect
    .poll(
      async () => {
        const captured = await readFile(
          path.resolve(".tmp/e2e-auth-emails.jsonl"),
          "utf8",
        ).catch(() => "");
        const messages = captured
          .split(/\r?\n/)
          .filter(Boolean)
          .map(
            (line) =>
              JSON.parse(line) as {
                readonly kind: string;
                readonly to: string;
                readonly actionUrl: string;
              },
          );
        actionUrl = messages
          .filter(
            (message) =>
              message.to === email && message.kind === "EMAIL_VERIFICATION",
          )
          .at(-1)?.actionUrl;
        return Boolean(actionUrl);
      },
      { timeout: 10_000 },
    )
    .toBe(true);
  const action = new URL(actionUrl!);
  await page.goto(`${action.pathname}${action.search}`);
  await page.getByRole("button", { name: "Verify email" }).click();
  await expect(page).toHaveURL(/\/login\?verified=1$/);
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
}

async function portraitPhoto() {
  // Four colored source edges make an accidental crop observable in pixels.
  return sharp(
    Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="600" height="1000">
    <rect width="600" height="1000" fill="#ece5d8"/>
    <rect width="600" height="50" fill="#de3d32"/>
    <rect y="950" width="600" height="50" fill="#315de0"/>
    <rect y="50" width="50" height="900" fill="#12ad55"/>
    <rect x="550" y="50" width="50" height="900" fill="#efb412"/>
  </svg>`),
  )
    .jpeg({ quality: 95 })
    .toBuffer();
}

test("uploads in the background while review and unsaved details stay usable", async ({
  page,
}, testInfo) => {
  test.setTimeout(180_000);
  const suffix = crypto.randomUUID();
  const email = `${runId}-background-photo-${suffix}@example.test`;
  await page.context().setExtraHTTPHeaders({
    "x-forwarded-for": `e2e-background-photo-${suffix}`,
  });
  await createVerifiedOrganizer(page, email);
  await page.getByRole("button", { name: "Create event" }).click();
  await expect(page).toHaveURL(/\/dashboard\/events\/[0-9a-f-]+\/edit$/);
  const eventId = page.url().match(/events\/([^/]+)\/edit/)?.[1];
  if (!eventId)
    throw new Error("The editor did not expose the created event ID");
  const originalTitle = "Background Pipeline Sale";
  await page.getByLabel("Public title").fill(originalTitle);
  await page
    .getByLabel("Public description")
    .fill(
      "Furniture, art, books, and household items in a sale with several photographs.",
    );
  await page.getByRole("button", { name: "Save and continue" }).click();
  const today = new Date();
  const date = new Date(
    Date.UTC(today.getUTCFullYear(), today.getUTCMonth() + 1, 4),
  )
    .toISOString()
    .slice(0, 10);
  await chooseSingleDaySchedule(page, date);
  await page.getByRole("button", { name: "Save and continue" }).click();
  await page
    .getByLabel("Search the sale property address")
    .fill("123 Baker Street");
  await page.getByRole("option").getByRole("button").click();
  await page.getByLabel("I confirm this is the sale property.").check();
  await page.getByLabel("Show exact address", { exact: true }).check();
  await page.getByRole("button", { name: "Save and continue" }).click();
  await expect(
    page.getByRole("heading", { name: "Photos", exact: true }),
  ).toBeVisible();

  let releaseSlowUpload!: () => void;
  const slowUploadGate = new Promise<void>((resolve) => {
    releaseSlowUpload = resolve;
  });
  const fileNamesByKey = new Map<string, string>();
  const transferCounts = new Map<string, number>();
  const transferredBytes = new Map<string, number>();
  const finalizeCounts = new Map<string, number>();
  let slowUploadHeld = false;
  let busyPhotoId: string | undefined;

  await page.route("**/api/events/*/photos/reserve", async (route) => {
    const fileName = (route.request().postDataJSON() as { fileName: string })
      .fileName;
    const response = await route.fetch();
    expect(response.ok()).toBe(true);
    const payload = (await response.json()) as {
      reservation: { uploadUrl: string };
    };
    const key = new URL(payload.reservation.uploadUrl).searchParams.get("key");
    if (!key) throw new Error("Expected an isolated direct photo upload URL");
    fileNamesByKey.set(key, fileName);
    await route.fulfill({ response });
  });
  await page.route("**/api/test-media-upload?*", async (route) => {
    const key = new URL(route.request().url()).searchParams.get("key")!;
    const fileName = fileNamesByKey.get(key);
    if (!fileName)
      throw new Error("A direct upload started without its reservation");
    transferCounts.set(fileName, (transferCounts.get(fileName) ?? 0) + 1);
    transferredBytes.set(
      fileName,
      route.request().postDataBuffer()?.length ?? 0,
    );
    if (fileName === "slow-portrait.jpg") {
      slowUploadHeld = true;
      await slowUploadGate;
    }
    if (
      fileName === "retry-transfer.jpg" &&
      transferCounts.get(fileName) === 1
    ) {
      await route.fulfill({ status: 503, body: "Temporary upload failure" });
      return;
    }
    await route.continue();
  });
  await page.route("**/api/events/*/photos/*/finalize", async (route) => {
    const photoId = route
      .request()
      .url()
      .match(/photos\/([^/]+)\/finalize/)?.[1];
    if (!photoId) throw new Error("Missing finalization photo ID");
    finalizeCounts.set(photoId, (finalizeCounts.get(photoId) ?? 0) + 1);
    if (!busyPhotoId) {
      busyPhotoId = photoId;
      await route.fulfill({
        status: 429,
        contentType: "application/json",
        headers: { "Retry-After": "1" },
        body: JSON.stringify({
          code: "PROCESSING_BUSY",
          error: "Processing is busy. Please retry shortly.",
        }),
      });
      return;
    }
    await route.continue();
  });

  try {
    const portrait = await portraitPhoto();
    const landscape = await sharp({
      create: { width: 1200, height: 600, channels: 3, background: "#8c9b77" },
    })
      .jpeg()
      .toBuffer();
    const largeLandscape = await sharp("public/images/marketplace-hero.webp")
      .resize(4000, 3000, { fit: "cover" })
      .jpeg({ quality: 98 })
      .toBuffer();
    expect(largeLandscape.length).toBeGreaterThan(512 * 1024);
    await page.getByLabel(/Event photos/).setInputFiles([
      { name: "slow-portrait.jpg", mimeType: "image/jpeg", buffer: portrait },
      { name: "fast-landscape.jpg", mimeType: "image/jpeg", buffer: landscape },
      {
        name: "next-landscape.jpg",
        mimeType: "image/jpeg",
        buffer: largeLandscape,
      },
    ]);
    await expect.poll(() => slowUploadHeld).toBe(true);
    const manager = page.getByRole("list", {
      name: "Photo uploads and event photo order",
    });
    await expect(
      manager.locator(":scope > li[data-status='ready']"),
    ).toHaveCount(2, { timeout: 30_000 });
    await expect(
      manager.locator(":scope > li").filter({ hasText: "slow-portrait.jpg" }),
    ).toHaveAttribute("data-status", "uploading");
    expect(busyPhotoId).toBeDefined();
    expect(finalizeCounts.get(busyPhotoId!)).toBe(2);
    expect([...transferCounts.values()]).toEqual([1, 1, 1]);
    expect(transferredBytes.get("next-landscape.jpg")).toBeGreaterThan(0);
    expect(transferredBytes.get("next-landscape.jpg")).toBeLessThan(
      largeLandscape.length / 2,
    );

    const uploadProgress = page.getByRole("region", {
      name: "Photo upload progress",
    });
    await expect(uploadProgress).toContainText("2 of 3 photos ready");
    await uploadProgress
      .getByRole("button", { name: "Continue to review" })
      .click();
    await expect(
      page.getByRole("heading", { name: "Review, approval and payment" }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Approve exact revision" }),
    ).toBeDisabled();
    await expect(uploadProgress).toBeVisible();

    await page.getByRole("button", { name: "Details", exact: true }).click();
    const editedTitle = "Unsaved Title Survives Background Photos";
    const editedDescription =
      "These unsaved details must remain while the last photograph finishes processing in the background.";
    await page.getByLabel("Public title").fill(editedTitle);
    await page.getByLabel("Public description").fill(editedDescription);
    releaseSlowUpload();
    await expect(uploadProgress).toHaveCount(0, { timeout: 30_000 });
    await expect(page.getByLabel("Public title")).toHaveValue(editedTitle);
    await expect(page.getByLabel("Public description")).toHaveValue(
      editedDescription,
    );
    const unsaved = (await (
      await page.request.get(`/api/events/${eventId}`)
    ).json()) as EventResponse;
    expect(unsaved.event.title).toBe(originalTitle);
    expect(
      unsaved.event.photos.filter((photo) => photo.status === "READY"),
    ).toHaveLength(3);
    expect([...transferCounts.values()]).toEqual([1, 1, 1]);

    await page.getByRole("button", { name: "Save and continue" }).click();
    await expect(
      page.getByRole("heading", { name: "Schedule your sale" }),
    ).toBeVisible();
    const saved = (await (
      await page.request.get(`/api/events/${eventId}`)
    ).json()) as EventResponse;
    expect(saved.event).toMatchObject({
      title: editedTitle,
      description: editedDescription,
    });
    await page.getByRole("button", { name: "Photos", exact: true }).click();
    await choosePhotoCover(page, "slow-portrait.jpg");
    await expect(page.getByText("Photo changes saved.")).toBeVisible();
    const cover = page.getByRole("img", { name: "Selected listing cover" });
    await expect(cover).toHaveAttribute("src", /^\/media\/[^/]+\/gallery$/);
    await expect(cover).toHaveCSS("object-fit", "contain");
    await expect
      .poll(() =>
        cover.evaluate((image) => {
          const photo = image as HTMLImageElement;
          return photo.naturalHeight > 0
            ? photo.naturalWidth / photo.naturalHeight
            : 0;
        }),
      )
      .toBe(0.6);
    const { data, info } = await sharp(await cover.screenshot())
      .removeAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    const edges = { top: 0, bottom: 0, left: 0, right: 0 };
    for (let index = 0; index < data.length; index += info.channels) {
      const red = data[index]!;
      const green = data[index + 1]!;
      const blue = data[index + 2]!;
      if (red > 180 && green < 95 && blue < 95) edges.top += 1;
      if (blue > 170 && red < 100 && green < 130) edges.bottom += 1;
      if (green > 135 && red < 65 && blue < 125) edges.left += 1;
      if (red > 195 && green > 135 && green < 205 && blue < 65)
        edges.right += 1;
    }
    for (const count of Object.values(edges)) expect(count).toBeGreaterThan(20);
    await page.locator(".builder-preview-card").screenshot({
      path: testInfo.outputPath("uncropped-background-upload-cover.png"),
    });

    // Retry replaces the failed transfer's reservation without dropping the
    // ready photos or the cover already selected for this sale.
    const selectedCoverUrl = await cover.getAttribute("src");
    await page.getByLabel(/Event photos/).setInputFiles({
      name: "retry-transfer.jpg",
      mimeType: "image/jpeg",
      buffer: landscape,
    });
    const retryRow = manager
      .locator(":scope > li")
      .filter({ hasText: "retry-transfer.jpg" });
    await expect(retryRow).toHaveAttribute("data-status", "failed", {
      timeout: 30_000,
    });
    await expect(
      retryRow.getByRole("button", { name: "Retry", exact: true }),
    ).toBeEnabled();
    await retryRow.getByRole("button", { name: "Retry", exact: true }).click();
    await expect(retryRow).toHaveAttribute("data-status", "ready", {
      timeout: 30_000,
    });
    await expect(uploadProgress).toHaveCount(0, { timeout: 30_000 });
    await expect(cover).toHaveAttribute("src", selectedCoverUrl!);
    const retried = (await (
      await page.request.get(`/api/events/${eventId}`)
    ).json()) as EventResponse;
    const activePhotos = retried.event.photos.filter(
      (photo) => photo.errorCode !== "MEDIA_DELETION_PENDING",
    );
    const removedPhotos = retried.event.photos.filter(
      (photo) => photo.errorCode === "MEDIA_DELETION_PENDING",
    );
    expect(activePhotos).toHaveLength(4);
    expect(activePhotos.every((photo) => photo.status === "READY")).toBe(true);
    expect(activePhotos.filter((photo) => photo.isCover)).toHaveLength(1);
    expect(removedPhotos).toHaveLength(1);
    expect(removedPhotos[0]).toMatchObject({
      status: "FAILED",
      isCover: false,
      errorCode: "MEDIA_DELETION_PENDING",
    });
    expect(transferCounts.get("retry-transfer.jpg")).toBe(2);
    for (const fileName of [
      "slow-portrait.jpg",
      "fast-landscape.jpg",
      "next-landscape.jpg",
    ]) {
      expect(transferCounts.get(fileName)).toBe(1);
    }

    await page.getByRole("button", { name: "Save and continue" }).click();
    await expect(
      page.getByRole("heading", { name: "Review, approval and payment" }),
    ).toBeVisible();
    await page
      .getByLabel(
        /I accept publishing terms and approve this event for payment/,
      )
      .check();
    await expect(page.getByText("Draft state", { exact: true })).toHaveCount(0);
    await expect(
      page.getByText("Content revision", { exact: true }),
    ).toHaveCount(0);
    await expect(page.getByText(/All server requirements/)).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: "Approve exact revision" }),
    ).toBeDisabled();
    await expect(
      page.getByRole("link", { name: "Complete your profile" }),
    ).toBeVisible();
    await page.goto(`/dashboard/events/${eventId}/preview`);
    await expect(
      page.getByRole("heading", { name: "Preview is not ready" }),
    ).toBeVisible();
    await expect(page.getByText(/server-validated/)).toHaveCount(0);
    await page.getByRole("link", { name: "Complete your profile" }).click();
    await expect(page).toHaveURL(/\/dashboard\/profile\?returnTo=/);
    await expect(
      page.getByRole("link", { name: "Back to your event" }),
    ).toHaveAttribute("href", `/dashboard/events/${eventId}/edit`);
    await page
      .getByLabel("Business or organizer name (required, shown publicly)")
      .fill("Background Photo Estate Sales");
    await page
      .getByLabel("Contact name (required, kept private)")
      .fill("Background photo owner");
    await page.getByLabel("Contact email (required, kept private)").fill(email);
    await page.getByRole("button", { name: "Save", exact: true }).click();
    await expect(page).toHaveURL(
      new RegExp(`/dashboard/events/${eventId}/edit$`),
    );
    await expect(
      page.getByRole("heading", { name: "Review, approval and payment" }),
    ).toBeVisible();
    await page
      .getByLabel(
        /I accept publishing terms and approve this event for payment/,
      )
      .check();
    await expect(
      page.getByRole("button", { name: "Approve exact revision" }),
    ).toBeEnabled();
    await page.goto(`/dashboard/events/${eventId}/preview`);
    await page.setViewportSize({ width: 1440, height: 1000 });
    const details = page.locator(".public-listing-detail-tabs");
    const about = page.locator(".public-listing-about");
    const pictures = page.locator(".public-gallery-section");
    await expect(about).toBeVisible();
    await expect(pictures).toBeVisible();
    await pictures.scrollIntoViewIfNeeded();
    await expect
      .poll(() =>
        pictures
          .locator("img")
          .evaluateAll(
            (images) =>
              images.length > 0 &&
              images.every(
                (image) => (image as HTMLImageElement).naturalWidth > 0,
              ),
          ),
      )
      .toBe(true);
    const detailBox = await details.boundingBox();
    for (const card of [about, pictures]) {
      const box = await card.boundingBox();
      expect(Math.abs(box!.width - detailBox!.width)).toBeLessThan(2);
      expect(Math.abs(box!.x - detailBox!.x)).toBeLessThan(2);
    }
    await details.screenshot({
      path: testInfo.outputPath("desktop-full-width-details.png"),
    });
    await page.setViewportSize({ width: 390, height: 844 });
    const toggle = page.getByRole("tablist", { name: "Listing details" });
    await expect(toggle).toBeVisible();
    const toggleBox = await toggle.boundingBox();
    const mobileDetails = await details.boundingBox();
    expect(toggleBox!.width).toBeLessThan(mobileDetails!.width - 30);
    expect(
      Math.abs(
        toggleBox!.x +
          toggleBox!.width / 2 -
          mobileDetails!.x -
          mobileDetails!.width / 2,
      ),
    ).toBeLessThan(2);
    const aboutTab = page.getByRole("tab", { name: "About", exact: true });
    const picturesTab = page.getByRole("tab", {
      name: "Pictures",
      exact: true,
    });
    expect(
      Math.abs(
        (await aboutTab.boundingBox())!.width -
          (await picturesTab.boundingBox())!.width,
      ),
    ).toBeLessThan(2);
    await expect(pictures).not.toBeVisible();
    await page
      .locator(".public-listing-content")
      .screenshot({ path: testInfo.outputPath("mobile-about-toggle.png") });
    await picturesTab.click();
    await expect(picturesTab).toHaveAttribute("aria-selected", "true");
    await expect(pictures).toBeVisible();
    await expect(about).not.toBeVisible();
    await page
      .locator(".public-listing-content")
      .screenshot({ path: testInfo.outputPath("mobile-pictures-toggle.png") });
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto(`/dashboard/events/${eventId}/edit`);

    // A closed tab can leave a reservation without its in-memory File. Reload
    // must let the organizer remove that orphan and approve the ready photos.
    const beforeOrphan = (await (
      await page.request.get(`/api/events/${eventId}`)
    ).json()) as EventResponse;
    const orphanReservation = await page.evaluate(
      async ({ endpoint, payload }) => {
        const response = await fetch(endpoint, {
          method: "POST",
          credentials: "same-origin",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        return {
          status: response.status,
          body: (await response.json()) as {
            reservation: { photoId: string };
          },
        };
      },
      {
        endpoint: `/api/events/${eventId}/photos/reserve`,
        payload: {
          expectedVersion: beforeOrphan.event.version,
          contentType: "image/jpeg",
          fileName: "interrupted-before-upload.jpg",
        },
      },
    );
    expect(orphanReservation.status).toBe(201);
    const orphanPhotoId = orphanReservation.body.reservation.photoId;
    expect(orphanPhotoId).toBeTruthy();
    expect(transferCounts.has("interrupted-before-upload.jpg")).toBe(false);

    await page.reload();
    await page.getByRole("button", { name: "Review", exact: true }).click();
    await page
      .getByLabel(
        /I accept publishing terms and approve this event for payment/,
      )
      .check();
    await expect(
      page.getByRole("button", { name: "Approve exact revision" }),
    ).toBeDisabled();
    await page.getByRole("button", { name: "Photos", exact: true }).click();
    const orphanRow = manager.locator(":scope > li[data-status='reserved']");
    await expect(orphanRow).toHaveCount(1);
    await expect(manager.locator(":scope > li")).toHaveCount(5);
    await expect(
      orphanRow.getByRole("button", { name: "Remove" }),
    ).toBeEnabled();
    await orphanRow.getByRole("button", { name: "Remove" }).click();
    await expect(orphanRow).toHaveCount(0);
    await expect(manager.locator(":scope > li")).toHaveCount(4);
    await expect(
      manager.locator(":scope > li[data-status='ready']"),
    ).toHaveCount(4);
    const recovered = (await (
      await page.request.get(`/api/events/${eventId}`)
    ).json()) as EventResponse;
    const recoveredActivePhotos = recovered.event.photos.filter(
      (photo) => photo.errorCode !== "MEDIA_DELETION_PENDING",
    );
    expect(recoveredActivePhotos).toHaveLength(4);
    expect(
      recoveredActivePhotos.every((photo) => photo.status === "READY"),
    ).toBe(true);
    expect(
      recoveredActivePhotos.some((photo) => photo.id === orphanPhotoId),
    ).toBe(false);
    await expect(cover).toHaveAttribute("src", selectedCoverUrl!);
    await page.getByRole("button", { name: "Save and continue" }).click();
    await expect(
      page.getByRole("heading", { name: "Review, approval and payment" }),
    ).toBeVisible();
    await page
      .getByLabel(
        /I accept publishing terms and approve this event for payment/,
      )
      .check();
    await expect(
      page.getByRole("button", { name: "Approve exact revision" }),
    ).toBeEnabled();
  } finally {
    releaseSlowUpload();
    await page.unrouteAll({ behavior: "wait" });
  }
});
