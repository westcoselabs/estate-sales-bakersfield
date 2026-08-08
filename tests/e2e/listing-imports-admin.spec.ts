import { readFile } from "node:fs/promises";
import path from "node:path";

import { expect, test, type Page } from "@playwright/test";

import { PrismaClient } from "@/generated/prisma/client";
import { listingContentHash } from "@/modules/listing-imports/application/content-hash";
import { normalizeListingContent } from "@/modules/listing-imports/domain/normalization";
import { createNeonAdapter } from "@/platform/database/neon-adapter";
import { requireIsolatedTestDatabase } from "../../scripts/test-database-safety";

interface CapturedEmail {
  readonly kind: "EMAIL_VERIFICATION";
  readonly to: string;
  readonly actionUrl: string;
}

const capturePath = path.resolve(".tmp/e2e-auth-emails.jsonl");
const runId = process.env.TEST_RUN_ID;
if (!runId || !/^testrun-[a-z0-9-]+$/u.test(runId)) {
  throw new Error("Playwright requires a valid TEST_RUN_ID");
}
const database = requireIsolatedTestDatabase();

async function registerAndVerify(
  page: Page,
  input: {
    readonly email: string;
    readonly name: string;
    readonly password: string;
  },
) {
  await page.goto("/signup");
  await page.getByLabel("Display name").fill(input.name);
  await page.getByLabel("Email", { exact: true }).fill(input.email);
  await page.getByLabel("Password", { exact: true }).fill(input.password);
  await page.getByLabel("Confirm password").fill(input.password);
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.getByText(/verification instructions/i)).toBeVisible();

  let captured: CapturedEmail | undefined;
  await expect
    .poll(async () => {
      const messages = (await readFile(capturePath, "utf8").catch(() => ""))
        .split(/\r?\n/u)
        .filter(Boolean)
        .map((line) => JSON.parse(line) as CapturedEmail);
      captured = messages
        .filter((message) => message.to === input.email)
        .at(-1);
      return Boolean(captured);
    })
    .toBe(true);

  const action = new URL(captured!.actionUrl);
  await page.goto(`${action.pathname}${action.search}`);
  await page.getByRole("button", { name: "Verify email" }).click();
}

async function login(page: Page, email: string, password: string) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
}

function manualImportEnvelope(suffix: string) {
  const item = {
    sourceListingId: `e2e-${suffix}`,
    sourceUrl: `https://fixture.invalid/listings/e2e-${suffix}`,
    retrievedAt: "2026-08-07T16:00:00.000Z",
    contentHash: "",
    eventType: "ESTATE_SALE" as const,
    title: "E2E Fixture Estate Sale",
    description:
      "A deterministic browser fixture with furniture, books, and household goods.",
    localStartsAt: "2026-09-12T09:00",
    localEndsAt: "2026-09-13T15:00",
    timezone: "America/Los_Angeles",
    addressLine1: "101 Example Avenue",
    addressLine2: null,
    city: "Bakersfield",
    region: "CA",
    postalCode: "93301",
    countryCode: "US",
    privacyMode: "APPROXIMATE_LOCATION" as const,
  };
  const normalized = normalizeListingContent(item);
  return {
    contractVersion: "listing-import.v1",
    sourceKey: "fixture",
    ingestorRunId: `e2e-run-${suffix}`,
    ingestorInstanceId: `e2e-instance-${suffix}`,
    parserVersion: "e2e-fixture@1.0.0",
    items: [{ ...item, contentHash: listingContentHash(normalized) }],
  };
}

