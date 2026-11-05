import { expect, test } from "@playwright/test";
import { PrismaClient } from "@/generated/prisma/client";
import { createNeonAdapter } from "@/platform/database/neon-adapter";
import { Argon2PasswordHasher } from "@/modules/auth/infrastructure/argon2-password-hasher";
import { requireIsolatedTestDatabase } from "../../scripts/test-database-safety";
import { createCampaignListing } from "../support/campaign-fixture";

test("saves a branded campaign draft with an imported attendee audience and no send controls", async ({
  page,
}, testInfo) => {
  test.setTimeout(120_000);
  const database = requireIsolatedTestDatabase();
  const prisma = new PrismaClient({
    adapter: createNeonAdapter(database.directUrl),
  });
  const email = `${process.env.TEST_RUN_ID}-${crypto.randomUUID()}@example.test`;
  const password = "campaign-draft-browser-password";
  const admin = await prisma.user.create({
    data: {
      displayName: "Campaign administrator",
      email,
      normalizedEmail: email,
      passwordHash: await new Argon2PasswordHasher().hash(password),
      role: "SUPER_ADMIN",
      emailVerifiedAt: new Date(),
    },
  });
  await createCampaignListing(prisma, admin.id);
  const tag = "Simply Decorated test";
  await prisma.audienceContact.createMany({
    data: ["SUBSCRIBED", "SUBSCRIBED", "UNSUBSCRIBED", "CLEANED"].map(
      (status) => ({
        email: `${crypto.randomUUID()}@example.test`,
        category: "ATTENDEE",
        sourceTags: [tag],
        status,
        consentConfirmedAt: new Date(),
      }),
    ),
  });
  const beforeJobs = await prisma.durableJob.count();
  const html =
    '<html><body style="background:#f7f4eb;color:#173a2d"><h1>Simply Decorated: nearly 150 photos</h1><p>Explore the estate sale in Bakersfield.</p><p>9208 Alki Ct, Bakersfield, CA 93312</p><a href="{{{RESEND_UNSUBSCRIBE_URL}}}">Unsubscribe</a></body></html>';
  try {
    await page.goto("/login");
    await page.getByLabel("Email", { exact: true }).fill(email);
    await page.getByLabel("Password", { exact: true }).fill(password);
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await expect(page).toHaveURL(/\/dashboard/);
    await page.goto("/admin/email/campaigns/new");
    await page
      .getByLabel("Internal campaign name")
      .fill("Simply Decorated attendee draft");
    await page
      .getByLabel("Email subject", { exact: true })
      .fill("Nearly 150 photos to explore");
    await page
      .getByLabel("Inbox preview text")
      .fill("Browse the Simply Decorated sale.");
    await page
      .getByRole("combobox", { name: "Email content", exact: true })
      .selectOption("html");
    await page.getByRole("textbox", { name: /^Email HTML/ }).fill(html);
    await page
      .getByRole("button", { name: "Imported contacts", exact: true })
      .click();
    await page
      .getByRole("combobox", { name: "Contact audience", exact: true })
      .selectOption(JSON.stringify(["ATTENDEE", tag]));
    await expect(page.getByRole("status")).toContainText("2 eligible contacts");
    await page
      .getByRole("button", { name: "Save campaign draft", exact: true })
      .click();
    await expect(page).toHaveURL(/\/admin\/email\/campaigns\/[0-9a-f-]{36}$/);
    await expect(
      page.getByRole("heading", {
        name: "Simply Decorated attendee draft",
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      page.getByText("2 eligible · 2 suppressed or ineligible · 4 total", {
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Queue campaign", exact: true }),
    ).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: "Send owner test", exact: true }),
    ).toHaveCount(0);
    await expect(
      page
        .frameLocator('iframe[title="Campaign email preview"]')
        .getByRole("heading", { name: "Simply Decorated: nearly 150 photos" }),
    ).toBeVisible();
    await page
      .getByLabel("Subject", { exact: true })
      .fill("Simply Decorated: photo preview");
    await page
      .getByRole("button", { name: "Save campaign details", exact: true })
      .click();
    await expect(
      page.getByText("Simply Decorated: photo preview", { exact: true }),
    ).toBeVisible();
    const id = page.url().split("/").at(-1)!;
    await page
      .getByRole("textbox", { name: "Test recipient email", exact: true })
      .fill("preview@example.test");
    await page
      .getByRole("button", { name: "Send test email", exact: true })
      .click();
    await expect(
      page
        .getByRole("status")
        .filter({ hasText: "Test submitted to preview@example.test" }),
    ).toContainText("Reference: capture-");
    expect(
      await prisma.emailCampaign.findUniqueOrThrow({ where: { id } }),
    ).toMatchObject({
      status: "DRAFT",
      selectionMode: "CONTACT_SEGMENT",
      contactCategory: "ATTENDEE",
      contactSourceTag: tag,
      testedAt: null,
      sentAt: null,
      providerBroadcastId: null,
    });
    expect(await prisma.durableJob.count()).toBe(beforeJobs);
    await expect(
      page
        .frameLocator('iframe[title="Campaign email preview"]')
        .getByRole("heading", { name: "Simply Decorated: nearly 150 photos" }),
    ).toBeVisible();
    await page.screenshot({
      path: testInfo.outputPath("campaign-contact-draft-desktop.png"),
      fullPage: true,
    });
    await page.setViewportSize({ width: 390, height: 844 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: testInfo.outputPath("campaign-contact-draft-mobile.png"),
      fullPage: true,
    });
  } finally {
    await prisma.$disconnect();
  }
});