test("reviews a manual listing import and manages a one-time ingestion credential", async ({
  page,
}) => {
  test.setTimeout(240_000);
  const suffix = crypto.randomUUID().replaceAll("-", "").slice(0, 20);
  const email = `${runId}-imports-${suffix}@example.test`;
  const password = "listing-imports-browser-password";
  const credentialName = `Local importer ${suffix.slice(0, 6)}`;
  const reviewedTitle = `Reviewed Estate Sale ${suffix.slice(0, 6)}`;
  const publishedTitle = `${reviewedTitle} Published`;
  const prisma = new PrismaClient({
    adapter: createNeonAdapter(database.directUrl),
  });

  try {
    await registerAndVerify(page, {
      email,
      name: "Listing import administrator",
      password,
    });
    const administrator = await prisma.user.findUniqueOrThrow({
      where: { normalizedEmail: email },
    });
    await prisma.$transaction(async (transaction) => {
      await transaction.user.update({
        where: { id: administrator.id },
        data: { role: "SUPER_ADMIN" },
      });
      await transaction.session.deleteMany({
        where: { userId: administrator.id },
      });
      await transaction.auditEntry.create({
        data: {
          actorUserId: administrator.id,
          action: "SUPER_ADMIN_PROVISIONED",
          targetType: "USER",
          targetId: administrator.id,
          metadata: { source: "GUARDED_LISTING_IMPORT_E2E_FIXTURE" },
        },
      });
    });
    await login(page, email, password);
    await expect(page).toHaveURL(/\/dashboard$/u);
    await page.goto("/admin/imports");
    await expect(
      page.getByRole("heading", { name: "Listing Imports" }),
    ).toBeVisible();
    const desktopNavigation = page.getByRole("navigation", {
      name: "Admin navigation",
    });
    await expect(desktopNavigation.getByRole("link")).toHaveCount(5);
    await expect(
      desktopNavigation.getByRole("link", { name: "Imports" }),
    ).toHaveAttribute("aria-current", "page");
    await expect(
      page.getByRole("navigation", { name: "Listing import views" }),
    ).toContainText("Pending candidates");
    await expect(
      page.getByRole("heading", { name: "No pending candidates" }),
    ).toBeVisible();

    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/admin/imports?view=credentials");
    await expect(page).toHaveURL(/view=credentials/u);
    const mobileNavigation = page.getByRole("navigation", {
      name: "Mobile admin navigation",
    });
    await expect(mobileNavigation).toBeVisible();
    await expect(mobileNavigation.getByRole("link")).toHaveCount(5);
    await expect(mobileNavigation).toContainText("Imports");
    const importViews = page.getByRole("navigation", {
      name: "Listing import views",
    });
    const activeCredentialTab = importViews.getByRole("link", {
      name: /Credentials/u,
    });
    await expect(activeCredentialTab).toHaveAttribute("aria-current", "page");
    await expect
      .poll(async () =>
        activeCredentialTab.evaluate((activeTab) => {
          const navigation = activeTab.parentElement;
          if (!navigation) return false;
          const navigationRect = navigation.getBoundingClientRect();
          const activeRect = activeTab.getBoundingClientRect();
          return (
            activeRect.left >= navigationRect.left &&
            activeRect.right <= navigationRect.right
          );
        }),
      )
      .toBe(true);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
    await page.setViewportSize({ width: 1280, height: 720 });
    await expect(
      page.getByText("No ingestion credentials have been created."),
    ).toBeVisible();
    await page.getByRole("button", { name: "Create credential" }).click();
    const createDialog = page.getByRole("dialog", {
      name: "Create ingestion credential",
    });
    await createDialog.getByLabel("Credential name").fill(credentialName);
    await createDialog.getByLabel("Source").selectOption("fixture");
    await createDialog.getByLabel("Your password").fill(password);
    await createDialog
      .getByRole("button", { name: "Create credential" })
      .click();
    const tokenDialog = page.getByRole("dialog", {
      name: `Copy ${credentialName} now`,
    });
    await expect(
      tokenDialog.getByRole("heading", {
        name: `Copy ${credentialName} now`,
      }),
    ).toBeVisible();
    const rawToken = await tokenDialog
      .locator(".admin-copy-id code")
      .innerText();
    expect(rawToken).toMatch(/^esb_ing_[A-Za-z0-9_-]{43}$/u);
    await tokenDialog
      .getByRole("button", { name: "I have copied the token" })
      .click();
    await expect(page.getByText(rawToken, { exact: true })).toHaveCount(0);
    await expect(
      page.getByRole("cell", { name: credentialName, exact: true }),
    ).toBeVisible();

    const storedCredential =
      await prisma.listingIngestionCredential.findFirstOrThrow({
        where: { name: credentialName },
        select: { id: true, tokenDigest: true },
      });
    expect(storedCredential.tokenDigest).not.toContain(rawToken);
    await page
      .getByRole("button", { name: `Revoke credential ${credentialName}` })
      .click();
    const revokeDialog = page.getByRole("dialog", {
      name: `Revoke ${credentialName}?`,
    });
    await revokeDialog.getByLabel("Your password").fill(password);
    await revokeDialog
      .getByRole("button", { name: "Revoke credential" })
      .click();
    await expect(page.getByText("Credential revoked.")).toBeVisible();
    await expect(
      page.getByRole("row", { name: new RegExp(credentialName, "u") }),
    ).toContainText("Revoked");

    await page.getByRole("link", { name: "New manual import" }).click();
    await expect(
      page.getByRole("heading", { name: "Manual import" }),
    ).toBeVisible();
    await page
      .getByLabel("Or paste the JSON envelope")
      .fill(JSON.stringify(manualImportEnvelope(suffix)));
    await page.getByLabel("Confirm your password").fill(password);
    await page.getByRole("button", { name: "Import for review" }).click();
    await expect(page).toHaveURL(/\/admin\/imports\/batches\/[0-9a-f-]+$/u);
    await expect(
      page.getByRole("heading", { name: /Batch [0-9a-f]{8}/u }),
    ).toBeVisible();
    await expect(page.getByText("e2e-fixture@1.0.0")).toBeVisible();
    await expect(
      page.getByRole("cell", { name: "Candidate created" }),
    ).toBeVisible();
    await page.getByRole("link", { name: "Review candidate" }).click();
    await expect(
      page.getByRole("heading", { name: "E2E Fixture Estate Sale" }),
    ).toBeVisible();
    await expect(page.getByText("Location required")).toBeVisible();
    await expect(
      page.getByText("No probable duplicate targets are currently recorded."),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Approve listing" }),
    ).toBeDisabled();

    const candidateTitle = page.getByLabel("Title");
    const approveButton = page.getByRole("button", {
      name: "Approve listing",
    });
    const refreshDuplicatesButton = page.getByRole("button", {
      name: "Refresh duplicates",
    });
    const rejectButton = page.getByRole("button", { name: "Reject" });
    const deleteButton = page.getByRole("button", {
      name: "Delete candidate",
    });
    const confirmLocationButton = page.getByRole("button", {
      name: "Confirm saved location",
    });
    await confirmLocationButton.click();
    await expect(page.getByText("Location confirmed")).toBeVisible();
    await expect(approveButton).toBeEnabled();

    await candidateTitle.fill(`${reviewedTitle} unsaved`);
    await expect(
      page.getByText("Save or discard your changes before continuing review."),
    ).toBeVisible();
    for (const control of [
      approveButton,
      refreshDuplicatesButton,
      rejectButton,
      deleteButton,
      confirmLocationButton,
    ]) {
      await expect(control).toBeDisabled();
    }
    await page.getByRole("button", { name: "Discard changes" }).click();
    await expect(candidateTitle).toHaveValue("E2E Fixture Estate Sale");
    await expect(
      page.getByRole("heading", { name: "Edit candidate" }),
    ).toBeFocused();
    await expect(approveButton).toBeEnabled();
    await expect(refreshDuplicatesButton).toBeEnabled();
    await expect(rejectButton).toBeEnabled();
    await expect(deleteButton).toBeEnabled();
    await expect(confirmLocationButton).toBeEnabled();

    await candidateTitle.fill(reviewedTitle);
    await expect(approveButton).toBeDisabled();
    await expect(refreshDuplicatesButton).toBeDisabled();
    await page.getByRole("button", { name: "Save changes" }).click();
    await expect(
      page.getByRole("heading", { name: reviewedTitle, exact: true }),
    ).toBeVisible();
    await expect(candidateTitle).toHaveValue(reviewedTitle);
    await expect(approveButton).toBeEnabled();
    await expect(refreshDuplicatesButton).toBeEnabled();

    await page.getByRole("button", { name: "Approve listing" }).click();
    const approveDialog = page.getByRole("dialog", {
      name: `Approve ${reviewedTitle}?`,
    });
    await approveDialog.getByLabel("Your password").fill(password);
    await approveDialog.getByRole("button", { name: "Confirm" }).click();
    await expect(page).toHaveURL(/\/admin\/imports\/listings\/[0-9a-f-]+$/u);
    await expect(
      page.getByRole("heading", { name: reviewedTitle, exact: true }),
    ).toBeVisible();
    await expect(page.getByText(/Unclaimed/u).first()).toBeVisible();
    await expect(
      page.getByText("published", { exact: true }).first(),
    ).toBeVisible();

    const listingId = page.url().split("/").at(-1)!;
    const published = await prisma.externalListing.findUniqueOrThrow({
      where: { id: listingId },
      select: {
        candidateId: true,
        publicId: true,
        status: true,
        location: { select: { confirmationStatus: true } },
      },
    });
    expect(published).toMatchObject({
      status: "PUBLISHED",
      location: { confirmationStatus: "CONFIRMED" },
    });
    await expect
      .poll(async () =>
        Promise.all([
          prisma.organizerProfile.count({
            where: { userId: administrator.id },
          }),
          prisma.paymentAttempt.count({
            where: { userId: administrator.id },
          }),
          prisma.event.count({ where: { publicId: published.publicId } }),
          prisma.eventPublication.count({
            where: { publicId: published.publicId },
          }),
        ]),
      )
      .toEqual([0, 0, 0, 0]);

    await page.getByLabel("Title").fill(publishedTitle);
    await page.getByRole("button", { name: "Save listing" }).click();
    await expect(
      page.getByRole("heading", { name: publishedTitle, exact: true }),
    ).toBeVisible();

    await page.getByRole("button", { name: "Remove listing" }).click();
    const removeDialog = page.getByRole("dialog", {
      name: `Remove ${publishedTitle}?`,
    });
    await removeDialog
      .getByLabel("Removal reason")
      .fill("Completed Listing Imports browser lifecycle fixture");
    await removeDialog
      .getByLabel(`Enter ${publishedTitle} or REMOVE`)
      .fill("REMOVE");
    await removeDialog.getByLabel("Your password").fill(password);
    await removeDialog.getByRole("button", { name: "Confirm removal" }).click();
    await expect(
      page.getByText("Listing removed from public discovery."),
    ).toBeVisible();
    await expect(
      page.getByText("removed", { exact: true }).first(),
    ).toBeVisible();
    await expect
      .poll(async () =>
        prisma.externalListing.findUnique({
          where: { id: listingId },
          select: { status: true },
        }),
      )
      .toEqual({ status: "REMOVED" });
  } finally {
    await prisma.$disconnect();
  }
});
